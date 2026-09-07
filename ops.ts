import { getSlot } from "./board.js"
import { Op } from "./dsl.js"
import { record } from "./history.js"
import type {
  CardInstanceId,
  GameState,
  SlotId,
  SlotRef,
  Status,
  Zone,
  ZoneName,
  ZonePosition,
  ZoneRef,
} from "./types.js"

// Copy — snapshot we can mutate; never write the object we were given
export const copy = (gamestate: GameState): GameState => structuredClone(gamestate)

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

// Zone to zone — take a card off one pile and place it on another
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

  const next = copy(gamestate)
  const sourceZone = next.players[source.player][source.zone]
  const destZone = next.players[dest.player][dest.zone]
  sourceZone.splice(sourceZone.indexOf(cardId), 1)
  placeInZone(destZone, position, cardId)
  return record(next, { op: Op.MoveZoneToZone, card: cardId, source, dest, position })
}

// Slot attachment — the named pile on that slot
const getSlotAttachment = (gamestate: GameState, ref: SlotRef): CardInstanceId[] => {
  return getSlot(gamestate, ref)[ref.attachment]
}

// Zone to slot — pile onto a Pokémon (evolution, energy, or tool)
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

  const next = copy(gamestate)
  const sourceZone = next.players[source.player][source.zone]
  sourceZone.splice(sourceZone.indexOf(cardId), 1)
  getSlotAttachment(next, dest).push(cardId)
  return record(next, { op: Op.MoveZoneToSlot, card: cardId, source, dest })
}

// Slot to zone — off a Pokémon back into a pile
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

  const next = copy(gamestate)
  const sourceCards = getSlotAttachment(next, source)
  sourceCards.splice(sourceCards.indexOf(cardId), 1)
  placeInZone(next.players[dest.player][dest.zone], position, cardId)
  return record(next, { op: Op.MoveSlotToZone, card: cardId, source, dest, position })
}

// Slot to slot — between Pokémon piles (retreat, attach, evolve)
export const moveSlotToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  source: SlotRef,
  dest: SlotRef
) => {
  if (getSlotAttachment(gamestate, source).indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate)
  const sourceCards = getSlotAttachment(next, source)
  sourceCards.splice(sourceCards.indexOf(cardId), 1)
  getSlotAttachment(next, dest).push(cardId)
  return record(next, { op: Op.MoveSlotToSlot, card: cardId, source, dest })
}

// Damage — add to the slot; value may be negative
export const applyDamage = (
  gamestate: GameState,
  value: number,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).damage += value
  return record(next, { op: Op.ApplyDamage, amount: value, slot })
}

// Status — set one special-condition flag
export const applyStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).status[status] = true
  return record(next, { op: Op.ApplyStatus, status, slot })
}

// Status — clear one special-condition flag
export const removeStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).status[status] = false
  return record(next, { op: Op.RemoveStatus, status, slot })
}

// Shuffle — copy, then Fisher–Yates one of a player's piles
export const shuffle = (
  gamestate: GameState,
  player: 1 | 2,
  zone: ZoneName
) => {
  const next = copy(gamestate)
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
