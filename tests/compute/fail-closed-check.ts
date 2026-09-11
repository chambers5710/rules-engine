import cards from "../../data/cards/base1.json" with { type: "json" }
import { Action, computeAvailableActions } from "../../compute.js"
import { initializeGameState } from "../../initialize.js"
import { applyDamage } from "../../ops.js"
import type { Card, GameState } from "../../types.js"
import { DAMAGE_COUNTER } from "../../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  printed,
  toHand,
} from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function names(gamestate: GameState, kind: Action): string[] {
  return computeAvailableActions(gamestate).flatMap((action) => {
    if (action.kind !== kind) return []
    if (action.kind === Action.Attack || action.kind === Action.Ability) return [action.name]
    if (action.kind === Action.PlayTrainer) return [gamestate.cardRegistry[action.card].sourceId]
    return []
  })
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function stage(
  p1: string,
  p2: string,
  energy: string,
  n: number,
  extra: string[] = []
): GameState {
  const a = printed(set, p1)
  const b = printed(set, p2)
  const e = printed(set, energy)
  let gamestate = initializeGameState(
    [a, a, ...extra.map((id) => printed(set, id)), ...copies(e, 18)],
    [b, b, ...copies(e, 18)]
  )
  gamestate = moveToActive(gamestate, 1, p1)
  gamestate = moveToActive(gamestate, 2, p2)
  if (n > 0) gamestate = attachEnergy(gamestate, 1, energy, n)
  return liveTurn(gamestate)
}

{
  const gamestate = stage("base1-20", "base1-36", "base1-100", 2, ["base1-70"])
  const attacks = names(gamestate, Action.Attack)
  expect(!attacks.includes("Thunderpunch"), "Thunderpunch (30+ with text) must not list")
  expect(attacks.includes("Thundershock"), "authored Thundershock should list")
  const trainers = names(toHand(gamestate, 1, "base1-70", 1), Action.PlayTrainer)
  expect(!trainers.includes("base1-70"), "unauthored Clefairy Doll must not list")
}

{
  const gamestate = stage("base1-27", "base1-36", "base1-97", 1)
  const attacks = names(gamestate, Action.Attack)
  expect(!attacks.includes("Leek Slap"), "Leek Slap (integer damage + text) must not list")
}

{
  const gamestate = stage("base1-13", "base1-36", "base1-102", 4)
  const attacks = names(gamestate, Action.Attack)
  expect(attacks.includes("Whirlpool"), "Whirlpool lists with 0 defending Energy")
  expect(!attacks.includes("Water Gun"), "Water Gun (30+ with text) must not list")
}

{
  const gamestate = toHand(stage("base1-36", "base1-36", "base1-98", 0, ["base1-95"]), 1, "base1-95", 1)
  const trainers = names(gamestate, Action.PlayTrainer)
  expect(!trainers.includes("base1-95"), "Switch with no Bench must not list")
}

{
  const gamestate = stage("base1-2", "base1-36", "base1-100", 0)
  const abilities = names(gamestate, Action.Ability)
  expect(!abilities.includes("Rain Dance"), "Rain Dance with no Water in hand must not list")
}

{
  let gamestate = stage("base1-1", "base1-36", "base1-101", 0)
  gamestate = applyDamage(gamestate, 2 * DAMAGE_COUNTER, { player: 1, slot: "active" })
  const abilities = names(gamestate, Action.Ability)
  expect(!abilities.includes("Damage Swap"), "Damage Swap with no legal destination must not list")
}

console.log("fail-closed-check assertions passed")
