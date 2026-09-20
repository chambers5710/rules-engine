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
  const hitmon = printed(set, "base1-7")
  const champ = printed(set, "base1-8")
  const fighting = printed(set, "base1-97")

  let gamestate = await initBoard(
    [hitmon, hitmon, ...copies(fighting, 16)],
    [champ, champ, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-7")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 4)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Hitmonchan vs Machamp — Jab should deal 20 and take 10 from Strikes Back")
listen(await session(), () => session())
