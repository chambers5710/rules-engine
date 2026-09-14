import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard,
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"
import { moveZoneToZone } from "../../ops.js"

const set = cards as Card[]

function toDiscard(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
  for (let i = 0; i < n; i++) {
    const card = gamestate.players[player].deck.find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
      ?? gamestate.players[player].hand.find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
    if (!card) throw new Error(`no ${sourceId} to discard for p${player}`)
    const zone = gamestate.players[player].deck.includes(card) ? "deck" : "hand"
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player, zone },
      { player, zone: "discard" },
      "bottom"
    )
  }
  return gamestate
}

async function board(): GameState {
  const energy = printed(set, "base1-97")
  let gamestate = await initBoard(
    [
      printed(set, "base1-5"),
      printed(set, "base1-5"),
      printed(set, "base1-79"),
      printed(set, "base1-81"),
      printed(set, "base1-74"),
      printed(set, "base1-91"),
      printed(set, "base1-94"),
      ...copies(energy, 24),
    ],
    [printed(set, "base1-3"), printed(set, "base1-3"), ...copies(energy, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-5")
  gamestate = moveToBench(gamestate, 1, "base1-5", 0)
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1, { player: 1, slot: "bench", index: 0 })
  gamestate = attachEnergy(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-79", 1)
  gamestate = toHand(gamestate, 1, "base1-81", 1)
  gamestate = toHand(gamestate, 1, "base1-74", 1)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toDiscard(gamestate, 1, "base1-97", 2)
  gamestate = toDiscard(gamestate, 1, "base1-91", 1)
  gamestate = toDiscard(gamestate, 1, "base1-94", 1)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Optional Select — SER + Energy Retrieval + Item Finder in one hand")
console.log("discard: 2 Fighting, Bill, Potion. POST /reset rebuilds this board.")
listen(await session(), () => session())
