import cards from "../../data/cards/base1.json" with { type: "json" }
import { Op } from "../../dsl.js"
import { interpret } from "../../interpret.js"
import { applyModifier } from "../../modifiers.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, copies, liveTurn, moveToActive, printed } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

async function stage(): GameState {
  const a = printed(set, "base1-20")
  const b = printed(set, "base1-10")
  let gamestate = await initBoard([a, ...copies(printed(set, "base1-100"), 17)], [b, ...copies(a, 17)])
  gamestate = moveToActive(gamestate, 1, "base1-20")
  gamestate = moveToActive(gamestate, 2, "base1-10")
  return liveTurn(gamestate)
}

const defending = { player: 2, slot: "active" } as const
const attacker = { player: 1, slot: "active" } as const
const ctx = {
  via: "attack" as const,
  bindings: { $self_slot: attacker, $defending: defending },
}

{
  let gamestate = applyModifier(await stage(), defending, {
    field: "attack_effects",
    prevent: "all",
    until: { beat: "end_of_turn", player: 1 },
  })
  gamestate = interpret(
    gamestate,
    { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    ctx
  )
  expect(gamestate.players[2].active.damage === 0, "shielded Attack must write 0")
  const hit = [...gamestate.history].reverse().find((entry) => entry.op === Op.Attack)
  expect(!!hit && "raw" in hit && hit.raw === 30 && hit.prevented, "Attack history keeps raw and prevented")
}

{
  let gamestate = applyModifier(await stage(), defending, {
    field: "attack_effects",
    prevent: "all",
    until: { beat: "end_of_turn", player: 1 },
  })
  gamestate = interpret(gamestate, { op: Op.ApplyStatus, status: "paralyzed", slot: "$defending" }, ctx)
  expect(!gamestate.players[2].active.status.paralyzed, "shielded ApplyStatus must no-op")
}

{
  const gamestate = interpret(
    await stage(),
    { op: Op.Attack, base: 10, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    ctx
  )
  expect(gamestate.players[2].active.damage === 10, "unshielded Attack still writes counters")
}

{
  let gamestate = applyModifier(await stage(), defending, {
    field: "attack_damage",
    mul: 0.5,
    until: { beat: "end_of_turn", player: 1 },
  })
  gamestate = interpret(
    gamestate,
    { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    ctx
  )
  expect(gamestate.players[2].active.damage === 10, "timed mul 0.5 is after W/R, round down 10")
}

console.log("attack-effects-check assertions passed")
