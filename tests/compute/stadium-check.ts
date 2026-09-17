import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr } from "../../machine.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { copies, liveTurn, moveToActive, printed, toHand } from "../fixture.js"
import { moveZoneToZone } from "../../ops.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry

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

function useStadium(gamestate: GameState, name: string, coins: Array<"heads" | "tails">): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.UseStadium && row.name === name
  )
  if (!action || action.kind !== Action.UseStadium) fail(`no use ${name}`)
  const next = runExpr(
    gamestate,
    action.expr,
    { bindings: action.seed ?? {}, script: { coins: [...coins] } },
    1,
    Action.UseStadium
  )
  return { ...next, stadiumUsedThisTurn: true }
}

function energyOffBoard(gamestate: GameState, player: 1 | 2): { card: string; zone: "hand" | "deck" | "prize" } {
  for (const zone of ["hand", "deck", "prize"] as const) {
    const card = gamestate.players[player][zone].find((id) => gamestate.cardRegistry[id].sourceId === "base1-100")
    if (card) return { card, zone }
  }
  fail(`no energy off board for p${player}`)
}

function stage(): GameState {
  const lucky = printed(promos, "basep-41")
  const tower = printed(promos, "basep-42")
  const pika = printed(set, "base1-58")
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [lucky, tower, pika, ...copies(energy, 16)],
    [pika, ...copies(energy, 17)],
    registry
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
    computeAvailableActions(gamestate).every((row) => row.kind !== Action.UseStadium),
    "use is not listed before play"
  )
  expect(
    computeAvailableActions(gamestate).some(
      (row) => row.kind === Action.PlayTrainer && gamestate.cardRegistry[row.card].sourceId === "basep-41"
    ),
    "Lucky Stadium lists without a trainer dump row"
  )
  gamestate = playStadium(gamestate, "basep-41")
  expect(gamestate.stadium?.card != null, "Lucky Stadium lands")
  expect(gamestate.cardRegistry[gamestate.stadium!.card].sourceId === "basep-41", "in-play id is Lucky Stadium")
  expect(!gamestate.players[1].hand.some((id) => gamestate.cardRegistry[id].sourceId === "basep-41"), "left the hand")
  expect(!gamestate.players[1].discard.some((id) => gamestate.cardRegistry[id].sourceId === "basep-41"), "not discarded on play")
  expect(
    computeAvailableActions(gamestate).some((row) => row.kind === Action.UseStadium && row.name === "Lucky Stadium"),
    "use lists after play"
  )
  const first = gamestate.stadium!.card
  gamestate = playStadium(gamestate, "basep-42")
  expect(gamestate.cardRegistry[gamestate.stadium!.card].sourceId === "basep-42", "Tower replaces")
  expect(gamestate.players[1].discard.includes(first), "old Stadium goes to owner's discard")
  expect(
    computeAvailableActions(gamestate).every((row) => row.kind !== Action.UseStadium),
    "Tower has no use spec"
  )
}

{
  let gamestate = stage()
  gamestate = playStadium(gamestate, "basep-41")
  const before = gamestate.players[1].hand.length
  gamestate = useStadium(gamestate, "Lucky Stadium", ["heads"])
  expect(gamestate.players[1].hand.length === before + 1, "heads draws")
  expect(gamestate.stadiumUsedThisTurn, "heads spends the turn cap")
  expect(
    computeAvailableActions(gamestate).every((row) => row.kind !== Action.UseStadium),
    "no second use this turn"
  )
  gamestate = liveTurn(gamestate)
  expect(
    computeAvailableActions(gamestate).some((row) => row.kind === Action.UseStadium),
    "next turn lists again"
  )
}

{
  let gamestate = stage()
  gamestate = playStadium(gamestate, "basep-41")
  const before = gamestate.players[1].hand.length
  gamestate = useStadium(gamestate, "Lucky Stadium", ["tails"])
  expect(gamestate.players[1].hand.length === before, "tails draws nothing")
  expect(gamestate.stadiumUsedThisTurn, "tails still spends the turn cap")
  expect(
    computeAvailableActions(gamestate).every((row) => row.kind !== Action.UseStadium),
    "tails still blocks a second use"
  )
}

{
  let gamestate = stage()
  gamestate = playStadium(gamestate, "basep-41")
  const { card: energy, zone } = energyOffBoard(gamestate, 1)
  gamestate = moveZoneToZone(gamestate, energy, { player: 1, zone }, { player: 1, zone: "discard" }, "bottom")
  gamestate = moveZoneToZone(
    gamestate,
    energy,
    { player: 1, zone: "discard" },
    { player: 1, zone: "hand" },
    "bottom"
  )
  expect(gamestate.players[1].hand.includes(energy), "Lucky Stadium does not block retrieval")
}

{
  let gamestate = stage()
  gamestate = playStadium(gamestate, "basep-42")
  const { card: energy, zone } = energyOffBoard(gamestate, 1)
  gamestate = moveZoneToZone(gamestate, energy, { player: 1, zone }, { player: 1, zone: "discard" }, "bottom")
  gamestate = moveZoneToZone(
    gamestate,
    energy,
    { player: 1, zone: "discard" },
    { player: 1, zone: "hand" },
    "bottom"
  )
  expect(gamestate.players[1].discard.includes(energy), "Tower keeps discard→hand in discard")
  expect(!gamestate.players[1].hand.includes(energy), "Tower does not put it in hand")
  gamestate = moveZoneToZone(
    gamestate,
    energy,
    { player: 1, zone: "discard" },
    { player: 1, zone: "deck" },
    "bottom"
  )
  expect(gamestate.players[1].deck.includes(energy), "Tower does not block discard→deck")
}

console.log("stadium-check assertions passed")
