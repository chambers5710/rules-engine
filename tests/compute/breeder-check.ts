import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { runExpr } from "../../machine.js"
import { currentForm } from "../../board.js"
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

function listsBreeder(gamestate: GameState): boolean {
  return computeAvailableActions(gamestate).some(
    (action) =>
      action.kind === Action.PlayTrainer && gamestate.cardRegistry[action.card].sourceId === "base1-76"
  )
}

async function board(opts: { venusaur: boolean; basic: "bulb" | "ivy" }): GameState {
  const breeder = printed(set, "base1-76")
  const frog = printed(set, opts.basic === "bulb" ? "base1-44" : "base1-30")
  const saur = printed(set, "base1-15")
  const energy = printed(set, "base1-98")
  let gamestate = await initBoard(
    [breeder, frog, ...(opts.venusaur ? [saur] : []), printed(set, "base1-58"), ...copies(energy, opts.venusaur ? 14 : 15)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, opts.basic === "bulb" ? "base1-44" : "base1-30")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-76", 1)
  if (opts.venusaur) gamestate = toHand(gamestate, 1, "base1-15", 1)
  return liveTurn(gamestate)
}

{
  expect(
    listsBreeder(await board({ venusaur: true, basic: "bulb" })),
    "Breeder lists with Venusaur in hand and Bulbasaur in play"
  )
  expect(
    !listsBreeder(await board({ venusaur: true, basic: "ivy" })),
    "Breeder is omitted when the Stage 2 would land on Ivysaur"
  )
  expect(
    !listsBreeder(await board({ venusaur: false, basic: "bulb" })),
    "Breeder is omitted with no Stage 2 in hand"
  )
}

{
  let gamestate = await board({ venusaur: true, basic: "bulb" })
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
  expect(currentForm(gamestate, gamestate.players[1].active)?.sourceId === "base1-15", "Venusaur is the current form")
  expect(gamestate.players[1].active.evolution.length === 2, "Basic stays under the Stage 2")
  expect(gamestate.players[1].active.evolvedThisTurn, "Breeder counts as evolving this turn")
}

console.log("breeder-check assertions passed")
