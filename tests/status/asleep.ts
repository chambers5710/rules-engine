import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../session.js"
import type { Card } from "../../types.js"
import { applyStatus } from "../../ops.js"
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
  const haunter = printed(set, "base1-29")
  const chansey = printed(set, "base1-3")
  const psychic = printed(set, "base1-101")
  const fighting = printed(set, "base1-97")

  let gamestate = await initBoard(
    [haunter, haunter, ...copies(psychic, 16)],
    [chansey, chansey, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-29")
  gamestate = moveToBench(gamestate, 1, "base1-29", 0)
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = moveToBench(gamestate, 2, "base1-3", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-101", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toHand(gamestate, 1, "base1-101", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-101", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = liveTurn(gamestate)
  return applyStatus(gamestate, "asleep", { player: 2, slot: "active" })
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Haunter vs Chansey (Hypnosis / Dream Eater)")
console.log("Chansey starts Asleep. Dream Eater 50 if Asleep; otherwise the If skips.")
listen(await session(), () => session())
