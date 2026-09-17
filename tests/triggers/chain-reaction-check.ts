import base from "../../data/cards/base1.json" with { type: "json" }
import jungle from "../../data/cards/base2.json" with { type: "json" }
import promo from "../../data/cards/basep.json" with { type: "json" }
import effects from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { currentForm } from "../../board.js"
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr, stateMachine } from "../../machine.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { validateExpr } from "../../validate.js"
import {
  copies, liveTurn, moveToActive, moveToBench, printed, toDeck, toHand } from "../fixture.js"

const set = base as Card[]
const jungleSet = jungle as Card[]
const promoSet = promo as Card[]
const dump = effects as EffectRegistry

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function withChain(gamestate: GameState): GameState {
  const row = dump["basep-11"]
  const existing = gamestate.effectRegistry["basep-11"] ?? {}
  return {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      "basep-11": { ...existing, ...row },
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

function chooseCard(gamestate: GameState, sourceId: string): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.Choose &&
      row.pick === "cards" &&
      gamestate.cardRegistry[row.card].sourceId === sourceId
  )
  if (!action) fail(`no card choice ${sourceId}`)
  return stateMachine(gamestate, action)
}

function board(): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [
      printed(set, "base1-46"),
      printed(set, "base1-24"),
      printed(promoSet, "basep-11"),
      printed(jungleSet, "base2-3"),
      ...copies(energy, 14),
    ],
    [printed(set, "base1-8"), ...copies(energy, 17)],
    dump
  )
  gamestate = moveToActive(gamestate, 1, "base1-46")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = moveToBench(gamestate, 1, "basep-11", 0)
  gamestate = toHand(gamestate, 1, "base1-24", 1)
  return liveTurn(withChain(gamestate))
}

{
  const then = dump["basep-11"]?.triggers?.["Chain Reaction"]?.then
  expect((then?.length ?? 0) > 0, "basep-11 Chain Reaction: missing dump row")
  const err = validateExpr(then!)
  expect(err === null, `basep-11 Chain Reaction: ${err}`)
}

{
  let gamestate = board()
  gamestate = toDeck(gamestate, 1, "base2-3", 1)
  gamestate = evolveActive(gamestate)
  expect(gamestate.actionStack.length === 1, "search pauses when an Eevee evolution is in the deck")
  gamestate = chooseCard(gamestate, "base2-3")
  expect(currentForm(gamestate, gamestate.players[1].bench[0])?.sourceId === "base2-3", "Flareon lands on Eevee")
  expect(gamestate.players[1].bench[0].evolution.length === 2, "Eevee stays under Flareon")
  expect(
    !gamestate.players[1].deck.some((id) => gamestate.cardRegistry[id].sourceId === "base2-3"),
    "chosen card left the deck"
  )
  expect(gamestate.actionStack.length === 0, "search Select does not deadlock")
}

{
  let gamestate = board()
  gamestate = toHand(gamestate, 1, "base2-3", 1)
  const before = gamestate.players[1].deck.slice()
  gamestate = evolveActive(gamestate)
  expect(gamestate.actionStack.length === 0, "empty search skips Select")
  expect(currentForm(gamestate, gamestate.players[1].bench[0])?.sourceId === "basep-11", "Eevee stays a Basic")
  expect(
    gamestate.players[1].hand.some((id) => gamestate.cardRegistry[id].sourceId === "base2-3"),
    "Flareon in hand is not searched"
  )
  expect(
    gamestate.history.some((entry) => entry.op === Op.Shuffle),
    "empty search still shuffles"
  )
  expect(gamestate.players[1].deck.length === before.length, "skipped search does not move a card")
}

console.log("chain-reaction-check assertions passed")
