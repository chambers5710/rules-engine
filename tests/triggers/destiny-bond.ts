import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../src/session.js"
import type { Card } from "../../types.js"
import {
  initBoard,
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

async function board() {
  const alakazam = printed(set, "base1-1")
  const gastly = printed(set, "base1-50")
  const psychic = printed(set, "base1-101")

  let gamestate = await initBoard(
    [alakazam, alakazam, ...copies(psychic, 16)],
    [gastly, gastly, ...copies(psychic, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-1")
  gamestate = moveToActive(gamestate, 2, "base1-50")
  gamestate = attachEnergy(gamestate, 1, "base1-101", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-101", 2)
  gamestate = toHand(gamestate, 1, "base1-101", 3)
  gamestate = toHand(gamestate, 2, "base1-101", 3)
  gamestate = toPrize(gamestate, 1, "base1-101", 6)
  gamestate = toPrize(gamestate, 2, "base1-101", 6)
  return { ...liveTurn(gamestate), activePlayer: 2 as const }
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Alakazam vs Gastly — P2 Bonds first (Fighting cannot KO Gastly). Then P1 Confuse Ray is an exact 30 KO.")
listen(await session(), () => session())
