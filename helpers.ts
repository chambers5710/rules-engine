import type { GameState } from "./types.js"
import { moveZoneToSlot, moveZoneToZone } from "./ops.js"

// these are extra helpers and not at this point used in ops

export function draw(gamestate: GameState, playerId: 1 | 2, count: number) {
  for (let i = 0; i < count; i++) {
    const cardId = gamestate.players[playerId].deck[0]
    if (!cardId) break
    gamestate = moveZoneToZone(
      gamestate,
      cardId,
      { player: playerId, zone: "deck" },
      { player: playerId, zone: "hand", position: "bottom" }
    )
  }
  return gamestate
}

export function discard(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToZone(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, zone: "discard", position: "bottom" }
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
