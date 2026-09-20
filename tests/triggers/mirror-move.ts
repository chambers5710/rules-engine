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
  const bird = printed(set, "base1-22")
  const psychic = printed(set, "base1-101")
  const colorless = printed(set, "base1-97")

  let gamestate = await initBoard(
    [alakazam, alakazam, ...copies(psychic, 16)],
    [bird, bird, ...copies(colorless, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-1")
  gamestate = moveToActive(gamestate, 2, "base1-22")
  gamestate = attachEnergy(gamestate, 1, "base1-101", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 3)
  gamestate = toHand(gamestate, 1, "base1-101", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-101", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Alakazam vs Pidgeotto — hit Pidgeotto, then Mirror Move next turn")
listen(await session(), () => session())
