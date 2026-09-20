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
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

async function board() {
  const chansey = printed(set, "base1-3")
  const hitmonchan = printed(set, "base1-7")
  const fighting = printed(set, "base1-97")

  let gamestate = await initBoard(
    [chansey, chansey, ...copies(fighting, 16)],
    [hitmonchan, hitmonchan, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-3")
  gamestate = moveToBench(gamestate, 1, "base1-3", 0)
  gamestate = moveToActive(gamestate, 2, "base1-7")
  gamestate = moveToBench(gamestate, 2, "base1-7", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 3)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Chansey vs Hitmonchan (Scrunch)")
listen(await session(), () => session())
