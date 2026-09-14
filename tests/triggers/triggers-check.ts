import cards from "../../data/cards/base1.json" with { type: "json" }
import { Action, Op, type InterpretCtx } from "../../dsl.js"
import { runExpr } from "../../machine.js"
import { applyModifier } from "../../modifiers.js"
import { tickSubscriptionsEnd, tickSubscriptionsEnter } from "../../triggers.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, copies, liveTurn, moveToActive, printed } from "../fixture.js"

const set = cards as Card[]
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

async function stage(): GameState {
  const hit = printed(set, "base1-58")
  const champ = printed(set, "base1-8")
  const energy = printed(set, "base1-100")
  let gamestate = await initBoard([hit, ...copies(energy, 17)], [champ, ...copies(energy, 17)])
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  return liveTurn(gamestate)
}

function attackCtx(): InterpretCtx {
  return {
    via: "attack",
    bindings: { $self_slot: attacker, $defending: defending },
  }
}

function play(gamestate: GameState, expr: Parameters<typeof runExpr>[1], ctx: InterpretCtx): GameState {
  return runExpr(gamestate, expr, ctx, 1, Action.Attack)
}

{
  const gamestate = play(await stage(), [
    { op: Op.Attack, base: 10, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[2].active.damage === 10, "attack damages Machamp")
  expect(gamestate.players[1].active.damage === 10, "Strikes Back hits the attacker")
}

{
  const next = await stage()
  next.players[2].active.status.confused = true
  const gamestate = play(next, [
    { op: Op.Attack, base: 10, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[2].active.damage === 10, "confused Machamp still takes the hit")
  expect(gamestate.players[1].active.damage === 0, "status blocks Strikes Back")
}

{
  const gamestate = play(await stage(), [
    { op: Op.ApplyDamage, amount: 10, slot: "$defending" },
  ], attackCtx())
  expect(gamestate.players[2].active.damage === 10, "splash damages Machamp")
  expect(gamestate.players[1].active.damage === 10, "Strikes Back matches splash")
}

{
  const gamestate = play(await stage(), [
    { op: Op.ApplyDamage, amount: 10, slot: "$defending", source: "poison" },
  ], { bindings: { $self_slot: attacker, $defending: defending } })
  expect(gamestate.players[2].active.damage === 10, "poison damages Machamp")
  expect(gamestate.players[1].active.damage === 0, "Strikes Back ignores Checkup")
}

{
  const gamestate = play(await stage(), [
    { op: Op.ApplyDamage, amount: 10, slot: "$self_slot" },
  ], attackCtx())
  expect(gamestate.players[1].active.damage === 10, "recoil hits the attacker")
  expect(gamestate.players[2].active.damage === 0, "recoil does not strike Machamp")
}

{
  let gamestate = applyModifier(await stage(), defending, {
    field: "attack_effects",
    prevent: "all",
    until: { beat: "end_of_turn", player: 1 },
  })
  gamestate = play(gamestate, [
    { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[2].active.damage === 0, "prevent-all writes no attack damage")
  expect(gamestate.players[1].active.damage === 0, "prevent-all emits no Strikes Back")
}

const bondThen: Parameters<typeof runExpr>[1] = [
  { op: Op.Arm, who: "opponent", when: "pokemon_knocked_out", via: ["attack", "splash"], blockedByStatus: false, then: [
    { op: Op.ApplyDamage, amount: 100, slot: "$attacker" },
  ] },
]

async function gastly(): GameState {
  const hit = printed(set, "base1-58")
  const ghost = printed(set, "base1-50")
  const energy = printed(set, "base1-100")
  let gamestate = await initBoard([hit, ...copies(energy, 17)], [ghost, ...copies(energy, 17)])
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-50")
  return liveTurn(gamestate)
}

function armBond(gamestate: GameState): GameState {
  return runExpr(
    { ...gamestate, activePlayer: 2 },
    bondThen,
    { bindings: { $self_slot: defending } },
    2,
    Action.Attack
  )
}

{
  let gamestate = tickSubscriptionsEnter(armBond(await gastly()), 1)
  gamestate = play(gamestate, [
    { op: Op.Attack, base: 40, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[2].active.damage >= 30, "attack KOs Gastly")
  expect(gamestate.players[1].active.damage >= 40, "Destiny Bond KOs the attacker")
}

{
  const gamestate = play(armBond(await gastly()), [
    { op: Op.Attack, base: 40, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[1].active.damage === 0, "pending Bond does not fire")
}

{
  let gamestate = tickSubscriptionsEnter(armBond(await gastly()), 1)
  gamestate = tickSubscriptionsEnd(gamestate, 1)
  gamestate = play(gamestate, [
    { op: Op.Attack, base: 40, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  expect(gamestate.players[1].active.damage === 0, "expired Bond does not fire")
}

{
  let gamestate = tickSubscriptionsEnter(armBond(await gastly()), 1)
  gamestate = play(gamestate, [
    { op: Op.ApplyDamage, amount: 40, slot: "$defending", source: "poison" },
  ], { bindings: { $self_slot: attacker, $defending: defending } })
  expect(gamestate.players[1].active.damage === 0, "poison KO does not Bond")
}

async function pidgeotto(): GameState {
  const hit = printed(set, "base1-58")
  const bird = printed(set, "base1-22")
  const energy = printed(set, "base1-100")
  let gamestate = await initBoard([hit, ...copies(energy, 17)], [bird, ...copies(energy, 17)])
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-22")
  return liveTurn(gamestate)
}

{
  let gamestate = play(await pidgeotto(), [
    { op: Op.Attack, base: 20, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  const applied = gamestate.players[2].active.damage
  gamestate = { ...gamestate, turnCount: gamestate.turnCount + 1 }
  gamestate = runExpr(gamestate, [
    { op: Op.Count, kind: "last_attacked", slot: "$self_slot", bind: "$was" },
    { op: Op.If, bind: "$was", equals: 1, then: [
      { op: Op.Count, kind: "last_hit", slot: "$self_slot", bind: "$n" },
      { op: Op.ApplyDamage, amount: "$n", slot: "$defending" },
    ] },
  ], { bindings: { $self_slot: defending, $defending: attacker } }, 2, Action.Attack)
  expect(gamestate.players[1].active.damage === applied, "Mirror Move copies last turn's hit")
}

{
  const ctx: InterpretCtx = { bindings: { $self_slot: defending } }
  runExpr(await pidgeotto(), [
    { op: Op.Count, kind: "last_attacked", slot: "$self_slot", bind: "$was" },
  ], ctx, 2, Action.Attack)
  expect(ctx.bindings.$was === 0, "same-turn Mirror Move has no last hit")
}

{
  const gamestate = play(await pidgeotto(), [
    { op: Op.Attack, base: 20, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
  ], attackCtx())
  const id = gamestate.players[2].active.evolution.at(-1)
  expect(!!id && gamestate.lastHit[id]?.applied === gamestate.players[2].active.damage, "lastHit stamps the defending instance")
}

console.log("triggers-check assertions passed")
