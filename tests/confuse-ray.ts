import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import cards from "../data/cards/base1.json" with { type: "json" }
import { Op, type Expr } from "../dsl.js"
import { initializeGameState } from "../initialize.js"
import { interpret, type InterpretCtx } from "../interpret.js"
import { moveZoneToSlot } from "../ops.js"
import type { Card, GameState } from "../types.js"

function printedCard(id: string): Card {
  const card = (cards as Card[]).find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

function boardAlakazamVsMachop(): GameState {
  let gamestate = initializeGameState(
    [printedCard("base1-1")],
    [printedCard("base1-52")]
  )

  const p1 = gamestate.players[1].hand[0] ?? gamestate.players[1].deck[0]
  const p2 = gamestate.players[2].hand[0] ?? gamestate.players[2].deck[0]
  if (!p1 || !p2) throw new Error("expected one card per player")

  const p1From = gamestate.players[1].hand.includes(p1) ? "hand" as const : "deck" as const
  const p2From = gamestate.players[2].hand.includes(p2) ? "hand" as const : "deck" as const

  gamestate = moveZoneToSlot(
    gamestate,
    p1,
    { player: 1, zone: p1From },
    { player: 1, slot: "active", attachment: "evolution" }
  )
  gamestate = moveZoneToSlot(
    gamestate,
    p2,
    { player: 2, zone: p2From },
    { player: 2, slot: "active", attachment: "evolution" }
  )

  return gamestate
}

const confuseRay: Expr = [
  {
    op: Op.Attack,
    base: 30,
    from: "$self_slot",
    to: "$defending",
    bind: "$damage",
  },
  { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
  { op: Op.FlipCoin, bind: "$coin" },
  {
    op: Op.If,
    bind: "$coin",
    equals: "heads",
    then: [{ op: Op.ApplyStatus, status: "cnf", slot: "$defending" }],
  },
]

function attackCtx(script: InterpretCtx["script"]): InterpretCtx {
  return {
    bindings: {
      $self_slot: { player: 1, slot: "active" },
      $defending: { player: 2, slot: "active" },
    },
    script,
  }
}

function run(gamestate: GameState, expr: Expr, ctx: InterpretCtx): GameState {
  for (const primitive of expr) {
    gamestate = interpret(gamestate, primitive, ctx)
  }
  return gamestate
}

function snapshot(gamestate: GameState) {
  return {
    p2Damage: gamestate.players[2].active.damage,
    p2Cnf: gamestate.players[2].active.status.cnf,
    p1Damage: gamestate.players[1].active.damage,
  }
}

type Case = { name: string; expected: unknown; realized: unknown; pass: boolean }
const cases: Case[] = []

function check(name: string, expected: unknown, realized: unknown) {
  cases.push({
    name,
    expected,
    realized,
    pass: JSON.stringify(expected) === JSON.stringify(realized),
  })
}

let heads = boardAlakazamVsMachop()
heads = run(heads, confuseRay, attackCtx({ coins: ["heads"] }))
check("confuse ray heads: damage", 30, snapshot(heads).p2Damage)
check("confuse ray heads: confused", true, snapshot(heads).p2Cnf)
check("confuse ray heads: attacker undamaged", 0, snapshot(heads).p1Damage)

let tails = boardAlakazamVsMachop()
tails = run(tails, confuseRay, attackCtx({ coins: ["tails"] }))
check("confuse ray tails: damage", 30, snapshot(tails).p2Damage)
check("confuse ray tails: not confused", false, snapshot(tails).p2Cnf)

const failed = cases.filter((c) => !c.pass)
const lines = [
  "# Confuse Ray",
  "",
  `Passed: ${cases.filter((c) => c.pass).length}/${cases.length}`,
  "",
]

for (const c of cases) {
  lines.push(`## ${c.pass ? "PASS" : "FAIL"}: ${c.name}`)
  lines.push("")
  lines.push("Expected: `" + JSON.stringify(c.expected) + "`")
  lines.push("Realized: `" + JSON.stringify(c.realized) + "`")
  lines.push("")
}

const out = join(dirname(fileURLToPath(import.meta.url)), "confuse-ray-report.md")
writeFileSync(out, lines.join("\n"))
console.log(`Wrote ${out} (${failed.length} failed)`)
