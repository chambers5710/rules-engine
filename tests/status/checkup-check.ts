import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action } from "../../dsl.js"
import { stateMachine } from "../../machine.js"
import { applyDamage, applyStatus } from "../../ops.js"
import type { Card, GameState, HistoryEntry } from "../../types.js"
import {
  attachEnergy,
  copies,
  initBoard,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
} from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function endTurn(gamestate: GameState): GameState {
  const action = computeAvailableActions(gamestate).find((row) => row.kind === Action.EndTurn)
  if (!action) fail("no EndTurn")
  return stateMachine(gamestate, action)
}

function hpOf(gamestate: GameState, player: 1 | 2): number {
  const id = gamestate.players[player].active.evolution.at(-1)
  if (!id) fail(`no active p${player}`)
  return Number(gamestate.cardRegistry[id].hp)
}

async function stage(): Promise<GameState> {
  const chansey = printed(set, "base1-3")
  const magikarp = printed(set, "base1-52")
  const energy = printed(set, "base1-97")
  let gamestate = await initBoard(
    [chansey, chansey, ...copies(energy, 16)],
    [magikarp, magikarp, ...copies(energy, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-3")
  gamestate = moveToBench(gamestate, 1, "base1-3", 0)
  gamestate = moveToActive(gamestate, 2, "base1-52")
  gamestate = moveToBench(gamestate, 2, "base1-52", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
  return liveTurn(gamestate)
}

function delta(before: GameState, after: GameState): HistoryEntry[] {
  return after.history.slice(before.history.length)
}

{
  let gamestate = await stage()
  gamestate = applyStatus(gamestate, "poison", { player: 1, slot: "active" })
  gamestate = applyStatus(gamestate, "asleep", { player: 2, slot: "active" })
  gamestate = applyStatus(gamestate, "poison", { player: 2, slot: "active" })
  gamestate = applyDamage(gamestate, hpOf(gamestate, 2), { player: 2, slot: "active" })
  const before = gamestate
  gamestate = endTurn(gamestate)
  const added = delta(before, gamestate)
  expect(
    added.some((entry) => entry.op === "apply_damage" && "source" in entry && entry.source === "poison" && entry.slot?.player === 1),
    "living poison still ticks"
  )
  expect(
    !added.some((entry) => entry.op === "apply_damage" && "source" in entry && entry.source === "poison" && entry.slot?.player === 2),
    "lethal Active skips poison"
  )
  expect(
    !added.some((entry) => entry.op === "flip_coin" && "check" in entry && entry.check === "asleep"),
    "lethal Active skips the wake coin"
  )
}

{
  let gamestate = await stage()
  gamestate = applyStatus(gamestate, "asleep", { player: 2, slot: "active" })
  const before = gamestate
  gamestate = endTurn(gamestate)
  const added = delta(before, gamestate)
  expect(
    added.some((entry) => entry.op === "flip_coin" && "check" in entry && entry.check === "asleep"),
    "living Asleep still flips"
  )
}

{
  let gamestate = await stage()
  gamestate = applyStatus(gamestate, "paralyzed", { player: 1, slot: "active" })
  const before = gamestate
  gamestate = endTurn(gamestate)
  const added = delta(before, gamestate)
  expect(
    added.some((entry) => entry.op === "remove_status" && "status" in entry && entry.status === "paralyzed"),
    "living Paralyzed still clears"
  )
}

{
  let gamestate = await stage()
  gamestate = applyStatus(gamestate, "paralyzed", { player: 1, slot: "active" })
  gamestate = applyDamage(gamestate, hpOf(gamestate, 1), { player: 1, slot: "active" })
  const before = gamestate
  gamestate = endTurn(gamestate)
  const added = delta(before, gamestate)
  expect(
    !added.some((entry) => entry.op === "remove_status" && "status" in entry && entry.status === "paralyzed"),
    "lethal Active skips Paralyzed clear"
  )
}
