import {
  currentForm,
  getSlot,
  hasActive,
  nextEmptyBench,
  occupiedBench,
  opponent,
  pokemonInPlay,
  sameSlot,
} from "./board.js"
import { Action, Op, type ActionFrame, type Expr, type SelectFilter, type SelectPick } from "./dsl.js"
import { cardEffect } from "./effects.js"
import { canPayEnergyCost, surveyCards } from "./survey.js"
import { DAMAGE_COUNTER, Phase } from "./types.js"
import type { GameState, Slot, SlotId } from "./types.js"

export { Action } from "./dsl.js"

// Shared by every listed choice: expr is what interpret runs; seed fills $binds first (attacker, defending, …)
type ActionBase = {
  expr: Expr
  seed?: Record<string, unknown>
}

export type AvailableAction =
  | (ActionBase & { kind: Action.PlayActive; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.PlayBench; player: 1 | 2; card: string; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.AttachEnergy; player: 1 | 2; card: string; slot: SlotId })
  | (ActionBase & { kind: Action.Evolve; player: 1 | 2; card: string; slot: SlotId })
  | (ActionBase & { kind: Action.Attack; player: 1 | 2; name: string })
  | (ActionBase & { kind: Action.Ability; player: 1 | 2; name: string; slot: SlotId })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: SelectPick; slot: SlotId })
  | (ActionBase & { kind: Action.Promote; player: 1 | 2; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.Ready; player: 1 | 2 })
  | (ActionBase & { kind: Action.EndTurn; player: 1 | 2 })


export function computeAvailableActions(gamestate: GameState): AvailableAction[] {
  // If action stack has any length, this was a paused state for selection
  if (gamestate.actionStack.length > 0) return computeSelect(gamestate)
  switch (gamestate.phase) {
    case Phase.Init:
      return computeInit(gamestate)
    case Phase.Turn:
      return computeTurn(gamestate)
    default:
      return []
  }
}

// Select — only answers for the paused frame
function computeSelect(gamestate: GameState): AvailableAction[] {
  const frame = gamestate.actionStack.at(-1)
  if (!frame) return []
  switch (frame.pick) {
    case "slots":
      return selectSlots(gamestate, frame)
    case "cards":
      return []
    case "attacks":
      return []
  }
}

function selectSlots(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "slots" }>
): AvailableAction[] {
  const player = frame.who === "self" ? frame.player : opponent(frame.player)
  const filters = [frame.filter ?? []].flat()
  const actions: AvailableAction[] = []
  for (const slotId of pokemonInPlay(gamestate, player)) {
    if (!slotMatches(gamestate, slotId, filters, frame.bindings)) continue
    actions.push({ kind: Action.Choose, player: frame.player, pick: frame.pick, slot: slotId, expr: [] })
  }
  return actions
}

// May this SlotId appear as Action.Choose for a paused pick:"slots" Select?
// Survey filters cards in a zone / slot attachment. This filters in-play slots:
// read the Slot via getSlot, then each SelectFilter (damage counters, would-KO,
// other_than a bound SlotId). Compute only; not a board helper.
function slotMatches(
  gamestate: GameState,
  slotId: SlotId,
  filters: SelectFilter[],
  bindings: Record<string, unknown>
): boolean {
  const slot = getSlot(gamestate, slotId)
  for (const filter of filters) {
    switch (filter.kind) {
      case "has_counters":
        if (slot.damage < filter.counters * DAMAGE_COUNTER) return false
        break
      case "survives_counters": {
        const hp = Number(currentForm(gamestate, slot)?.hp)
        const extra = filter.counters * DAMAGE_COUNTER
        if (!Number.isFinite(hp) || slot.damage + extra >= hp) return false
        break
      }
      case "other_than": {
        const bound = bindings[filter.bind]
        if (bound && sameSlot(slotId, bound as SlotId)) return false
        break
      }
    }
  }
  return true
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
        source: { player, zone: "hand" },
        dest: { player, slot: "active", attachment: "evolution" },
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
        source: { player, zone: "hand" },
        dest: { player, slot: "bench", index, attachment: "evolution" },
      },
    ],
  }))
}

// Energy — one attach per turn, each energy in hand × each Pokémon in play
function placeEnergy(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.energyAttachedThisTurn) return []
  return energyInHand(gamestate, player).flatMap((card) =>
    pokemonInPlay(gamestate, player).map((slot) => ({
      kind: Action.AttachEnergy,
      player,
      card,
      slot,
      expr: [
        {
          op: Op.MoveZoneToSlot,
          card,
          source: { player, zone: "hand" },
          dest: { ...slot, attachment: "energy" },
        },
      ],
    }))
  )
}

// Evolve — hand card whose evolvesFrom matches the current form; skip slots that evolved this turn
function placeEvolve(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const actions: AvailableAction[] = []
  for (const slotId of pokemonInPlay(gamestate, player)) {
    const slot = getSlot(gamestate, slotId)
    if (slot.evolvedThisTurn) continue
    const form = currentForm(gamestate, slot)
    const name = form?.name
    if (!name) continue
    for (const card of surveyCards(gamestate, { player, zone: "hand" }, { kind: "evolves_from", name })) {
      actions.push({
        kind: Action.Evolve,
        player,
        card,
        slot: slotId,
        expr: [
          {
            op: Op.MoveZoneToSlot,
            card,
            source: { player, zone: "hand" },
            dest: { ...slotId, attachment: "evolution" },
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
  for (const slotId of pokemonInPlay(gamestate, player)) {
    const slot = getSlot(gamestate, slotId)
    const form = currentForm(gamestate, slot)
    if (!form) continue
    for (const ability of form.abilities ?? []) {
      if (ability.type === "Pokémon Power" && pokemonPowerBlocked(slot)) continue
      actions.push({
        kind: Action.Ability,
        player,
        name: ability.name,
        slot: slotId,
        expr: cardEffect(form.sourceId, "abilities", ability.name),
        seed: { $self_slot: slotId },
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
    { op: Op.Attack, base, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
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
