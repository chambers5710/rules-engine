import cards from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type Expr } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr, stateMachine } from "../../machine.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import {
  copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const set = cards as Card[]
const registry = dump as EffectRegistry
const ping: Expr = [{ op: Op.ApplyDamage, amount: 10, slot: "$self_slot" }]
const pause: Expr = [
  { op: Op.Select, pick: "slots", who: "self", among: "in_play", bind: "$to" },
  { op: Op.ApplyDamage, amount: 10, slot: "$self_slot" },
]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function withEvolved(gamestate: GameState, sourceId: string, then: Expr = ping): GameState {
  const existing = gamestate.effectRegistry[sourceId] ?? {}
  return {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      [sourceId]: {
        ...existing,
        triggers: {
          ...existing.triggers,
          "Chain Reaction": { when: "evolved", blockedByStatus: true, then },
        },
      },
    },
  }
}

function withToxicGas(gamestate: GameState, sourceId: string): GameState {
  const existing = gamestate.effectRegistry[sourceId] ?? {}
  return {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      [sourceId]: {
        ...existing,
        powers: { ...existing.powers, "Toxic Gas": { kind: "ignore_powers" } },
      },
    },
  }
}

function evolveActive(gamestate: GameState): GameState {
  const card = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-24")
  if (!card) fail("Charmeleon not in hand")
  return runExpr(
    gamestate,
    [{
      op: Op.MoveZoneToSlot,
      card,
      source: { player: 1, zone: "hand" },
      dest: { player: 1, slot: "active" },
      attachment: "evolution",
    }],
    { bindings: {} },
    1,
    Action.Evolve
  )
}

function evolveBoard(): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(set, "base1-46"), printed(set, "base1-24"), printed(set, "base1-58"), ...copies(energy, 15)],
    [printed(set, "base1-8"), printed(set, "base1-58"), ...copies(energy, 16)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-46")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = toHand(gamestate, 1, "base1-24", 1)
  return liveTurn(gamestate)
}

{
  let gamestate = evolveBoard()
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = withEvolved(gamestate, "base1-58")
  gamestate = evolveActive(gamestate)
  expect(gamestate.players[1].bench[0].damage === 10, "own-side evolve wakes a benched listener")
  expect(gamestate.players[1].active.evolution.length === 2, "Charmander evolved")
}

{
  let gamestate = evolveBoard()
  gamestate = moveToBench(gamestate, 2, "base1-58", 0)
  gamestate = withEvolved(gamestate, "base1-58")
  gamestate = evolveActive(gamestate)
  expect(gamestate.players[2].bench[0].damage === 10, "opponent evolve wakes a listener")
}

{
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(set, "base1-46"), printed(set, "base1-58"), ...copies(energy, 16)],
    [printed(set, "base1-8"), ...copies(energy, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = toHand(gamestate, 1, "base1-46", 1)
  gamestate = liveTurn(gamestate)
  gamestate = withEvolved(gamestate, "base1-58")
  const card = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-46")
  if (!card) fail("Charmander not in hand")
  gamestate = runExpr(
    gamestate,
    [{
      op: Op.MoveZoneToSlot,
      card,
      source: { player: 1, zone: "hand" },
      dest: { player: 1, slot: "bench", index: 0 },
      attachment: "evolution",
    }],
    { bindings: {} },
    1,
    Action.PlayBench
  )
  expect(gamestate.players[1].active.damage === 0, "play Basic onto empty bench does not emit evolved")
  expect(gamestate.players[1].bench[0].evolution.length === 1, "Basic landed on the bench")
}

{
  let gamestate = evolveBoard()
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = withEvolved(gamestate, "base1-58")
  gamestate.players[1].bench[0].status.confused = true
  gamestate = evolveActive(gamestate)
  expect(gamestate.players[1].bench[0].damage === 0, "status blocks evolved trigger")
}

{
  let gamestate = evolveBoard()
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = withEvolved(gamestate, "base1-58")
  gamestate = withToxicGas(gamestate, "base1-8")
  gamestate = evolveActive(gamestate)
  expect(gamestate.players[1].bench[0].damage === 0, "Toxic Gas blocks evolved trigger")
}

{
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(set, "base1-46"), printed(set, "base1-24"), ...copies(printed(set, "base1-58"), 2), ...copies(energy, 14)],
    [printed(set, "base1-8"), ...copies(energy, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-46")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = moveToBench(gamestate, 1, "base1-58", 1)
  gamestate = toHand(gamestate, 1, "base1-24", 1)
  gamestate = liveTurn(gamestate)
  gamestate = withEvolved(gamestate, "base1-58", pause)
  gamestate = evolveActive(gamestate)
  const frame = gamestate.actionStack.at(-1)
  expect(gamestate.actionStack.length === 1, "first listener pauses on Select")
  expect((frame?.pendingTriggers ?? []).length === 1, "second job rides the Select frame")
  expect(gamestate.players[1].bench[0].damage === 0, "neither listener has run remaining yet")
  const first = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "slots"
  )
  if (!first) fail("no first slot choice")
  gamestate = stateMachine(gamestate, first)
  expect(gamestate.players[1].bench[0].damage === 10, "first listener remaining ran after choose")
  expect(gamestate.players[1].bench[1].damage === 0, "second listener has not run remaining")
  expect(gamestate.actionStack.length === 1, "second listener pauses on Select")
  const second = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "slots"
  )
  if (!second) fail("no second slot choice")
  gamestate = stateMachine(gamestate, second)
  expect(gamestate.players[1].bench[1].damage === 10, "leftover listener remaining ran after choose")
  expect(gamestate.actionStack.length === 0, "paused Select does not deadlock")
}

{
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [
      printed(set, "base1-76"),
      printed(set, "base1-44"),
      printed(set, "base1-15"),
      printed(set, "base1-58"),
      ...copies(energy, 14),
    ],
    [printed(set, "base1-8"), ...copies(energy, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-44")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = toHand(gamestate, 1, "base1-76", 1)
  gamestate = toHand(gamestate, 1, "base1-15", 1)
  gamestate = liveTurn(gamestate)
  gamestate = withEvolved(gamestate, "base1-58")
  const evo = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-15")
  const write = gamestate.effectRegistry["base1-76"].trainer!["Pokémon Breeder"].filter(
    (step) => step.op !== Op.Select
  )
  gamestate = runExpr(gamestate, write, {
    bindings: {
      $evo: evo,
      $to: { player: 1, slot: "active" },
      $hand: { player: 1, zone: "hand" },
    },
  }, 1, Action.PlayTrainer)
  expect(gamestate.players[1].bench[0].damage === 10, "Breeder evolve write wakes a listener")
}

console.log("evolved-check assertions passed")
