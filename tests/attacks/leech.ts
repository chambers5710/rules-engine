import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { applyDamage } from "../../ops.js"
import { createSessionFromState } from "../../session.js"
import type { Card } from "../../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

function board() {
  const bulb = printed(set, "base1-44")
  const chansey = printed(set, "base1-3")
  const grass = printed(set, "base1-99")
  const fighting = printed(set, "base1-97")

  let gamestate = initializeGameState(
    [bulb, bulb, ...copies(grass, 20)],
    [chansey, chansey, ...copies(fighting, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-44")
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-99", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toPrize(gamestate, 1, "base1-99", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-99", 3)
  return applyDamage(liveTurn(gamestate), 10, { player: 1, slot: "active" })
}

function session() {
  return createSessionFromState(board())
}

console.log("Leech Seed — Bulbasaur (10 dmg, 2 Grass) vs Chansey. Hit heals 10 if any damage landed.")
listen(session(), () => session())
