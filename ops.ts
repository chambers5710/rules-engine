import type {
  CardInstanceId,
  GameState,
  Slot,
  SlotId,
  SlotRef,
  Status,
  Zone,
  ZoneDest,
  ZonePosition,
  ZoneRef,
} from "./types.js"

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
  const target = gamestate.players[to.player][to.zone]

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  placeInZone(target, to.position, cardId)

  return gamestate
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
  const target = getSlotAttachment(gamestate, to)

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  target.push(cardId)

  return gamestate
}

// Slot to zone — off a Pokémon back into a pile
export const moveSlotToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: ZoneDest
) => {
  const location = getSlotAttachment(gamestate, from)
  const target = gamestate.players[to.player][to.zone]

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  placeInZone(target, to.position, cardId)

  return gamestate
}

// Slot to slot — between Pokémon piles (retreat, attach, evolve)
export const moveSlotToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: SlotRef
) => {
  const location = getSlotAttachment(gamestate, from)
  const target = getSlotAttachment(gamestate, to)

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  target.push(cardId)

  return gamestate
}

// Damage — add to the slot; value may be negative
export const applyDamage = (
  gamestate: GameState,
  value: number,
  to: SlotId
) => {
  const slot = getSlot(gamestate, to)
  slot.damage += value
  return gamestate
}

// Status — set one special-condition flag
export const applyStatus = (
  gamestate: GameState,
  status: Status,
  to: SlotId
) => {
  const slot = getSlot(gamestate, to)
  slot.status[status] = true
  return gamestate
}

// Status — clear one special-condition flag
export const removeStatus = (
  gamestate: GameState,
  status: Status,
  from: SlotId
) => {
  const slot = getSlot(gamestate, from)
  slot.status[status] = false
  return gamestate
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
