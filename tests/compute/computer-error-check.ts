import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { stateMachine } from "../../machine.js"
import { applyDamage } from "../../ops.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { Phase } from "../../types.js"
import { copies, liveTurn, moveToActive, printed, toHand } from "../fixture.js"
import { validateExpr } from "../../validate.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function playTrainer(gamestate: GameState, sourceId: string): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.PlayTrainer && gamestate.cardRegistry[row.card].sourceId === sourceId
  )
  if (!action) fail(`no play ${sourceId}`)
  return stateMachine(gamestate, action)
}

function skip(gamestate: GameState, player: 1 | 2): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "skip" && row.player === player
  )
  if (!action) fail(`no skip for p${player}`)
  return stateMachine(gamestate, action)
}

function chooseDraw(gamestate: GameState, player: 1 | 2): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.Choose &&
      row.pick === "names" &&
      row.name === "Draw" &&
      row.player === player
  )
  if (!action) fail(`no Draw for p${player}`)
  return stateMachine(gamestate, action)
}

function stage(): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [
      printed(promos, "basep-16"),
      printed(promos, "basep-40"),
      printed(set, "base1-58"),
      ...copies(energy, 40),
    ],
    [printed(set, "base1-58"), ...copies(energy, 40)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "basep-16", 1)
  gamestate = toHand(gamestate, 1, "basep-40", 1)
  return liveTurn(gamestate)
}

{
  const expr = registry["basep-16"]?.trainer?.["Computer Error"]
  expect((expr?.length ?? 0) > 0, "basep-16 Computer Error: missing dump row")
  const err = validateExpr(expr!)
  expect(err === null, `basep-16 Computer Error: ${err}`)
}

{
  let gamestate = stage()
  expect(gamestate.activePlayer === 1, "P1 to play")
  gamestate = playTrainer(gamestate, "basep-16")
  expect(gamestate.actionStack.length === 1, "self draw-up-to pauses")
  expect(gamestate.phase === Phase.Turn, "paused draw does not Checkup")
  gamestate = skip(gamestate, 1)
  expect(gamestate.actionStack.length === 1, "opponent draw-up-to pauses")
  const opp = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "skip"
  )
  expect(opp?.player === 2, "opponent chooses their draws")
  gamestate = skip(gamestate, 2)
  expect(gamestate.actionStack.length === 0, "end_turn does not deadlock")
  expect(gamestate.activePlayer === 2, "Computer Error ends the turn")
  expect(gamestate.phase === Phase.Turn, "Checkup handed the next turn")
  expect(
    computeAvailableActions(gamestate).every((row) => row.player === 2),
    "P1 cannot attack after Computer Error"
  )
}

{
  let gamestate = stage()
  const before = gamestate.players[1].hand.length
  gamestate = playTrainer(gamestate, "basep-16")
  gamestate = chooseDraw(gamestate, 1)
  gamestate = chooseDraw(gamestate, 1)
  gamestate = skip(gamestate, 1)
  gamestate = skip(gamestate, 2)
  expect(
    gamestate.players[1].hand.length === before - 1 + 2,
    "discard the trainer, then two self draws"
  )
  expect(gamestate.activePlayer === 2, "draws still end the turn")
}

{
  let gamestate = stage()
  gamestate = applyDamage(gamestate, 10, { player: 1, slot: "active" })
  gamestate = playTrainer(gamestate, "basep-40")
  expect(gamestate.activePlayer === 1, "a normal Trainer does not end the turn")
  expect(gamestate.phase === Phase.Turn, "Pokémon Center stays in Turn")
}

console.log("computer-error-check assertions passed")
