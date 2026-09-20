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
  const porygon = printed(set, "base1-39")
  const machop = printed(set, "base1-52")
  const fighting = printed(set, "base1-97")

  let gamestate = await initBoard(
    [porygon, porygon, ...copies(fighting, 20)],
    [machop, machop, ...copies(fighting, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-39")
  gamestate = moveToActive(gamestate, 2, "base1-52")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 1)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Conversion — Porygon vs Machop (Psychic weakness). C1 changes their W; C2 changes your R.")
listen(await session(), () => session())
