import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../src/session.js"
import type { Card, GameState } from "../../types.js"
import { DAMAGE_COUNTER } from "../../types.js"
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
const TRAINERS = ["base1-90", "base1-92"] as const

function pack() {
  return TRAINERS.map((id) => printed(set, id))
}

function trainerHand(gamestate: GameState, player: 1 | 2): GameState {
  for (const id of TRAINERS) gamestate = toHand(gamestate, player, id, 1)
  return gamestate
}

async function board() {
  const poliwrath = printed(set, "base1-13")
  const magmar = printed(set, "base1-36")
  const water = printed(set, "base1-102")
  const fire = printed(set, "base1-98")

  let gamestate = await initBoard(
    [poliwrath, poliwrath, ...pack(), ...copies(water, 16)],
    [magmar, magmar, ...pack(), ...copies(fire, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-13")
  gamestate = moveToBench(gamestate, 1, "base1-13", 0)
  gamestate = moveToActive(gamestate, 2, "base1-36")
  gamestate = moveToBench(gamestate, 2, "base1-36", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-102", 4)
  gamestate = attachEnergy(gamestate, 2, "base1-98", 2)
  gamestate = trainerHand(gamestate, 1)
  gamestate = trainerHand(gamestate, 2)
  gamestate = toHand(gamestate, 1, "base1-102", 3)
  gamestate = toHand(gamestate, 2, "base1-98", 3)
  gamestate = toPrize(gamestate, 1, "base1-102", 6)
  gamestate = toPrize(gamestate, 2, "base1-98", 6)
  gamestate = liveTurn(gamestate)

  gamestate.players[1].active.damage = 4 * DAMAGE_COUNTER
  gamestate.players[2].active.damage = 2 * DAMAGE_COUNTER
  return gamestate
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Poliwrath vs Magmar — Whirlpool, Super Potion, Energy Removal")
listen(await session(), () => session())
