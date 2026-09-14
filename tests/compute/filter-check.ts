import cards from "../../data/cards/base1.json" with { type: "json" }
import { Action, Op } from "../../dsl.js"
import { selectChoices, selectFrame } from "../../select.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, copies, liveTurn, printed, toHand } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

async function stage(): GameState {
  const fire = printed(set, "base1-46")
  const evo = printed(set, "base1-24")
  const bill = printed(set, "base1-91")
  const energy = printed(set, "base1-98")
  let gamestate = await initBoard(
    [fire, evo, bill, ...copies(energy, 15)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = toHand(gamestate, 1, "base1-46", 1)
  gamestate = toHand(gamestate, 1, "base1-24", 1)
  gamestate = toHand(gamestate, 1, "base1-91", 1)
  return liveTurn(gamestate)
}

{
  const gamestate = await stage()
  const frame = selectFrame(
    {
      op: Op.Select,
      pick: "cards",
      source: { player: 1, zone: "hand" },
      bind: "$pick",
      filter: [{ kind: "pokemon" }, { kind: "evolves_from", name: "Charmander" }],
    },
    { bindings: {} },
    1,
    Action.Attack,
    []
  )
  if (!frame) fail("card select frame")
  const ids = selectChoices(gamestate, frame).flatMap((choice) =>
    choice.pick === "cards" ? [gamestate.cardRegistry[choice.card].sourceId] : []
  )
  expect(ids.includes("base1-24"), "intersection keeps Charmeleon")
  expect(!ids.includes("base1-46"), "pokemon-only would keep Charmander")
  expect(!ids.includes("base1-91"), "trainer is not pokemon")
}

console.log("filter-check assertions passed")
