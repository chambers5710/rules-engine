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
  const venusaur = printed(set, "base1-15")
  const ivy = printed(set, "base1-30")
  const magmar = printed(set, "base1-36")
  const chansey = printed(set, "base1-3")
  const grass = printed(set, "base1-99")
  const fire = printed(set, "base1-98")
  const colorless = printed(set, "base1-97")

  let gamestate = await initBoard(
    [venusaur, ivy, magmar, ...copies(grass, 16), ...copies(fire, 4)],
    [chansey, chansey, ...copies(colorless, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-15")
  gamestate = moveToBench(gamestate, 1, "base1-30", 0)
  gamestate = moveToBench(gamestate, 1, "base1-36", 1)
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-99", 2)
  gamestate = attachEnergy(gamestate, 1, "base1-99", 1, { player: 1, slot: "bench", index: 0 })
  gamestate = attachEnergy(gamestate, 1, "base1-98", 1, { player: 1, slot: "bench", index: 1 })
  gamestate = toPrize(gamestate, 1, "base1-99", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-99", 3)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Energy Trans — Venusaur / Ivysaur (Grass) / Magmar (Fire only)")
console.log("From lights Grass seats only. Dest is any other of yours, including Magmar.")
listen(await session(), () => session())
