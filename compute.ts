import {
  attackSourceId,
  currentForm,
  getSlot,
  hasActive,
  needsPromote,
  nextEmptyBench,
  occupiedBench,
  opponent,
  pokemonInPlay,
} from "./board.js"
import { isStadium } from "./card.js"
import { Action, Op, type Expr } from "./dsl.js"
import { attackExpr, cardEffect, hasStadiumSpec, stadiumUseCappedThisTurn, stadiumUses, trainerAttaches, trainerEffect } from "./effects.js"
import { gatePasses } from "./interpret.js"
import { abilityBanned, attackBanned } from "./modifiers.js"
import { exprPlayable, selectChoices } from "./select.js"
import { attachEnergyTaxed, canAttack, canRetreat, mayAttachEnergy, mayEvolve, mayPlayTrainer, mayUsePokemonPower, powersSuppressed, retreatCost } from "./reads.js"
import { canPayEnergyCost, surveyCards } from "./survey.js"
import { Phase } from "./types.js"
import type { GameState, SlotId } from "./types.js"

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
  | (ActionBase & { kind: Action.PlayTrainer; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.PlayStadium; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.UseStadium; player: 1 | 2; card: string; name: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "slots"; slot: SlotId })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "cards"; card: string; hidden?: true; face?: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "attacks"; name: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "types"; name: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "names"; name: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "skip" })
  | (ActionBase & { kind: Action.Retreat; player: 1 | 2 })
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
    case Phase.Checkup:
      return computePromote(gamestate)
    default:
      return []
  }
}

// Select — only answers for the paused frame
function computeSelect(gamestate: GameState): AvailableAction[] {
  const frame = gamestate.actionStack.at(-1)
  if (!frame) return []
  return selectChoices(gamestate, frame)
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
  const filling = computePromote(gamestate)
  if (filling.length > 0) return filling
  return computePlay(gamestate, gamestate.activePlayer)
}

function computePromote(gamestate: GameState): AvailableAction[] {
  const player = gamestate.activePlayer
  const other = opponent(player)
  if (needsPromote(gamestate, player)) return promoteFromBench(gamestate, player)
  if (needsPromote(gamestate, other)) return promoteFromBench(gamestate, other)
  return []
}

function computePlay(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  return [
    ...placeBench(gamestate, player),
    ...placeEnergy(gamestate, player),
    ...placeEvolve(gamestate, player),
    ...playTrainer(gamestate, player),
    ...stadiumInPlay(gamestate, player),
    ...abilitiesInPlay(gamestate, player),
    ...attacksFromActive(gamestate, player),
    ...retreatFromActive(gamestate, player),
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
        dest: { player, slot: "active" },
        attachment: "evolution",
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
        dest: { player, slot: "bench", index },
        attachment: "evolution",
      },
    ],
  }))
}

// Energy — one attach per turn, each energy in hand × each Pokémon in play
function placeEnergy(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.energyAttachedThisTurn) return []
  const discard = { player, zone: "discard" as const }
  const actions: AvailableAction[] = []
  for (const card of energyInHand(gamestate, player)) {
    for (const slot of pokemonInPlay(gamestate, player)) {
      if (!mayAttachEnergy(gamestate, slot, card)) continue
      const expr: Expr = [
        {
          op: Op.MoveZoneToSlot,
          card,
          source: { player, zone: "hand" },
          dest: slot,
          attachment: "energy",
        },
      ]
      let seed: Record<string, unknown> | undefined
      if (attachEnergyTaxed(gamestate, slot, card)) {
        seed = { $self_slot: slot, $discard: discard }
        expr.push(
          {
            op: Op.Select,
            pick: "cards",
            source: "$self_slot",
            attachment: "energy",
            bind: "$tax",
          },
          {
            op: Op.MoveSlotToZone,
            card: "$tax",
            source: "$self_slot",
            attachment: "energy",
            dest: "$discard",
            position: "bottom",
          }
        )
      }
      actions.push({ kind: Action.AttachEnergy, player, card, slot, expr, seed })
    }
  }
  return actions
}

// Evolve — hand card whose evolvesFrom matches the current form; `mayEvolve` (first turn, evolvedThisTurn, block_evolve)
function placeEvolve(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const actions: AvailableAction[] = []
  for (const slotId of pokemonInPlay(gamestate, player)) {
    const slot = getSlot(gamestate, slotId)
    if (!mayEvolve(gamestate, player, slot)) continue
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
            dest: slotId,
            attachment: "evolution",
          },
        ],
      })
    }
  }
  return actions
}

// Trainer — one play per copy in hand. Discard is the play unless the expr lands the card (tool / play-as-Pokémon / Stadium).
function playTrainer(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (!mayPlayTrainer(gamestate, player)) return []
  const hand = { player, zone: "hand" } as const
  const discard = { player, zone: "discard" } as const
  const active = { player, slot: "active" } as const
  const actions: AvailableAction[] = []
  for (const card of surveyCards(gamestate, hand, { kind: "trainer" })) {
    const sourceId = gamestate.cardRegistry[card].sourceId
    const printed = gamestate.cardRegistry[card]
    const effect = trainerEffect(gamestate.effectRegistry, sourceId)
    const stadium = isStadium(printed) || hasStadiumSpec(gamestate.effectRegistry, sourceId)
    if (effect.length === 0 && !stadium) continue
    const kind = stadium ? Action.PlayStadium : Action.PlayTrainer
    const expr: Expr = stadium
      ? [{ op: Op.MoveZoneToStadium, card, source: hand }, ...effect]
      : trainerAttaches(gamestate.effectRegistry, sourceId)
        ? effect
        : [
            { op: Op.MoveZoneToZone, card, source: hand, dest: discard, position: "bottom" },
            ...effect,
          ]
    const seed = {
      $self_slot: active,
      $defending: { player: opponent(player), slot: "active" },
      $hand: hand,
      $deck: { player, zone: "deck" },
      $discard: discard,
      $opp_hand: { player: opponent(player), zone: "hand" },
      $opp_deck: { player: opponent(player), zone: "deck" },
      $opp_discard: { player: opponent(player), zone: "discard" },
      $played: card,
    }
    if (!exprPlayable(gamestate, expr, seed, player, kind)) continue
    actions.push({ kind, player, card, expr, seed })
  }
  return actions
}

// In-play Stadium uses — dump `stadium` map on the stuck card. Not PlayTrainer. Not a seat Power.
function stadiumInPlay(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const stuck = gamestate.stadium
  if (!stuck) return []
  const printed = gamestate.cardRegistry[stuck.card]
  if (!printed) return []
  const hand = { player, zone: "hand" } as const
  const actions: AvailableAction[] = []
  for (const row of stadiumUses(gamestate.effectRegistry, printed.sourceId)) {
    if (stadiumUseCappedThisTurn(row.limit) && gamestate.stadiumUsedThisTurn) continue
    const expr = row.then
    const seed = {
      $self_slot: { player, slot: "active" } as const,
      $hand: hand,
      $deck: { player, zone: "deck" },
      $discard: { player, zone: "discard" },
    }
    if (!exprPlayable(gamestate, expr, seed, player, Action.UseStadium)) continue
    actions.push({
      kind: Action.UseStadium,
      player,
      card: stuck.card,
      name: row.name,
      expr,
      seed,
    })
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
      if (ability.type === "Pokémon Power" && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
      const expr = cardEffect(gamestate.effectRegistry, form.sourceId, "abilities", ability.name)
      if (expr.length === 0) continue
      if (abilityBanned(slot, ability.name)) continue
      const seed = {
        $self_slot: slotId,
        $defending: { player: opponent(player), slot: "active" },
        $hand: { player, zone: "hand" },
        $deck: { player, zone: "deck" },
        $prize: { player, zone: "prize" },
        $opp_hand: { player: opponent(player), zone: "hand" },
        $opp_deck: { player: opponent(player), zone: "deck" },
        $opp_prize: { player: opponent(player), zone: "prize" },
      }
      if (!gatePasses(gamestate, expr, seed)) continue
      if (!exprPlayable(gamestate, expr, seed, player, Action.Ability)) continue
      actions.push({
        kind: Action.Ability,
        player,
        name: ability.name,
        slot: slotId,
        expr,
        seed,
      })
    }
  }
  return actions
}

// Attack — payable costs only; seed aims $self_slot / $defending for the expr
function attacksFromActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const active = gamestate.players[player].active
  const defending = opponent(player)
  const target = currentForm(gamestate, gamestate.players[defending].active)?.instanceId
  if (!canAttack(active, target)) return []
  const form = currentForm(gamestate, active)
  if (!form) return []
  const slot = { player, slot: "active" } as const
  return (form.attacks ?? [])
    .filter((attack) => canPayEnergyCost(gamestate, slot, attack.cost ?? []) && !attackBanned(active, attack.name))
    .flatMap((attack) => {
      const expr = attackExpr(gamestate.effectRegistry, attackSourceId(gamestate, player) ?? form.sourceId, attack)
      if (expr.length === 0) return []
      const seed = {
        $self_slot: slot,
        $defending: { player: defending, slot: "active" },
        $energy: { ...slot, attachment: "energy" },
        $hand: { player, zone: "hand" },
        $deck: { player, zone: "deck" },
        $discard: { player, zone: "discard" },
        $opp_deck: { player: defending, zone: "deck" },
        $opp_discard: { player: defending, zone: "discard" },
      }
      if (!gatePasses(gamestate, expr, seed)) return []
      if (!exprPlayable(gamestate, expr, seed, player, Action.Attack)) return []
      return [{ kind: Action.Attack, player, name: attack.name, expr, seed }]
    })
}

// Retreat — pay energy value on Active, then swap with a benched Pokémon.
function retreatFromActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.retreatedThisTurn) return []
  if (occupiedBench(gamestate, player).length === 0) return []
  const active = gamestate.players[player].active
  if (!canRetreat(gamestate, active)) return []
  const slot = { player, slot: "active" } as const
  if (!currentForm(gamestate, active)) return []
  const cost = retreatCost(gamestate, player)
  if (!canPayEnergyCost(gamestate, slot, cost)) return []
  const need = cost.length
  const energy = { ...slot, attachment: "energy" as const }
  const switchIn: Expr = [
    {
      op: Op.Select,
      pick: "slots",
      who: "self",
      bind: "$to",
      filter: { kind: "other_than", bind: "$self_slot" },
    },
    { op: Op.SwapActive, slot: "$to" },
  ]
  const pay: Expr = [
    { op: Op.Count, kind: "energy_value", slot: "$self_slot", attachment: "energy", bind: "$before" },
    {
      op: Op.Select,
      pick: "cards",
      source: energy,
      bind: "$pay",
      filter: { kind: "pays", bind: "$need" },
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: energy,
      dest: { player, zone: "discard" },
      position: "bottom",
    },
    { op: Op.Count, kind: "energy_value", slot: "$self_slot", attachment: "energy", bind: "$after" },
    { op: Op.Calc, fn: "sub", a: "$before", b: "$after", bind: "$paid" },
    { op: Op.Calc, fn: "sub", a: "$need", b: "$paid", bind: "$need" },
    { op: Op.Calc, fn: "max", a: "$need", b: 0, bind: "$need" },
  ]
  const expr: Expr = need > 0
    ? [{ op: Op.Loop, bind: "$need", until: 0, then: pay }, ...switchIn]
    : switchIn
  return [{
    kind: Action.Retreat,
    player,
    expr,
    seed: { $self_slot: slot, ...(need > 0 ? { $need: need } : {}) },
  }]
}

// Promote — only listed when Active is empty (mid-turn Scoop Up, or Checkup after KO)
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
