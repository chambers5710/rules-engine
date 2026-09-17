import { getSlot } from "./board.js"
import { clearFieldOverrides } from "./card.js"
import { Op } from "./dsl.js"
import { record } from "./history.js"
import { acceptsStatus, blocksDiscardToHand } from "./reads.js"
import { emptyStatus, withStatus } from "./status.js"
import type {
  CardInstanceId,
  GameState,
  Player,
  Slot,
  SlotId,
  SlotRef,
  Status,
  Zone,
  ZoneName,
  ZonePosition,
  ZoneRef,
} from "./types.js"

export function copySlot(slot: Slot): Slot {
  return {
    ...slot,
    evolution: [...slot.evolution],
    energy: [...slot.energy],
    tools: [...slot.tools],
    modifiers: slot.modifiers.map((modifier) => ({ ...modifier })),
    status: { ...slot.status },
  }
}

function copyPlayer(player: Player): Player {
  return {
    ...player,
    deck: [...player.deck],
    discard: [...player.discard],
    hand: [...player.hand],
    prize: [...player.prize],
    active: copySlot(player.active),
    bench: player.bench.map(copySlot),
  }
}

/** Clone listed players (both if omitted). Registry and other top-level maps stay shared. */
export function copy(gamestate: GameState, ...who: Array<1 | 2>): GameState {
  const ids = who.length === 0 ? ([1, 2] as const) : who
  const players = { ...gamestate.players }
  for (const id of new Set(ids)) {
    players[id] = copyPlayer(gamestate.players[id])
  }
  return { ...gamestate, players }
}

// Shuffle — Fisher–Yates in place; used by placeInZone("shuffle")
const shuffleZone = (zone: Zone) => {
  for (let i = zone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[zone[i], zone[j]] = [zone[j], zone[i]]
  }
}

// Place in zone — top unshifts, bottom pushes, shuffle lands then mixes
const placeInZone = (zone: Zone, position: ZonePosition, cardId: CardInstanceId) => {
  if (position === "top") {
    zone.unshift(cardId)
    return
  }
  zone.push(cardId)
  if (position === "shuffle") {
    shuffleZone(zone)
  }
}

// Zone to zone — take a card off one zone and place it on another
export const moveZoneToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: ZoneRef,
  dest: ZoneRef,
  position: ZonePosition
) => {
  const location = gamestate.players[source.player][source.zone]
  if (location.indexOf(cardId) === -1) {
    return gamestate
  }
  if (
    source.zone === "discard" &&
    dest.zone === "hand" &&
    dest.player === source.player &&
    blocksDiscardToHand(gamestate)
  ) {
    return record(gamestate, {
      op: Op.MoveZoneToZone,
      card: cardId,
      source,
      dest,
      position,
      prevented: true,
    })
  }

  const next = copy(gamestate, source.player, dest.player)
  const sourceZone = next.players[source.player][source.zone]
  const destZone = next.players[dest.player][dest.zone]
  sourceZone.splice(sourceZone.indexOf(cardId), 1)
  placeInZone(destZone, position, cardId)
  return record(clearFieldOverrides(next, cardId), {
    op: Op.MoveZoneToZone,
    card: cardId,
    source,
    dest,
    position,
  })
}

export const moveZoneToStadium = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: ZoneRef
) => {
  const location = gamestate.players[source.player][source.zone]
  if (location.indexOf(cardId) === -1) {
    return gamestate
  }

  const prev = gamestate.stadium
  const next = copy(gamestate, source.player, ...(prev ? [prev.player] : []))
  const sourceZone = next.players[source.player][source.zone]
  sourceZone.splice(sourceZone.indexOf(cardId), 1)
  let discarded: { card: CardInstanceId; player: 1 | 2 } | undefined
  if (prev) {
    placeInZone(next.players[prev.player].discard, "bottom", prev.card)
    discarded = { card: prev.card, player: prev.player }
  }
  next.stadium = { card: cardId, player: source.player }
  next.stadiumUsedThisTurn = false
  const recorded = record(next, {
    op: Op.MoveZoneToStadium,
    card: cardId,
    source,
    ...(discarded ? { discarded } : {}),
  })
  return discarded ? clearFieldOverrides(recorded, discarded.card) : recorded
}

// Slot attachment — evolution, energy, or tools on that seat
const getSlotAttachment = (gamestate: GameState, ref: SlotRef): CardInstanceId[] => {
  return getSlot(gamestate, ref)[ref.attachment]
}

/** Same as evolving: all five flags off, `leave_play` mods drop. Mutates the copied seat. */
export function asIfEvolved(gamestate: GameState, slotId: SlotId) {
  const pokemon = getSlot(gamestate, slotId)
  if (pokemon.evolution.length === 0) return
  pokemon.status = emptyStatus()
  pokemon.poisonCounters = 1
  pokemon.modifiers = pokemon.modifiers.filter((m) => m.until.beat !== "leave_play")
}

// A card landing on an already occupied evolution attachment is an evolve — all five flags off.
function clearStatusOnEvolve(gamestate: GameState, dest: SlotRef) {
  if (dest.attachment !== "evolution") return
  asIfEvolved(gamestate, dest)
  getSlot(gamestate, dest).evolvedThisTurn = true
}

// Zone to slot — onto a Pokémon attachment (evolution, energy, or tool)
export const moveZoneToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: ZoneRef,
  dest: SlotRef
) => {
  const location = gamestate.players[source.player][source.zone]
  if (location.indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate, source.player, dest.player)
  const sourceZone = next.players[source.player][source.zone]
  sourceZone.splice(sourceZone.indexOf(cardId), 1)
  clearStatusOnEvolve(next, dest)
  getSlotAttachment(next, dest).push(cardId)
  return record(next, { op: Op.MoveZoneToSlot, card: cardId, source, dest })
}

// Slot to zone — off a Pokémon attachment back into a zone
export const moveSlotToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: SlotRef,
  dest: ZoneRef,
  position: ZonePosition
) => {
  if (getSlotAttachment(gamestate, source).indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate, source.player, dest.player)
  const sourceCards = getSlotAttachment(next, source)
  sourceCards.splice(sourceCards.indexOf(cardId), 1)
  placeInZone(next.players[dest.player][dest.zone], position, cardId)
  return record(clearFieldOverrides(next, cardId), {
    op: Op.MoveSlotToZone,
    card: cardId,
    source,
    dest,
    position,
  })
}

/** Move `from` and every later evolution card to the owner’s dest (default discard), then evolve-cleanup. */
export const devolve = (
  gamestate: GameState,
  slotId: SlotId,
  from: CardInstanceId,
  destZone: ZoneName = "discard"
) => {
  const pile = getSlot(gamestate, slotId).evolution
  const start = pile.indexOf(from)
  if (start <= 0) return gamestate
  const dest = { player: slotId.player, zone: destZone }
  const source = { ...slotId, attachment: "evolution" as const }
  const drop = pile.slice(start)
  const position = destZone === "discard" ? "bottom" : "top"
  for (const card of [...drop].reverse()) {
    gamestate = moveSlotToZone(gamestate, card, source, dest, position)
  }
  const next = copy(gamestate, slotId.player)
  asIfEvolved(next, slotId)
  return next
}

// Slot to slot — between Pokémon attachments (retreat, attach, evolve)
export const moveSlotToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: SlotRef,
  dest: SlotRef
) => {
  if (getSlotAttachment(gamestate, source).indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate, source.player, dest.player)
  const sourceCards = getSlotAttachment(next, source)
  sourceCards.splice(sourceCards.indexOf(cardId), 1)
  clearStatusOnEvolve(next, dest)
  getSlotAttachment(next, dest).push(cardId)
  return record(next, { op: Op.MoveSlotToSlot, card: cardId, source, dest })
}

// Damage — add to the slot; value may be negative
export const applyDamage = (
  gamestate: GameState,
  value: number,
  slot: SlotId,
  source?: "poison" | "burn"
) => {
  if (!slot || typeof slot.player !== "number" || (slot.slot !== "active" && slot.slot !== "bench")) {
    return gamestate
  }
  const next = copy(gamestate, slot.player)
  getSlot(next, slot).damage = Math.max(0, getSlot(next, slot).damage + value)
  return record(next, {
    op: Op.ApplyDamage,
    amount: value,
    slot,
    ...(source !== undefined ? { source } : {}),
  })
}

// Status — set one special-condition flag
export const applyStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId,
  counters?: number
) => {
  if (!acceptsStatus(gamestate, getSlot(gamestate, slot), status)) return gamestate
  const next = copy(gamestate, slot.player)
  const pokemon = getSlot(next, slot)
  pokemon.status = withStatus(pokemon.status, status)
  if (status === "poison") {
    pokemon.poisonCounters = Math.max(pokemon.poisonCounters ?? 1, counters ?? 1)
  }
  return record(next, { op: Op.ApplyStatus, status, slot })
}

// Status — clear one special-condition flag
export const removeStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId
) => {
  const next = copy(gamestate, slot.player)
  const pokemon = getSlot(next, slot)
  pokemon.status[status] = false
  if (status === "poison") pokemon.poisonCounters = 1
  return record(next, { op: Op.RemoveStatus, status, slot })
}

/** Put `cards` on top in that order. They must already be in the zone; the rest keep relative order. */
export const reorderZone = (
  gamestate: GameState,
  zone: ZoneRef,
  cards: CardInstanceId[]
) => {
  const pile = gamestate.players[zone.player][zone.zone]
  if (cards.length === 0 || cards.some((card) => !pile.includes(card))) return gamestate
  const keep = new Set(cards)
  const next = copy(gamestate, zone.player)
  next.players[zone.player][zone.zone] = [
    ...cards,
    ...pile.filter((card) => !keep.has(card)),
  ]
  return record(next, { op: Op.Reorder, zone, cards: [...cards] })
}

// Shuffle — copy, then Fisher–Yates one of a player's zones
export const shuffle = (
  gamestate: GameState,
  player: 1 | 2,
  zone: ZoneName
) => {
  const next = copy(gamestate, player)
  shuffleZone(next.players[player][zone])
  return next
}

// Coin — live RNG
type CoinResult = "heads" | "tails"
export const flipCoin = (count: number): CoinResult[] => {
  const result: CoinResult[] = []

  for (let i = 0; i < count; i++) {
    const flip = Math.random()
    if (flip > 0.5) {
      result.push("heads")
    } else {
      result.push("tails")
    }
  }

  return result
}
