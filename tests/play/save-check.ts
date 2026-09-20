import cards from "../../data/cards/base1.json" with { type: "json" }
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../src/play.js"
import { loadSavedState, makeSave, parseGameSave, parseGameSaveText } from "../../save.js"
import type { Card, GameState } from "../../types.js"
import { copies, printed } from "../fixture.js"

const set = cards as Card[]
const decks = { p1: "d-base1-1", p2: "d-base1-2" }

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
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

function playActiveIndex(choices: { label: string; player: 1 | 2 }[], player: 1 | 2) {
  const index = choices.findIndex((choice) => choice.player === player && choice.label.startsWith("play_active"))
  if (index < 0) fail(`no play_active for p${player}`)
  return index
}

{
  throws(() => parseGameSave([{ id: "d-base1-1", name: "Overgrowth", cards: [] }]), "deck JSON is not a save")
  throws(() => parseGameSaveText("{"), "broken JSON throws")
  throws(() => makeSave({ name: "  ", decks, gamestate: opening() }), "blank name throws")
}

{
  const live = createSessionFromState(opening(), decks)
  live.choose(playActiveIndex(live.frame().choices, 1))
  const mid = live.frame()
  const file = makeSave({
    name: " mid board ",
    decks,
    gamestate: mid.gamestate,
    custom: [{ id: "d-custom-1", name: "Test", types: [], cards: [{ id: "base1-57", name: "Pidgey", count: 2 }] }],
  })
  expect(file.kind === "tcg-save", "kind is tcg-save")
  expect(file.version === 1, "version is 1")
  expect(file.name === "mid board", "name is trimmed")
  const roundTrip = parseGameSaveText(JSON.stringify(file))
  expect(roundTrip.gamestate.id === mid.gamestate.id, "file keeps the saved GameState.id")
  const restored = loadSavedState(roundTrip)
  expect(restored.id !== mid.gamestate.id, "load mints a new GameState.id")
  expect(JSON.stringify({ ...restored, id: mid.gamestate.id }) === JSON.stringify(mid.gamestate), "load keeps the board")
  const session = createSessionFromState(restored, roundTrip.decks)
  expect(session.frame().rewindDepth === 0, "load starts with an empty rewind stack")
  expect(session.frame().gamestate.players[1].active.evolution.length === 1, "load restores Active")
  expect(
    session.frame().choices.map((choice) => choice.label).join("\n") ===
      mid.choices.map((choice) => choice.label).join("\n"),
    "load recomputes the same menu",
  )
}

console.log("play save-check ok")
