import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { Action, Op } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { babyCoinOnAnnounce, legalEnergyTypes } from "../../reads.js"
import { selectChoices, selectFrame } from "../../select.js"
import type { Card, EffectRegistry, EnergyType, GameState } from "../../types.js"
import { copies, liveTurn, moveToActive, printed } from "../fixture.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function typeMenu(gamestate: GameState, except: EnergyType[] = ["Colorless"]): string[] {
  const frame = selectFrame(
    { op: Op.Select, pick: "types", bind: "$type", except },
    { bindings: {} },
    1,
    Action.Attack,
    []
  )
  if (!frame) fail("types select frame")
  return selectChoices(gamestate, frame).flatMap((choice) =>
    choice.pick === "types" ? [choice.name] : []
  )
}

{
  const energy = printed(set, "base1-97")
  const baseGame = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), ...copies(energy, 17)],
    registry
  )
  expect(baseGame.ruleset === "wotc-base", "default book is wotc-base")
  const neo = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), ...copies(energy, 17)],
    registry,
    "wotc-neo"
  )
  expect(neo.ruleset === "wotc-neo", "optional 4th arg sets the book")
}

{
  const energy = printed(set, "base1-97")
  let baseGame = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), ...copies(energy, 17)],
    registry
  )
  baseGame = moveToActive(baseGame, 1, "base1-52")
  baseGame = moveToActive(baseGame, 2, "basep-35")
  baseGame = liveTurn(baseGame)
  expect(!babyCoinOnAnnounce(baseGame, 1), "wotc-base does not coin on a defending Baby")

  let neo = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), ...copies(energy, 17)],
    registry,
    "wotc-neo"
  )
  neo = moveToActive(neo, 1, "base1-52")
  neo = moveToActive(neo, 2, "basep-35")
  neo = liveTurn(neo)
  expect(babyCoinOnAnnounce(neo, 1), "wotc-neo coins on a defending Active Baby")
}

{
  const energy = printed(set, "base1-97")
  const baseGame = liveTurn(
    initializeGameState(
      [printed(set, "base1-58"), ...copies(energy, 17)],
      [printed(set, "base1-58"), ...copies(energy, 17)],
      {}
    )
  )
  const neo = liveTurn(
    initializeGameState(
      [printed(set, "base1-58"), ...copies(energy, 17)],
      [printed(set, "base1-58"), ...copies(energy, 17)],
      {},
      "wotc-neo"
    )
  )
  const baseTypes = typeMenu(baseGame)
  const neoTypes = typeMenu(neo)
  expect(baseTypes.includes("Water"), "wotc-base Conversion still offers Water")
  expect(!baseTypes.includes("Colorless"), "except still drops Colorless")
  expect(!baseTypes.includes("Darkness"), "wotc-base does not offer Darkness")
  expect(!baseTypes.includes("Metal"), "wotc-base does not offer Metal")
  expect(!baseTypes.includes("Fairy"), "neither book offers Fairy")
  expect(neoTypes.includes("Darkness") && neoTypes.includes("Metal"), "wotc-neo adds Darkness and Metal")
  expect(
    legalEnergyTypes("wotc-base").every((type) => type !== "Free" && type !== "Dragon"),
    "catalog Free / Dragon stay out of the choose menu"
  )
}

console.log("ruleset-check assertions passed")
