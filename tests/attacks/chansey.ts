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
  const chansey = printed(set, "base1-3")
  const clefairy = printed(set, "base1-5")
  const fighting = printed(set, "base1-97")

  let gamestate = initializeGameState(
    [chansey, chansey, ...copies(fighting, 16)],
    [clefairy, clefairy, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-3")
  gamestate = moveToBench(gamestate, 1, "base1-3", 0)
  gamestate = moveToActive(gamestate, 2, "base1-5")
  gamestate = moveToBench(gamestate, 2, "base1-5", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

function session() {
  return createSessionFromState(board())
}

console.log("Chansey vs Clefairy (Double-edge)")
listen(session(), () => session())
