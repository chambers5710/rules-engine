import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Action, computeAvailableActions, type AvailableAction } from "../compute.js"
import { initializeGameState } from "../initialize.js"
import { stateMachine } from "../machine.js"
import type { Card, GameState } from "../types.js"

const decks = {
  1: "d-base1-1",
  2: "d-base1-2",
  3: "d-base1-3",
}

async function fetchDeckData(deckId: string) {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  return await response.json() as Card[]
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

function cardName(gamestate: GameState, id: string): string {
  return gamestate.cardRegistry[id]?.name ?? id
}

function names(gamestate: GameState, ids: string[]): string[] {
  return ids.map((id) => cardName(gamestate, id))
}

async function chooseAction(
  gamestate: GameState,
  actions: AvailableAction[]
): Promise<AvailableAction> {
  const rl = createInterface({ input, output })
  console.log("\nAvailable actions:")
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    console.log(`  [${i}] ${a.kind}  player=${a.player}  ${cardName(gamestate, a.card)} (${a.card})`)
  }
  const answer = await rl.question("\nChoose action index: ")
  rl.close()

  const index = Number(answer.trim())
  const chosen = actions[index]
  if (!chosen) throw new Error(`invalid choice: ${answer}`)
  return chosen
}

const p1Deck = await fetchDeckData(decks[2])
const p2Deck = await fetchDeckData(decks[3])

let gamestate = initializeGameState(p1Deck, p2Deck)
const handBefore = [...gamestate.players[1].hand]
const handSize = handBefore.length
const actions = computeAvailableActions(gamestate).filter((a) => a.player === 1)

console.log(`p1 hand (${handSize}): ${names(gamestate, handBefore).join(", ")}`)
console.log(`mulligans: p1=${gamestate.mulligans[1]}  p2=${gamestate.mulligans[2]}`)
console.log(`p1 Basics in hand: ${actions.length}`)

check("init: full deck loaded", 60, p1Deck.length)
check("init: opening hand at least 7", true, handSize >= 7)
check("init: has play_active", true, actions.length >= 1)
check("init: action kind", Action.PlayActive, actions[0]?.kind)

const chosen = await chooseAction(gamestate, actions)
const chosenName = cardName(gamestate, chosen.card)
gamestate = stateMachine(gamestate, chosen)

check("after play_active: p1 active filled", 1, gamestate.players[1].active.evolution.length)
check("after play_active: chosen card is active", chosen.card, gamestate.players[1].active.evolution[0])
check("after play_active: hand down by one", handSize - 1, gamestate.players[1].hand.length)
check("after play_active: still init", "init", gamestate.phase)

const failed = cases.filter((c) => !c.pass)
const lines = [
  "# Init play active",
  "",
  `Passed: ${cases.filter((c) => c.pass).length}/${cases.length}`,
  "",
  "## Setup",
  "",
  `- Mulligans: p1=${gamestate.mulligans[1]}, p2=${gamestate.mulligans[2]}`,
  `- p1 opening hand (${handSize}): ${names(gamestate, handBefore).join(", ")}`,
  `- p1 PlayActive options: ${actions.map((a) => cardName(gamestate, a.card)).join(", ")}`,
  `- Chosen Active: ${chosenName} (${chosen.card})`,
  `- p1 hand after: ${names(gamestate, gamestate.players[1].hand).join(", ")}`,
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
