import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { applyDamage } from "../../ops.js"
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
  const alakazam = printed(set, "base1-1")
  const blastoise = printed(set, "base1-2")
  const psychic = printed(set, "base1-101")
  const water = printed(set, "base1-102")

  let gamestate = await initBoard(
    [alakazam, alakazam, ...copies(psychic, 16)],
    [blastoise, blastoise, ...copies(water, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-1")
  gamestate = moveToBench(gamestate, 1, "base1-1", 0)
  gamestate = moveToActive(gamestate, 2, "base1-2")
  gamestate = moveToBench(gamestate, 2, "base1-2", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-101", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-102", 3)
  gamestate = applyDamage(gamestate, 20, { player: 1, slot: "active" })
  gamestate = toHand(gamestate, 1, "base1-101", 3)
  gamestate = toHand(gamestate, 2, "base1-102", 3)
  gamestate = toPrize(gamestate, 1, "base1-101", 6)
  gamestate = toPrize(gamestate, 2, "base1-102", 6)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Alakazam vs Blastoise")
listen(await session(), () => session())
