import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import cards from "../data/cards/base1.json" with { type: "json" }
import { Op, type Expr } from "../dsl.js"
import { cardEffect } from "../effects.js"
import { initializeGameState } from "../initialize.js"
import { interpret, type InterpretCtx } from "../interpret.js"
import { tickModifiersEnd, tickModifiersEnter } from "../modifiers.js"
import { moveZoneToSlot } from "../ops.js"
import type { Card, GameState } from "../types.js"
import { formatGamestate } from "../ui.js"

function printedCard(id: string): Card {
  const card = (cards as Card[]).find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

function playActive(gamestate: GameState, player: 1 | 2): GameState {
  const id = gamestate.players[player].hand[0] ?? gamestate.players[player].deck[0]
  if (!id) throw new Error(`expected a card for p${player}`)
  const from = gamestate.players[player].hand.includes(id) ? "hand" as const : "deck" as const
  return moveZoneToSlot(
    gamestate,
    id,
    { player, zone: from },
    { player, slot: "active", attachment: "evolution" }
  )
}

function board(): GameState {
  let gamestate = initializeGameState(
    [printedCard("base1-3")],
    [printedCard("base1-5")]
  )
  gamestate = playActive(gamestate, 1)
  gamestate = playActive(gamestate, 2)
  return gamestate
}

const jab: Expr = [
  { op: Op.Attack, base: 30, from: "$self_slot", to: "$defending", bind: "$damage" },
  { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
]

function ctx(
  from: 1 | 2,
  to: 1 | 2,
  script?: InterpretCtx["script"]
): InterpretCtx {
  return {
    bindings: {
      $self_slot: { player: from, slot: "active" },
      $defending: { player: to, slot: "active" },
    },
    script,
  }
}

function run(gamestate: GameState, expr: Expr, interpretCtx: InterpretCtx): GameState {
  for (const primitive of expr) {
    gamestate = interpret(gamestate, primitive, interpretCtx)
  }
  return gamestate
}

function modifier(gamestate: GameState) {
  return gamestate.players[1].active.modifiers[0]
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

const scrunch = cardEffect("base1-3", "attacks", "Scrunch")

let heads = board()
heads = run(heads, scrunch, ctx(1, 2, { coins: ["heads"] }))
check("heads: pending", "pending", modifier(heads)?.phase)
check("heads: until p2", 2, modifier(heads)?.until.player)
check("heads: field", "attack_damage", modifier(heads)?.field)

heads = tickModifiersEnter(heads, 2)
check("p2 turn: active", "active", modifier(heads)?.phase)

heads = run(heads, jab, ctx(2, 1))
check("p2 jab: chansey damage", 0, heads.players[1].active.damage)

heads = interpret(heads, { op: Op.ApplyDamage, amount: 20, slot: { player: 1, slot: "active" } })
check("apply_damage still lands", 20, heads.players[1].active.damage)

heads = tickModifiersEnd(heads, 2)
check("p2 checkup: modifier gone", 0, heads.players[1].active.modifiers.length)

heads = run(heads, jab, ctx(2, 1))
check("after drop: jab lands", 50, heads.players[1].active.damage)

let tails = board()
tails = run(tails, scrunch, ctx(1, 2, { coins: ["tails"] }))
check("tails: no modifier", 0, tails.players[1].active.modifiers.length)
tails = tickModifiersEnter(tails, 2)
tails = run(tails, jab, ctx(2, 1))
check("tails: jab lands", 30, tails.players[1].active.damage)

const failed = cases.filter((c) => !c.pass)
const lines = [
  "# Scrunch",
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

lines.push("## Board (heads path, after second jab)", "", formatGamestate(heads))

const out = join(dirname(fileURLToPath(import.meta.url)), "scrunch-report.md")
writeFileSync(out, lines.join("\n"))
console.log(`Wrote ${out} (${failed.length} failed)`)
