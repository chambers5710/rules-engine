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
  const ivysaur = printed(set, "base1-30")
  const chansey = printed(set, "base1-3")
  const grass = printed(set, "base1-99")
  const fighting = printed(set, "base1-97")

  let gamestate = initializeGameState(
    [ivysaur, ivysaur, ...copies(grass, 16)],
    [chansey, chansey, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-30")
  gamestate = moveToBench(gamestate, 1, "base1-30", 0)
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = moveToBench(gamestate, 2, "base1-3", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-99", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toHand(gamestate, 1, "base1-99", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-99", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

function session() {
  return createSessionFromState(board())
}

console.log("Ivysaur vs Chansey (Poisonpowder)")
listen(session(), () => session())
