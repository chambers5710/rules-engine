import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type InterpretCtx } from "../../dsl.js"
import { stripCopy } from "../../effects.js"
import { initializeGameState } from "../../initialize.js"
import { copiedAttackExpr, runExpr } from "../../machine.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, printed } from "../fixture.js"

const set = base as Card[]
const registry = dump as EffectRegistry
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const
const metronomeStrip = ["energy_pay", "recoil"] as const

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function stage(defenderId: string, defenderEnergy: number): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(set, "base1-5"), ...copies(energy, 40)],
    [printed(set, defenderId), ...copies(energy, 40)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-5")
  gamestate = moveToActive(gamestate, 2, defenderId)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  if (defenderEnergy > 0) gamestate = attachEnergy(gamestate, 2, "base1-100", defenderEnergy)
  return liveTurn(gamestate)
}

function ctx(copy?: string): InterpretCtx {
  return {
    via: "attack",
    bindings: {
      $self_slot: attacker,
      $defending: defending,
      $energy: { ...attacker, attachment: "energy" },
      $discard: { player: 1, zone: "discard" },
      ...(copy ? { $copy: copy } : {}),
    },
  }
}

function playStripped(gamestate: GameState, name: string): GameState {
  return runExpr(
    gamestate,
    stripCopy(copiedAttackExpr(gamestate, defending, name), metronomeStrip),
    ctx(),
    1,
    Action.Attack
  )
}

{
  const row = registry["base1-5"]?.attacks?.["Metronome"]
  const run = row?.find((step) => step.op === Op.RunEffect)
  expect(run?.op === Op.RunEffect && run.strip?.includes("energy_pay") === true, "Clefairy Metronome strips energy pay")
  expect(run?.op === Op.RunEffect && run.strip?.includes("recoil") === true, "Clefairy Metronome strips recoil")
}

{
  const full = copiedAttackExpr(stage("base1-4", 2), defending, "Fire Spin")
  expect(full.some((step) => step.op === Op.Select), "Fire Spin as written keeps pay")
  const expr = stripCopy(full, metronomeStrip)
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Fire Spin Metronome drops pay")
  expect(expr[0]?.op === Op.Attack, "Fire Spin Metronome is the hit")
}

{
  const before = stage("base1-4", 2)
  const gamestate = playStripped(before, "Fire Spin")
  expect(gamestate.players[2].active.damage === 100, "Fire Spin Metronome deals 100")
  expect(gamestate.players[1].active.energy.length === 2, "Fire Spin Metronome does not discard Clefairy Energy")
  expect(gamestate.actionStack.length === 0, "Fire Spin Metronome does not pause")
}

{
  const before = stage("base1-4", 2)
  const gamestate = runExpr(
    before,
    [{ op: Op.RunEffect, attack: "$copy", slot: defending, strip: [...metronomeStrip] }],
    ctx("Fire Spin"),
    1,
    Action.Attack
  )
  expect(gamestate.actionStack.length === 0, "run_effect strip is what drops pay")
  expect(gamestate.players[1].active.energy.length === 2, "run_effect strip does not discard")
}

{
  const before = stage("base1-4", 2)
  const gamestate = runExpr(
    before,
    [{ op: Op.RunEffect, attack: "$copy", slot: defending }],
    ctx("Fire Spin"),
    1,
    Action.Attack
  )
  expect(gamestate.actionStack.length === 1, "full copy keeps Fire Spin pay")
}

{
  const expr = stripCopy(copiedAttackExpr(stage("base1-16", 2), defending, "Thunderbolt"), metronomeStrip)
  expect(expr.every((step) => step.op !== Op.Loop), "Thunderbolt Metronome drops the strip loop")
  expect(expr[0]?.op === Op.Attack, "Thunderbolt Metronome is the hit")
}

{
  const gamestate = playStripped(stage("base1-16", 2), "Thunderbolt")
  expect(gamestate.players[2].active.damage === 100, "Thunderbolt Metronome deals 100")
  expect(gamestate.players[1].active.energy.length === 2, "Thunderbolt Metronome does not strip Clefairy Energy")
}

{
  const expr = stripCopy(copiedAttackExpr(stage("base1-32", 1), defending, "Recover"), metronomeStrip)
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Recover Metronome drops pay")
  expect(expr.some((step) => step.op === Op.ApplyDamage), "Recover Metronome still heals")
}

{
  let gamestate = stage("base1-32", 1)
  gamestate.players[1].active.damage = 20
  gamestate = playStripped(gamestate, "Recover")
  expect(gamestate.players[1].active.damage === 0, "Recover Metronome heals")
  expect(gamestate.players[1].active.energy.length === 2, "Recover Metronome does not discard Energy")
}

{
  const expr = copiedAttackExpr(stage("base1-18", 1), defending, "Hyper Beam")
  expect(expr[0]?.op === Op.Attack, "Hyper Beam copy keeps the hit")
  expect(expr.some((step) => step.op === Op.If), "Hyper Beam copy keeps the defending discard")
}

{
  const expr = stripCopy(copiedAttackExpr(stage("base1-3", 0), defending, "Double-edge"), metronomeStrip)
  expect(
    expr.every((step) => step.op !== Op.ApplyDamage || step.slot !== "$self_slot"),
    "Double-edge Metronome drops recoil"
  )
}

{
  const expr = stripCopy(copiedAttackExpr(stage("base1-10", 1), defending, "Barrier"), metronomeStrip)
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Barrier Metronome drops pay")
  expect(expr.some((step) => step.op === Op.ApplyModifier), "Barrier Metronome still shields")
}

{
  const expr = registry["base1-5"]?.attacks?.["Metronome"]
  if (!expr) fail("no Metronome dump")
  const gamestate = runExpr(stage("base1-5", 0), expr, ctx(), 1, Action.Attack)
  expect(gamestate.actionStack.length === 1, "Metronome vs Clefairy pauses")
  const names = computeAvailableActions(gamestate).flatMap((row) =>
    row.kind === Action.Choose && row.pick === "attacks" ? [row.name] : []
  )
  expect(names.includes("Sing"), "Metronome can copy Sing")
  expect(!names.includes("Metronome"), "Metronome cannot copy Metronome")
}

console.log("metronome-copy-check assertions passed")
