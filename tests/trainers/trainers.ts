import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import { DAMAGE_COUNTER } from "../../types.js"
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
const TRAINERS = ["base1-91", "base1-94", "base1-95", "base1-93", "base1-82"] as const

function pack() {
  return TRAINERS.map((id) => printed(set, id))
}

function trainerHand(gamestate: GameState, player: 1 | 2): GameState {
  for (const id of TRAINERS) gamestate = toHand(gamestate, player, id, 1)
  return gamestate
}

function board() {
  const clefairy = printed(set, "base1-5")
  const electabuzz = printed(set, "base1-20")
  const hitmonchan = printed(set, "base1-7")
  const magmar = printed(set, "base1-36")
  const haunter = printed(set, "base1-29")
  const ivysaur = printed(set, "base1-30")
  const fighting = printed(set, "base1-97")
  const fire = printed(set, "base1-98")

  let gamestate = initializeGameState(
    [clefairy, electabuzz, hitmonchan, ...pack(), ...copies(fighting, 16)],
    [magmar, haunter, ivysaur, ...pack(), ...copies(fire, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-5")
  gamestate = moveToBench(gamestate, 1, "base1-20", 0)
  gamestate = moveToBench(gamestate, 1, "base1-7", 1)
  gamestate = moveToActive(gamestate, 2, "base1-36")
  gamestate = moveToBench(gamestate, 2, "base1-29", 0)
  gamestate = moveToBench(gamestate, 2, "base1-30", 1)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
  gamestate = attachEnergy(gamestate, 2, "base1-98", 2)
  gamestate = trainerHand(gamestate, 1)
  gamestate = trainerHand(gamestate, 2)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-98", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-98", 6)
  gamestate = liveTurn(gamestate)

  gamestate.players[1].active.damage = 2 * DAMAGE_COUNTER
  gamestate.players[1].active.status.poison = true
  gamestate.players[1].bench[1].damage = DAMAGE_COUNTER
  gamestate.players[2].active.damage = 4 * DAMAGE_COUNTER
  gamestate.players[2].active.status.asleep = true
  gamestate.players[2].bench[1].damage = 2 * DAMAGE_COUNTER
  return gamestate
}

function session() {
  return createSessionFromState(board())
}

console.log("Trainers — both hands (Bill, Potion, Switch, Gust, Full Heal)")
listen(session(), () => session())
