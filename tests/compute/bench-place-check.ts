import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type InterpretCtx } from "../../dsl.js"
import { runExpr } from "../../machine.js"
import { moveZoneToZone } from "../../ops.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function listsTrainer(gamestate: GameState, sourceId: string): boolean {
  return computeAvailableActions(gamestate).some(
    (action) =>
      action.kind === Action.PlayTrainer && gamestate.cardRegistry[action.card].sourceId === sourceId
  )
}

function toDiscard(gamestate: GameState, player: 1 | 2, sourceId: string): GameState {
  gamestate = toHand(gamestate, player, sourceId, 1)
  const card = gamestate.players[player].hand.find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
  if (!card) throw new Error(`no ${sourceId} in hand to discard`)
  return moveZoneToZone(
    gamestate,
    card,
    { player, zone: "hand" },
    { player, zone: "discard" },
    "bottom"
  )
}

async function fluteBoard(): GameState {
  const flute = printed(set, "base1-86")
  const bird = printed(set, "base1-57")
  const energy = printed(set, "base1-100")
  let gamestate = await initBoard(
    [flute, printed(set, "base1-58"), ...copies(energy, 16)],
    [bird, ...copies(printed(set, "base1-58"), 6), ...copies(energy, 11)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-86", 1)
  gamestate = toDiscard(gamestate, 2, "base1-57")
  return liveTurn(gamestate)
}

{
  const gamestate = await fluteBoard()
  expect(listsTrainer(gamestate, "base1-86"), "Flute lists when a Basic is in the opponent discard and a bench is open")
}

{
  let gamestate = await fluteBoard()
  const bird = gamestate.players[2].discard.find((id) => gamestate.cardRegistry[id].sourceId === "base1-57")
  const seat = { player: 2, slot: "bench" as const, index: 0 as const }
  const ctx: InterpretCtx = {
    bindings: {
      $basic: bird,
      $to: seat,
      $opp_discard: { player: 2, zone: "discard" },
    },
  }
  const expr = gamestate.effectRegistry["base1-86"].trainer!["Pokémon Flute"].filter(
    (step) => step.op !== Op.Select
  )
  gamestate = runExpr(gamestate, expr, ctx, 1, Action.PlayTrainer)
  expect(gamestate.players[2].bench[0].evolution[0] === bird, "Flute puts the Basic on their Bench")
  expect(gamestate.players[2].discard.length === 0, "Flute leaves the discard")
}

{
  let gamestate = await fluteBoard()
  for (const index of [0, 1, 2, 3, 4] as const) {
    gamestate = moveToBench(gamestate, 2, "base1-58", index)
  }
  expect(!listsTrainer(liveTurn(gamestate), "base1-86"), "Flute is omitted when their Bench is full")
}

{
  const revive = printed(set, "base1-89")
  const bird = printed(set, "base1-57")
  const energy = printed(set, "base1-100")
  let gamestate = await initBoard(
    [revive, bird, printed(set, "base1-58"), ...copies(energy, 15)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-89", 1)
  gamestate = toDiscard(gamestate, 1, "base1-57")
  gamestate = liveTurn(gamestate)
  expect(listsTrainer(gamestate, "base1-89"), "Revive lists when a Basic is in your discard and a bench is open")
  const basic = gamestate.players[1].discard.find((id) => gamestate.cardRegistry[id].sourceId === "base1-57")
  const seat = { player: 1, slot: "bench" as const, index: 0 as const }
  const expr = gamestate.effectRegistry["base1-89"].trainer!.Revive.filter((step) => step.op !== Op.Select)
  gamestate = runExpr(gamestate, expr, {
    bindings: { $basic: basic, $to: seat, $discard: { player: 1, zone: "discard" } },
  }, 1, Action.PlayTrainer)
  expect(gamestate.players[1].bench[0].evolution[0] === basic, "Revive benches the Basic")
  expect(gamestate.players[1].bench[0].damage === 20, "Revive puts half HP rounded down to 10 (Pidgey 40 → 20)")
}

console.log("bench-place-check assertions passed")
