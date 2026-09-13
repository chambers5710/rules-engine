import cards from "../../data/cards/base1.json" with { type: "json" }
import { Action, Op, type InterpretCtx } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { copiedAttackExpr, runExpr } from "../../machine.js"
import type { Card, GameState } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, printed } from "../fixture.js"

const set = cards as Card[]
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function stage(defenderId: string, defenderEnergy: number): GameState {
  const clefairy = printed(set, "base1-5")
  const foe = printed(set, defenderId)
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [clefairy, ...copies(energy, 17)],
    [foe, ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-5")
  gamestate = moveToActive(gamestate, 2, defenderId)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  if (defenderEnergy > 0) gamestate = attachEnergy(gamestate, 2, "base1-100", defenderEnergy)
  return liveTurn(gamestate)
}

function ctx(): InterpretCtx {
  return {
    via: "attack",
    bindings: { $self_slot: attacker, $defending: defending, $energy: { ...attacker, attachment: "energy" } },
  }
}

function playCopy(gamestate: GameState, name: string): GameState {
  return runExpr(gamestate, copiedAttackExpr(gamestate, defending, name), ctx(), 1, Action.Attack)
}

{
  const expr = copiedAttackExpr(stage("base1-4", 2), defending, "Fire Spin")
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Fire Spin copy drops pay")
  expect(expr[0]?.op === Op.Attack, "Fire Spin copy is the hit")
}

{
  const before = stage("base1-4", 2)
  const gamestate = playCopy(before, "Fire Spin")
  expect(gamestate.players[2].active.damage === 100, "Fire Spin copy deals 100")
  expect(gamestate.players[1].active.energy.length === 2, "Fire Spin copy does not discard Clefairy Energy")
  expect(gamestate.actionStack.length === 0, "Fire Spin copy does not pause")
}

{
  const expr = copiedAttackExpr(stage("base1-16", 2), defending, "Thunderbolt")
  expect(expr.every((step) => step.op !== Op.Loop), "Thunderbolt copy drops the strip loop")
  expect(expr[0]?.op === Op.Attack, "Thunderbolt copy is the hit")
}

{
  const gamestate = playCopy(stage("base1-16", 2), "Thunderbolt")
  expect(gamestate.players[2].active.damage === 100, "Thunderbolt copy deals 100")
  expect(gamestate.players[1].active.energy.length === 2, "Thunderbolt copy does not strip Clefairy Energy")
}

{
  const expr = copiedAttackExpr(stage("base1-32", 1), defending, "Recover")
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Recover copy drops pay")
  expect(expr.some((step) => step.op === Op.ApplyDamage), "Recover copy still heals")
}

{
  let gamestate = stage("base1-32", 1)
  gamestate.players[1].active.damage = 20
  gamestate = playCopy(gamestate, "Recover")
  expect(gamestate.players[1].active.damage === 0, "Recover copy heals")
  expect(gamestate.players[1].active.energy.length === 2, "Recover copy does not discard Energy")
}

{
  const expr = copiedAttackExpr(stage("base1-18", 1), defending, "Hyper Beam")
  expect(expr[0]?.op === Op.Attack, "Hyper Beam copy keeps the hit")
  expect(expr.some((step) => step.op === Op.If), "Hyper Beam copy keeps the defending discard")
}

{
  const expr = copiedAttackExpr(stage("base1-3", 0), defending, "Double-edge")
  expect(
    expr.every((step) => step.op !== Op.ApplyDamage || step.slot !== "$self_slot"),
    "Double-edge copy still drops recoil"
  )
}

{
  const expr = copiedAttackExpr(stage("base1-10", 1), defending, "Barrier")
  expect(expr.every((step) => step.op !== Op.Select && step.op !== Op.MoveSlotToZone), "Barrier copy drops pay")
  expect(expr.some((step) => step.op === Op.ApplyModifier), "Barrier copy still shields")
}

console.log("metronome-copy-check assertions passed")
