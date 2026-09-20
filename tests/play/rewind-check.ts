import cards from "../../data/cards/base1.json" with { type: "json" }
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../src/play.js"
import type { Card, GameState } from "../../types.js"
import { copies, printed } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function snapshot(gamestate: GameState) {
  return JSON.stringify(gamestate)
}

function playActiveIndex(choices: { label: string; player: 1 | 2 }[], player: 1 | 2) {
  const index = choices.findIndex((choice) => choice.player === player && choice.label.startsWith("play_active"))
  if (index < 0) fail(`no play_active for p${player}`)
  return index
}

function throws(run: () => void, message: string) {
  try {
    run()
  } catch {
    return
  }
  fail(message)
}

function opening(): GameState {
  const pidgey = printed(set, "base1-57")
  const magikarp = printed(set, "base1-52")
  const colorless = printed(set, "base1-101")
  const water = printed(set, "base1-102")
  return initializeGameState(
    [pidgey, pidgey, ...copies(colorless, 16)],
    [magikarp, magikarp, ...copies(water, 16)],
    {},
  )
}

{
  const session = createSessionFromState(opening(), { p1: "d-base1-1", p2: "d-base1-2" })
  const start = session.frame()
  const startId = start.gamestate.id
  const before = snapshot(start.gamestate)
  const startChoices = start.choices.map((choice) => choice.label)
  expect(start.rewindDepth === 0, "opening rewindDepth is 0")

  throws(() => session.rewind(), "rewind with an empty stack throws")
  throws(() => session.rewind(0), "rewind(0) throws")
  throws(() => session.rewind(1.5), "rewind(1.5) throws")

  const first = playActiveIndex(start.choices, 1)
  session.choose(first)
  const afterOne = session.frame()
  expect(afterOne.rewindDepth === 1, "choose records rewindDepth")
  expect(afterOne.gamestate.id === startId, "choose keeps GameState.id")
  expect(afterOne.gamestate.players[1].active.evolution.length === 1, "play_active occupies Active")
  expect(snapshot(afterOne.gamestate) !== before, "choose writes a new board")

  afterOne.gamestate.history = [...afterOne.gamestate.history, { op: "end_turn" } as never]

  const undone = session.rewind()
  expect(undone.rewindDepth === 0, "rewind(1) clears rewindDepth")
  expect(undone.gamestate.id === startId, "rewind restores the same GameState.id")
  expect(snapshot(undone.gamestate) === before, "rewind restores the pre-choose board")
  expect(
    undone.choices.map((choice) => choice.label).join("\n") === startChoices.join("\n"),
    "rewind recomputes the same menu",
  )
  expect(undone.gamestate.players[1].active.evolution.length === 0, "rewind clears Active")
}

{
  const session = createSessionFromState(opening(), { p1: "d-base1-1", p2: "d-base1-2" })
  const origin = snapshot(session.frame().gamestate)
  session.choose(playActiveIndex(session.frame().choices, 1))
  const afterFirst = snapshot(session.frame().gamestate)
  session.choose(playActiveIndex(session.frame().choices, 2))
  expect(session.frame().gamestate.players[2].active.evolution.length === 1, "second play_active occupies P2 Active")

  throws(() => session.rewind(3), "rewind past the stack throws without popping")
  expect(session.frame().gamestate.players[2].active.evolution.length === 1, "failed rewind leaves the board")

  expect(session.frame().rewindDepth === 2, "two chooses → rewindDepth 2")
  const backOne = session.rewind(1)
  expect(backOne.rewindDepth === 1, "rewind(1) leaves one step")
  expect(snapshot(backOne.gamestate) === afterFirst, "rewind(1) is the previous choose")
  expect(backOne.gamestate.players[2].active.evolution.length === 0, "rewind(1) undoes P2 Active")

  session.choose(playActiveIndex(session.frame().choices, 2))
  const backTwo = session.rewind(2)
  expect(backTwo.rewindDepth === 0, "rewind(2) returns to the opening stack")
  expect(snapshot(backTwo.gamestate) === origin, "rewind(2) restores the opening snapshot")
  expect(backTwo.gamestate.players[1].active.evolution.length === 0, "rewind(2) undoes both Actives")
}

{
  const decks = { p1: "d-base1-1", p2: "d-base1-2" }
  const live = createSessionFromState(opening(), decks)
  live.choose(playActiveIndex(live.frame().choices, 1))
  const mid = live.frame()
  const resumed = createSessionFromState(mid.gamestate, decks, live.checkpoints())
  expect(resumed.frame().rewindDepth === 1, "restored checkpoints keep rewindDepth")
  const undone = resumed.rewind()
  expect(undone.rewindDepth === 0, "restored session can rewind")
  expect(undone.gamestate.players[1].active.evolution.length === 0, "restored rewind clears Active")
}

console.log("play rewind-check ok")
