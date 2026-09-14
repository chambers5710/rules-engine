import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { runExpr, stateMachine } from "../../machine.js"
import { moveZoneToSlot } from "../../ops.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function listsScoop(gamestate: GameState): boolean {
  return computeAvailableActions(gamestate).some(
    (action) =>
      action.kind === Action.PlayTrainer && gamestate.cardRegistry[action.card].sourceId === "base1-78"
  )
}

async function stage(): GameState {
  const scoop = printed(set, "base1-78")
  const ivy = printed(set, "base1-30")
  const bulb = printed(set, "base1-44")
  const energy = printed(set, "base1-98")
  let gamestate = await initBoard(
    [scoop, ivy, bulb, printed(set, "base1-58"), ...copies(energy, 14)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-44")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-30", 1)
  const evo = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-30")
  gamestate = moveZoneToSlot(
    gamestate,
    evo!,
    { player: 1, zone: "hand" },
    { player: 1, slot: "active", attachment: "evolution" }
  )
  gamestate = attachEnergy(gamestate, 1, "base1-98", 1)
  gamestate = toHand(gamestate, 1, "base1-78", 1)
  return liveTurn(gamestate)
}

{
  expect(listsScoop(await stage()), "Scoop Up lists when you have a Pokémon in play")
}

{
  let gamestate = await stage()
  const basic = gamestate.players[1].active.evolution[0]
  const stage1 = gamestate.players[1].active.evolution[1]
  const energy = gamestate.players[1].active.energy[0]
  const write = gamestate.effectRegistry["base1-78"].trainer!["Scoop Up"].filter(
    (step) => step.op !== Op.Select
  )
  gamestate = runExpr(gamestate, write, {
    bindings: {
      $target: { player: 1, slot: "active" },
      $hand: { player: 1, zone: "hand" },
    },
  }, 1, Action.PlayTrainer)
  expect(gamestate.players[1].hand.includes(basic), "Basic returns to hand")
  expect(gamestate.players[1].discard.includes(stage1), "Evolution is discarded")
  expect(gamestate.players[1].discard.includes(energy), "Energy is discarded")
  expect(gamestate.players[1].active.evolution.length === 0, "Active is emptied")
}

{
  let gamestate = await stage()
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  const write = gamestate.effectRegistry["base1-78"].trainer!["Scoop Up"].filter(
    (step) => step.op !== Op.Select
  )
  gamestate = runExpr(gamestate, write, {
    bindings: {
      $target: { player: 1, slot: "active" },
      $hand: { player: 1, zone: "hand" },
    },
  }, 1, Action.PlayTrainer)
  expect(
    computeAvailableActions(gamestate).every((action) => action.kind === Action.Promote),
    "empty Active with a Bench is promote-only"
  )
  const filling = computeAvailableActions(gamestate)[0]
  expect(filling?.kind === Action.Promote, "promote is listed")
  gamestate = stateMachine(gamestate, filling)
  expect(gamestate.activePlayer === 1, "Scoop Up promote does not end the turn")
  expect(gamestate.phase === "turn", "Scoop Up promote stays on the turn")
  expect(gamestate.players[1].active.evolution.length > 0, "the Bench Pokémon is now Active")
  expect(
    computeAvailableActions(gamestate).some((action) => action.kind === Action.EndTurn),
    "the turn can still continue"
  )
}

console.log("scoop-up-check assertions passed")
