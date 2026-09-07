import {
  currentForm,
  getSlot,
  hasActive,
  nextEmptyBench,
  occupiedBench,
  opponent,
  pokemonInPlay,
  type InPlaySlot,
} from "./board.js"
import { Op, type Expr } from "./dsl.js"
import { cardEffect } from "./effects.js"
import { canPayEnergyCost, surveyCards } from "./survey.js"
import type { GameState, Slot, SlotId } from "./types.js"
import { Phase } from "./types.js"

// Action — every top-level choice the client can make
export enum Action {
  PlayActive = "play_active",
  PlayBench = "play_bench",
  AttachEnergy = "attach_energy",
  Evolve = "evolve",
  Attack = "attack",
  Ability = "ability",
  Retreat = "retreat",
  Promote = "promote",
  Ready = "ready",
  EndTurn = "end_turn"
}

// Shared by every listed choice: expr is what interpret runs; seed fills $binds first (attacker, defending, …)
type ActionBase = {
  expr: Expr
  seed?: Record<string, unknown>
}

export type AvailableAction =
  | (ActionBase & { kind: Action.PlayActive; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.PlayBench; player: 1 | 2; card: string; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.AttachEnergy; player: 1 | 2; card: string; to: InPlaySlot })
  | (ActionBase & { kind: Action.Evolve; player: 1 | 2; card: string; to: InPlaySlot })
  | (ActionBase & { kind: Action.Attack; player: 1 | 2; name: string })
  | (ActionBase & { kind: Action.Ability; player: 1 | 2; name: string; from: InPlaySlot })
  | (ActionBase & { kind: Action.Promote; player: 1 | 2; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.Ready; player: 1 | 2 })
  | (ActionBase & { kind: Action.EndTurn; player: 1 | 2 })


export function computeAvailableActions(gamestate: GameState): AvailableAction[] {
  switch (gamestate.phase) {
    case Phase.Init:
      return computeInit(gamestate)
    case Phase.Turn:
      return computeTurn(gamestate)
    default:
      return []
  }
}

// Init — Active first; then optional bench Basics plus Ready
function computeInit(gamestate: GameState): AvailableAction[] {
  const actions: AvailableAction[] = []

  for (const player of [1, 2] as const) {
    if (gamestate.setupReady[player]) continue

    if (!hasActive(gamestate, player)) {
      actions.push(...placeActive(gamestate, player))
      continue
    }

    actions.push(...placeBench(gamestate, player))
    actions.push({ kind: Action.Ready, player, expr: [] })
  }

  return actions
}

function computeTurn(gamestate: GameState): AvailableAction[] {
  const player = gamestate.activePlayer

  if (!hasActive(gamestate, player)) {
    return promoteFromBench(gamestate, player)
  }

  return [
    ...placeBench(gamestate, player),
    ...placeEnergy(gamestate, player),
    ...placeEvolve(gamestate, player),
    ...abilitiesInPlay(gamestate, player),
    ...attacksFromActive(gamestate, player),
    { kind: Action.EndTurn, player, expr: [] },
  ]
}

function placeActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (hasActive(gamestate, player)) return []
  return basicsInHand(gamestate, player).map((card) => ({
    kind: Action.PlayActive,
    player,
    card,
    expr: [
      {
        op: Op.MoveZoneToSlot,
        card,
        from: { player, zone: "hand" },
        to: { player, slot: "active", attachment: "evolution" },
      },
    ],
  }))
}

function placeBench(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const index = nextEmptyBench(gamestate, player)
  if (index === undefined) return []
  return basicsInHand(gamestate, player).map((card) => ({
    kind: Action.PlayBench,
    player,
    card,
    index,
    expr: [
      {
        op: Op.MoveZoneToSlot,
        card,
        from: { player, zone: "hand" },
        to: { player, slot: "bench", index, attachment: "evolution" },
      },
    ],
  }))
}

// Energy — one attach per turn, each energy in hand × each Pokémon in play
function placeEnergy(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.energyAttachedThisTurn) return []
  const dests = pokemonInPlay(gamestate, player)
  return energyInHand(gamestate, player).flatMap((card) =>
    dests.map((to) => ({
      kind: Action.AttachEnergy,
      player,
      card,
      to,
      expr: [
        {
          op: Op.MoveZoneToSlot,
          card,
          from: { player, zone: "hand" },
          to: { player, ...to, attachment: "energy" },
        },
      ],
    }))
  )
}

// Evolve — hand card whose evolvesFrom matches the current form; skip slots that evolved this turn
function placeEvolve(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const actions: AvailableAction[] = []
  for (const to of pokemonInPlay(gamestate, player)) {
    const slot = to.slot === "active"
      ? gamestate.players[player].active
      : gamestate.players[player].bench[to.index]
    if (slot.evolvedThisTurn) continue
    const form = currentForm(gamestate, slot)
    const name = form?.name
    if (!name) continue
    for (const card of surveyCards(gamestate, { player, zone: "hand" }, { kind: "evolves_from", name })) {
      actions.push({
        kind: Action.Evolve,
        player,
        card,
        to,
        expr: [
          {
            op: Op.MoveZoneToSlot,
            card,
            from: { player, zone: "hand" },
            to: { player, ...to, attachment: "evolution" },
          },
        ],
      })
    }
  }
  return actions
}

// Ability — each in-play Pokémon's printed powers; $self_slot is that copy
function abilitiesInPlay(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const actions: AvailableAction[] = []
  for (const from of pokemonInPlay(gamestate, player)) {
    const ref: SlotId = from.slot === "active"
      ? { player, slot: "active" }
      : { player, slot: "bench", index: from.index }
    const slot = getSlot(gamestate, ref)
    const form = currentForm(gamestate, slot)
    if (!form) continue
    for (const ability of form.abilities ?? []) {
      if (ability.type === "Pokémon Power" && pokemonPowerBlocked(slot)) continue
      actions.push({
        kind: Action.Ability,
        player,
        name: ability.name,
        from,
        expr: cardEffect(form.sourceId, "abilities", ability.name),
        seed: { $self_slot: ref },
      })
    }
  }
  return actions
}

// Pokémon Power (Base set) — cannot use if Asleep, Confused, or Paralyzed.
// That was the standard on these cards; later Abilities often do not share it.
// Do not parse ability text. Per-card evenIf (e.g. still usable while Asleep) comes later.
function pokemonPowerBlocked(slot: Slot): boolean {
  const s = slot.status
  return s.sleep || s.confused || s.paralyzed
}

// Attack — payable costs only; seed aims $self_slot / $defending for the expr
function attacksFromActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const form = currentForm(gamestate, gamestate.players[player].active)
  if (!form) return []
  const slot = { player, slot: "active" } as const
  const defending = opponent(player)
  return (form.attacks ?? [])
    .filter((attack) => canPayEnergyCost(gamestate, slot, attack.cost ?? []))
    .map((attack) => ({
      kind: Action.Attack,
      player,
      name: attack.name,
      expr: attackExpr(form.sourceId, attack),
      seed: {
        $self_slot: slot,
        // consider what happens if bench pokemon are able to take damage from an attack.
        $defending: { player: defending, slot: "active" },
      },
    }))
}

// Prefer a written card effect; otherwise printed damage through the attack pipeline
function attackExpr(sourceId: string, attack: { name: string; damage?: string | number | null }): Expr {
  const written = cardEffect(sourceId, "attacks", attack.name)
  if (written.length > 0) return written
  const raw = attack.damage == null ? "" : String(attack.damage).trim()
  const base = Number(raw.replace(/[^0-9.-]/g, ""))
  if (!raw || !Number.isFinite(base) || base <= 0) return []
  return [
    { op: Op.Attack, base, from: "$self_slot", to: "$defending", bind: "$damage" },
    { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
  ]
}

// Promote — only listed when Active is empty (after KO)
function promoteFromBench(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  return occupiedBench(gamestate, player).map((index) => ({
    kind: Action.Promote,
    player,
    index,
    expr: [],
  }))
}

function basicsInHand(gamestate: GameState, player: 1 | 2): string[] {
  return surveyCards(gamestate, { player, zone: "hand" }, { kind: "basic_pokemon" })
}

function energyInHand(gamestate: GameState, player: 1 | 2): string[] {
  return surveyCards(gamestate, { player, zone: "hand" }, { kind: "energy" })
}
