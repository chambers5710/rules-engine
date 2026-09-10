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
import { Action, Op, type ActionFrame, type Expr, type SelectFilter } from "./dsl.js"
import { attackExpr, cardEffect, trainerEffect } from "./effects.js"
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
  | (ActionBase & { kind: Action.PlayTrainer; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "slots"; slot: SlotId })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "cards"; card: string })
  | (ActionBase & { kind: Action.Choose; player: 1 | 2; pick: "attacks"; name: string })
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
      return selectCards(gamestate, frame)
    case "attacks":
      return selectAttacks(gamestate, frame)
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
    actions.push({ kind: Action.Choose, player: frame.player, pick: "slots", slot: slotId, expr: [] })
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
      case "pays":
        break
      case "has_type": {
        const types = currentForm(gamestate, slot)?.types ?? []
        if (!types.includes(filter.type)) return false
        break
      }
      case "energy":
      case "basic_pokemon":
      case "evolves_from":
      case "trainer":
      case "pokemon":
        break
    }
  }
  return true
}

function selectCards(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "cards" }>
): AvailableAction[] {
  const filters = [frame.filter ?? []].flat()
  const pays = filters.find((filter) => filter.kind === "pays")
  const need = pays ? frame.bindings[pays.bind] : undefined
  const survey = filters.find(
    (filter) =>
      filter.kind === "energy" ||
      filter.kind === "basic_pokemon" ||
      filter.kind === "evolves_from" ||
      filter.kind === "trainer" ||
      filter.kind === "pokemon"
  )
  const cards = surveyCards(gamestate, frame.source, survey)
  const values = cards.map((card) => gamestate.cardRegistry[card]?.energyValue ?? 0)
  const actions: AvailableAction[] = []
  for (let i = 0; i < cards.length; i++) {
    const value = values[i]
    if (typeof need === "number") {
      if (value <= 0 || value > need) continue
      const rest = values.filter((_, j) => j !== i)
      if (!canSum(rest, need - value)) continue
    }
    actions.push({ kind: Action.Choose, player: frame.player, pick: "cards", card: cards[i], expr: [] })
  }
  return actions
}

function selectAttacks(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "attacks" }>
): AvailableAction[] {
  const form = currentForm(gamestate, getSlot(gamestate, frame.slot))
  return (form?.attacks ?? []).map((attack) => ({
    kind: Action.Choose,
    player: frame.player,
    pick: "attacks" as const,
    name: attack.name,
    expr: [],
  }))
}

function canSum(values: number[], target: number): boolean {
  if (target === 0) return true
  const ok = new Set([0])
  for (const value of values) {
    for (const sum of [...ok]) {
      if (sum + value === target) return true
      if (sum + value < target) ok.add(sum + value)
    }
  }
  return ok.has(target)
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
    ...playTrainer(gamestate, player),
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
          dest: slot,
          attachment: "energy",
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
            dest: slotId,
            attachment: "evolution",
          },
        ],
      })
    }
  }
  return actions
}

// Trainer — one play per copy in hand. Discard is the play; effects[id] is the text.
function playTrainer(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const hand = { player, zone: "hand" } as const
  const discard = { player, zone: "discard" } as const
  const active = { player, slot: "active" } as const
  return surveyCards(gamestate, hand, { kind: "trainer" }).map((card) => ({
    kind: Action.PlayTrainer,
    player,
    card,
    expr: [
      { op: Op.MoveZoneToZone, card, source: hand, dest: discard, position: "bottom" },
      ...trainerEffect(gamestate.cardRegistry[card].sourceId),
    ],
    seed: {
      $self_slot: active,
      $defending: { player: opponent(player), slot: "active" },
      $hand: hand,
      $deck: { player, zone: "deck" },
      $discard: discard,
      $opp_hand: { player: opponent(player), zone: "hand" },
      $opp_deck: { player: opponent(player), zone: "deck" },
      $opp_discard: { player: opponent(player), zone: "discard" },
    },
  }))
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
        seed: { $self_slot: slotId, $hand: { player, zone: "hand" } },
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
  return s.asleep || s.paralyzed|| s.confused 
}

function attackOrRetreatBlocked(slot: Slot): boolean {
  return slot.status.asleep || slot.status.paralyzed
}

// Attack — payable costs only; seed aims $self_slot / $defending for the expr
function attacksFromActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const active = gamestate.players[player].active
  if (attackOrRetreatBlocked(active)) return []
  const form = currentForm(gamestate, active)
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
        $defending: { player: defending, slot: "active" },
        $energy: { ...slot, attachment: "energy" },
        $discard: { player, zone: "discard" },
        $opp_discard: { player: defending, zone: "discard" },
      },
    }))
}

// Retreat — pay energy value on Active, then swap with a benched Pokémon.
function retreatFromActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.retreatedThisTurn) return []
  if (occupiedBench(gamestate, player).length === 0) return []
  const active = gamestate.players[player].active
  if (attackOrRetreatBlocked(active)) return []
  const slot = { player, slot: "active" } as const
  const form = currentForm(gamestate, active)
  if (!form) return []
  const cost = form.retreatCost ?? []
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
