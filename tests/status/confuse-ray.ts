import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../session.js"
import type { Card } from "../../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

function board() {
  const alakazam = printed(set, "base1-1")
  const machop = printed(set, "base1-52")
  const psychic = printed(set, "base1-101")
  const fighting = printed(set, "base1-97")

  let gamestate = initializeGameState(
    [alakazam, alakazam, ...copies(psychic, 16)],
    [machop, machop, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-1")
  gamestate = moveToBench(gamestate, 1, "base1-1", 0)
  gamestate = moveToActive(gamestate, 2, "base1-52")
  gamestate = moveToBench(gamestate, 2, "base1-52", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-101", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toHand(gamestate, 1, "base1-101", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-101", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

function session() {
  return createSessionFromState(board())
}

console.log("Alakazam vs Machop (Confuse Ray)")
listen(session(), () => session())
