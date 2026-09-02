import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import cards from "../data/cards/base1.json" with { type: "json" }
import { Action, computeAvailableActions, type AvailableAction } from "../compute.js"
import { initializeGameState } from "../initialize.js"
import { stateMachine } from "../machine.js"
import type { Card, GameState } from "../types.js"

function printedCard(id: string): Card {
  const card = (cards as Card[]).find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

// Two Basics in p1 deck; p2 empty so Init offers two play_active choices
function boardTwoBasics(): GameState {
  return initializeGameState(
    [printedCard("base1-52"), printedCard("base1-53")],
    []
  )
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

async function chooseAction(
  gamestate: GameState,
  actions: AvailableAction[]
): Promise<AvailableAction> {
  const rl = createInterface({ input, output })
  console.log("\nAvailable actions:")
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    const name = gamestate.cardRegistry[a.card]?.name ?? a.card
    console.log(`  [${i}] ${a.kind}  player=${a.player}  ${name} (${a.card})`)
  }
  const answer = await rl.question("\nChoose action index: ")
  rl.close()

  const index = Number(answer.trim())
  const chosen = actions[index]
  if (!chosen) throw new Error(`invalid choice: ${answer}`)
  return chosen
}

let gamestate = boardTwoBasics()
const actions = computeAvailableActions(gamestate)

check("init: two play_active", 2, actions.length)
check("init: action kind", Action.PlayActive, actions[0]?.kind)
check("init: action player", 1, actions[0]?.player)

const chosen = await chooseAction(gamestate, actions)
gamestate = stateMachine(gamestate, chosen)

check("after play_active: p1 active filled", 1, gamestate.players[1].active.evolution.length)
check("after play_active: chosen card is active", chosen.card, gamestate.players[1].active.evolution[0])
check("after play_active: one card left in deck", 1, gamestate.players[1].deck.length)
check("after play_active: still init", "init", gamestate.phase)

const failed = cases.filter((c) => !c.pass)
const lines = [
  "# Init play active",
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

const out = join(dirname(fileURLToPath(import.meta.url)), "init-play-active-report.md")
writeFileSync(out, lines.join("\n"))
console.log(`Wrote ${out} (${failed.length} failed)`)
