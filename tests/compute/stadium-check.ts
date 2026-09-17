import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr } from "../../machine.js"
import type { Card, GameState } from "../../types.js"
import { copies, liveTurn, moveToActive, printed, toHand } from "../fixture.js"

const set = base as Card[]
const promos = promo as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function playStadium(gamestate: GameState, sourceId: string): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.PlayTrainer && gamestate.cardRegistry[row.card].sourceId === sourceId
  )
  if (!action || action.kind !== Action.PlayTrainer) fail(`no play ${sourceId}`)
  return runExpr(gamestate, action.expr, { bindings: action.seed ?? {} }, 1, Action.PlayTrainer)
}

function stage(): GameState {
  const lucky = printed(promos, "basep-41")
  const tower = printed(promos, "basep-42")
  const pika = printed(set, "base1-58")
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [lucky, tower, pika, ...copies(energy, 16)],
    [pika, ...copies(energy, 17)],
    {}
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "basep-41", 1)
  gamestate = toHand(gamestate, 1, "basep-42", 1)
  return liveTurn(gamestate)
}

{
  let gamestate = stage()
  expect(gamestate.stadium === null, "no stadium at start")
  expect(
    computeAvailableActions(gamestate).some(
      (row) => row.kind === Action.PlayTrainer && gamestate.cardRegistry[row.card].sourceId === "basep-41"
    ),
    "Lucky Stadium lists without a dump row"
  )
  gamestate = playStadium(gamestate, "basep-41")
  expect(gamestate.stadium?.card != null, "Lucky Stadium lands")
  expect(gamestate.cardRegistry[gamestate.stadium!.card].sourceId === "basep-41", "in-play id is Lucky Stadium")
  expect(!gamestate.players[1].hand.some((id) => gamestate.cardRegistry[id].sourceId === "basep-41"), "left the hand")
  expect(!gamestate.players[1].discard.some((id) => gamestate.cardRegistry[id].sourceId === "basep-41"), "not discarded on play")
  const first = gamestate.stadium!.card
  gamestate = playStadium(gamestate, "basep-42")
  expect(gamestate.cardRegistry[gamestate.stadium!.card].sourceId === "basep-42", "Tower replaces")
  expect(gamestate.players[1].discard.includes(first), "old Stadium goes to owner's discard")
}

console.log("stadium-check assertions passed")
