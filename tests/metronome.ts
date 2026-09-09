import cards from "../data/cards/base1.json" with { type: "json" }
import { listen } from "../index.js"
import { initializeGameState } from "../initialize.js"
import { createSessionFromState } from "../session.js"
import type { Card } from "../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "./fixture.js"

const set = cards as Card[]

function board() {
  const clefairy = printed(set, "base1-5")
  const magmar = printed(set, "base1-36")
  const fighting = printed(set, "base1-97")
  const fire = printed(set, "base1-98")

  let gamestate = initializeGameState(
    [clefairy, clefairy, ...copies(fighting, 16)],
    [magmar, magmar, ...copies(fire, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-5")
  gamestate = moveToBench(gamestate, 1, "base1-5", 0)
  gamestate = moveToActive(gamestate, 2, "base1-36")
  gamestate = moveToBench(gamestate, 2, "base1-36", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-98", 2)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-98", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-98", 6)
  return liveTurn(gamestate)
}

function session() {
  return createSessionFromState(board())
}

console.log("Clefairy vs Magmar (Metronome)")
listen(session(), () => session())
