import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../session.js"
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
  const charizard = printed(set, "base1-4")
  const chansey = printed(set, "base1-3")
  const fire = printed(set, "base1-98")
  const lightning = printed(set, "base1-100")
  const colorless = printed(set, "base1-97")

  let gamestate = await initBoard(
    [charizard, charizard, ...copies(fire, 10), ...copies(lightning, 10)],
    [chansey, chansey, ...copies(colorless, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-4")
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-98", 2)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toPrize(gamestate, 1, "base1-98", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-98", 2)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Energy Burn — Charizard 2 Fire + 2 Lightning. Fire Spin is 4 Fire; Burn first.")
listen(await session(), () => session())
