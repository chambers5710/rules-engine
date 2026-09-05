import type {
  CardInstanceId,
  GameState,
  Slot,
  SlotId,
  SlotRef,
  Status,
  Zone,
  ZoneDest,
  ZoneName,
  ZonePosition,
  ZoneRef,
} from "./types.js"

// Copy — snapshot we can mutate; never write the object we were given
const copy = (gamestate: GameState): GameState => structuredClone(gamestate)

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
  from: ZoneRef,
  to: ZoneDest
) => {
  const location = gamestate.players[from.player][from.zone]
  if (location.indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate)
  const fromZone = next.players[from.player][from.zone]
  const toZone = next.players[to.player][to.zone]
  fromZone.splice(fromZone.indexOf(cardId), 1)
  placeInZone(toZone, to.position, cardId)
  return next
}

// Slot — resolve active or bench seat
const getSlot = (gamestate: GameState, ref: SlotId): Slot => {
  const player = gamestate.players[ref.player]
  return ref.slot === "active" ? player.active : player.bench[ref.index]
}

// Slot attachment — the named pile on that seat
const getSlotAttachment = (gamestate: GameState, ref: SlotRef): CardInstanceId[] => {
  return getSlot(gamestate, ref)[ref.attachment]
}

// Zone to slot — pile onto a Pokémon (evolution, energy, or tool)
export const moveZoneToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: ZoneRef,
  to: SlotRef
) => {
  const location = gamestate.players[from.player][from.zone]
  if (location.indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate)
  const fromZone = next.players[from.player][from.zone]
  fromZone.splice(fromZone.indexOf(cardId), 1)
  getSlotAttachment(next, to).push(cardId)
  return next
}

// Slot to zone — off a Pokémon back into a pile
export const moveSlotToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: ZoneDest
) => {
  if (getSlotAttachment(gamestate, from).indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate)
  const fromPile = getSlotAttachment(next, from)
  fromPile.splice(fromPile.indexOf(cardId), 1)
  placeInZone(next.players[to.player][to.zone], to.position, cardId)
  return next
}

// Slot to slot — between Pokémon piles (retreat, attach, evolve)
export const moveSlotToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: SlotRef
) => {
  if (getSlotAttachment(gamestate, from).indexOf(cardId) === -1) {
    return gamestate
  }

  const next = copy(gamestate)
  const fromPile = getSlotAttachment(next, from)
  fromPile.splice(fromPile.indexOf(cardId), 1)
  getSlotAttachment(next, to).push(cardId)
  return next
}

// Damage — add to the slot; value may be negative
export const applyDamage = (
  gamestate: GameState,
  value: number,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).damage += value
  return next
}

// Status — set one special-condition flag
export const applyStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).status[status] = true
  return next
}

// Status — clear one special-condition flag
export const removeStatus = (
  gamestate: GameState,
  status: Status,
  slot: SlotId
) => {
  const next = copy(gamestate)
  getSlot(next, slot).status[status] = false
  return next
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

// Coin — live RNG; persist results on history, do not re-roll on replay
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
