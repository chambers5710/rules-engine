import type { GameState } from "./types.js"
import { moveZoneToSlot, moveZoneToZone } from "./ops.js"

// these are extra helpers and not at this point used in ops

export function draw(gamestate: GameState, playerId: 1 | 2, count: number) {
  const next = structuredClone(gamestate)
  const deck = next.players[playerId].deck
  const hand = next.players[playerId].hand
  const taken = deck.splice(0, Math.min(count, deck.length))
  hand.push(...taken)
  return next
}

export function discard(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToZone(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, zone: "discard", position: "bottom" }
  )
}

export function placePrize(gamestate: GameState, playerId: 1 | 2, cardId: string) {
return moveZoneToZone(
  gamestate,
  cardId,
  { player: playerId, zone: "deck" },
  { player: playerId, zone: "prize", position: "bottom" }
)
}

export function playActive(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, slot: "active", attachment: "evolution" }
  )
}

export function playBench(
  gamestate: GameState,
  playerId: 1 | 2,
  cardId: string,
  index: 0 | 1 | 2 | 3 | 4
) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, slot: "bench", index, attachment: "evolution" }
  )
}

export function attachEnergy(
  gamestate: GameState,
  playerId: 1 | 2,
  cardId: string,
  to: { slot: "active" } | { slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }
) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, ...to, attachment: "energy" }
  )
}
