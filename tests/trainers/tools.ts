import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
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

function board(): GameState {
  const fire = printed(set, "base1-98")
  const fighting = printed(set, "base1-97")
  let gamestate = initializeGameState(
    [
      printed(set, "base1-36"),
      printed(set, "base1-36"),
      printed(set, "base1-80"),
      printed(set, "base1-84"),
      ...copies(fire, 20),
    ],
    [printed(set, "base1-7"), printed(set, "base1-7"), ...copies(fighting, 20)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-36")
  gamestate = moveToBench(gamestate, 1, "base1-36", 0)
  gamestate = moveToActive(gamestate, 2, "base1-7")
  gamestate = attachEnergy(gamestate, 1, "base1-98", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-98", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-80", 1)
  gamestate = toHand(gamestate, 1, "base1-84", 1)
  return liveTurn(gamestate)
}

function session() {
  return createSessionFromState(board())
}

console.log("Attach as tool — Defender + PlusPower in hand. Magmar vs Hitmonchan.")
console.log("PlusPower sits on Active (+10 this turn). Defender: pick a seat (−20 until end of their turn).")
listen(session(), () => session())
