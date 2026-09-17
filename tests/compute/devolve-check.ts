import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { runExpr } from "../../machine.js"
import { applyStatus, moveZoneToSlot } from "../../ops.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, copies, liveTurn, moveToActive, printed, toHand } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function listsSpray(gamestate: GameState): boolean {
  return computeAvailableActions(gamestate).some(
    (action) =>
      action.kind === Action.PlayTrainer && gamestate.cardRegistry[action.card].sourceId === "base1-72"
  )
}

async function stage(evolved: boolean): GameState {
  const spray = printed(set, "base1-72")
  const ivy = printed(set, "base1-30")
  const bulb = printed(set, "base1-44")
  const energy = printed(set, "base1-98")
  let gamestate = await initBoard(
    [spray, ivy, bulb, printed(set, "base1-58"), ...copies(energy, 14)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-44")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  if (evolved) {
    gamestate = toHand(gamestate, 1, "base1-30", 1)
    const evo = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-30")
    gamestate = moveZoneToSlot(
      gamestate,
      evo!,
      { player: 1, zone: "hand" },
      { player: 1, slot: "active", attachment: "evolution" }
    )
  }
  gamestate = toHand(gamestate, 1, "base1-72", 1)
  return liveTurn(gamestate)
}

{
  expect(!listsSpray(await stage(false)), "Spray is omitted when every Pokémon is Basic")
  expect(listsSpray(await stage(true)), "Spray lists when a Stage is in play")
}

{
  let gamestate = await stage(true)
  const basic = gamestate.players[1].active.evolution[0]
  const stage1 = gamestate.players[1].active.evolution[1]
  gamestate = applyStatus(gamestate, "poison", { player: 1, slot: "active" })
  const write = gamestate.effectRegistry["base1-72"].trainer!["Devolution Spray"].filter(
    (step) => step.op !== Op.Select
  )
  gamestate = runExpr(gamestate, write, {
    bindings: {
      $target: { player: 1, slot: "active" },
      $cut: stage1,
    },
  }, 1, Action.PlayTrainer)
  expect(gamestate.players[1].active.evolution.length === 1, "only the Basic remains")
  expect(gamestate.players[1].active.evolution[0] === basic, "Basic stays in play")
  expect(gamestate.players[1].discard.includes(stage1), "the Stage is discarded")
  expect(!gamestate.players[1].active.status.poison, "devolve clears status")
}

{
  let gamestate = await stage(true)
  const basic = gamestate.players[1].active.evolution[0]
  const stage1 = gamestate.players[1].active.evolution[1]
  gamestate = applyStatus(gamestate, "poison", { player: 1, slot: "active" })
  gamestate = runExpr(gamestate, [{ op: Op.Devolve, slot: "$target", from: "$cut", dest: "hand" }], {
    bindings: {
      $target: { player: 1, slot: "active" },
      $cut: stage1,
    },
  }, 1, Action.Attack)
  expect(gamestate.players[1].active.evolution.length === 1, "Beam leaves the Basic")
  expect(gamestate.players[1].active.evolution[0] === basic, "Beam Basic stays")
  expect(gamestate.players[1].hand.includes(stage1), "highest Stage returns to the owner’s hand")
  expect(!gamestate.players[1].discard.includes(stage1), "Beam does not discard the Stage")
  expect(!gamestate.players[1].active.status.poison, "Beam still runs asIfEvolved")
}

console.log("devolve-check assertions passed")
