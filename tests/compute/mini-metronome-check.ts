import base from "../../data/cards/base1.json" with { type: "json" }
import promo from "../../data/cards/basep.json" with { type: "json" }
import baseDump from "../../../effect-author/effects/effects_base1.json" with { type: "json" }
import promoDump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type InterpretCtx } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr, stateMachine } from "../../machine.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, printed } from "../fixture.js"
import { validateExpr } from "../../validate.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = { ...baseDump, ...promoDump } as EffectRegistry
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function ctx(copy: string): InterpretCtx {
  return {
    via: "attack",
    bindings: {
      $self_slot: attacker,
      $defending: defending,
      $energy: { ...attacker, attachment: "energy" },
      $discard: { player: 1, zone: "discard" },
      $copy: copy,
    },
  }
}

function stage(defenderId: string, defenderEnergy: number): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(promos, "basep-30"), ...copies(energy, 40)],
    [printed(set, defenderId), ...copies(energy, 40)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-30")
  gamestate = moveToActive(gamestate, 2, defenderId)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  if (defenderEnergy > 0) gamestate = attachEnergy(gamestate, 2, "base1-100", defenderEnergy)
  return liveTurn(gamestate)
}

function playMini(gamestate: GameState, coin: "heads" | "tails"): GameState {
  const expr = registry["basep-30"]?.attacks?.["Mini-Metronome"]
  if (!expr) fail("no Mini-Metronome dump")
  return runExpr(
    gamestate,
    expr,
    {
      via: "attack",
      attack: "Mini-Metronome",
      bindings: {
        $self_slot: attacker,
        $defending: defending,
        $energy: { ...attacker, attachment: "energy" },
        $discard: { player: 1, zone: "discard" },
      },
      script: { coins: [coin] },
    },
    1,
    Action.Attack
  )
}

function chooseAttack(gamestate: GameState, name: string): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "attacks" && row.name === name
  )
  if (!action) fail(`no attack choice ${name}`)
  return stateMachine(gamestate, action)
}

{
  const expr = registry["basep-30"]?.attacks?.["Mini-Metronome"]
  expect((expr?.length ?? 0) > 0, "basep-30 Mini-Metronome: missing dump row")
  const err = validateExpr(expr!)
  expect(err === null, `basep-30 Mini-Metronome: ${err}`)
  const run = expr?.flatMap((step) => (step.op === Op.If ? step.then : [step])).find((step) => step.op === Op.RunEffect)
  expect(run?.op === Op.RunEffect && (run.strip?.length ?? 0) === 0, "Mini-Metronome is a full copy")
  expect(
    computeAvailableActions(stage("base1-4", 2)).some(
      (row) => row.kind === Action.Attack && row.name === "Mini-Metronome"
    ),
    "Mini-Metronome lists"
  )
}

{
  const gamestate = playMini(stage("base1-4", 2), "tails")
  expect(gamestate.players[2].active.damage === 0, "Mini-Metronome tails does not copy")
  expect(gamestate.actionStack.length === 0, "Mini-Metronome tails does not pause")
}

{
  let gamestate = playMini(stage("base1-4", 2), "heads")
  gamestate = chooseAttack(gamestate, "Fire Spin")
  expect(gamestate.actionStack.length === 1, "Mini-Metronome keeps Fire Spin pay")
  expect(
    computeAvailableActions(gamestate).some((row) => row.kind === Action.Choose && row.pick === "cards"),
    "Mini-Metronome Fire Spin asks for Energy"
  )
}

{
  const gamestate = runExpr(
    stage("base1-3", 0),
    [{ op: Op.RunEffect, attack: "$copy", slot: defending }],
    ctx("Double-edge"),
    1,
    Action.Attack
  )
  expect(gamestate.players[1].active.damage === 80, "Mini-Metronome keeps Double-edge recoil")
}

{
  const gamestate = runExpr(
    stage("base1-3", 0),
    [{ op: Op.RunEffect, attack: "$copy", slot: defending, strip: ["recoil"] }],
    ctx("Double-edge"),
    1,
    Action.Attack
  )
  expect(gamestate.players[1].active.damage === 0, "recoil strip drops Double-edge self damage")
}

console.log("mini-metronome-check assertions passed")
