import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Action, computeAvailableActions, type AvailableAction } from "../compute.js"
import { initializeGameState } from "../initialize.js"
import { stateMachine } from "../machine.js"
import type { Card, GameState } from "../types.js"
import { Phase } from "../types.js"

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

function formatAction(gamestate: GameState, a: AvailableAction): string {
  if (a.kind === Action.Ready) return `${a.kind}  player=${a.player}`
  if (a.kind === Action.PlayBench) {
    return `${a.kind}  player=${a.player}  bench[${a.index}]  ${cardName(gamestate, a.card)}`
  }
  return `${a.kind}  player=${a.player}  ${cardName(gamestate, a.card)}`
}

async function chooseAction(
  gamestate: GameState,
  actions: AvailableAction[]
): Promise<AvailableAction> {
  const rl = createInterface({ input, output })
  console.log("\nAvailable actions:")
  for (let i = 0; i < actions.length; i++) {
    console.log(`  [${i}] ${formatAction(gamestate, actions[i])}`)
  }
  const answer = await rl.question("\nChoose action index: ")
  rl.close()

  const index = Number(answer.trim())
  const chosen = actions[index]
  if (!chosen) throw new Error(`invalid choice: ${answer}`)
  return chosen
}

// p2 auto: Active if needed, else Ready (no bench)
function autoP2(actions: AvailableAction[]): AvailableAction {
  return (
    actions.find((a) => a.kind === Action.PlayActive) ??
    actions.find((a) => a.kind === Action.Ready) ??
    actions[0]
  )
}

const p1Deck = await fetchDeckData(decks[2])
const p2Deck = await fetchDeckData(decks[3])

let gamestate = initializeGameState(p1Deck, p2Deck)
const handBefore = [...gamestate.players[1].hand]
const handSize = handBefore.length
const mulligans = { ...gamestate.mulligans }

console.log(`p1 hand (${handSize}): ${names(gamestate, handBefore).join(", ")}`)
console.log(`mulligans: p1=${mulligans[1]}  p2=${mulligans[2]}`)

check("init: full deck loaded", 60, p1Deck.length)
check("init: opening hand at least 7", true, handSize >= 7)

const log: string[] = []
let chosenActive = ""

while (gamestate.phase === Phase.Init) {
  const actions = computeAvailableActions(gamestate)
  const p1 = actions.filter((a) => a.player === 1)
  const p2 = actions.filter((a) => a.player === 2)

  let chosen: AvailableAction
  if (p1.length > 0) {
    chosen = await chooseAction(gamestate, p1)
  } else if (p2.length > 0) {
    chosen = autoP2(p2)
    console.log(`\np2 auto: ${formatAction(gamestate, chosen)}`)
  } else {
    break
  }

  if (chosen.kind === Action.PlayActive && chosen.player === 1) {
    chosenActive = cardName(gamestate, chosen.card)
  }
  log.push(`p${chosen.player}: ${formatAction(gamestate, chosen)}`)
  gamestate = stateMachine(gamestate, chosen)
}

check("after init: phase is turn", Phase.Turn, gamestate.phase)
check("after init: turnCount", 1, gamestate.turnCount)
check("after init: p1 active filled", 1, gamestate.players[1].active.evolution.length)
check("after init: p2 active filled", 1, gamestate.players[2].active.evolution.length)
check("after init: p1 prizes", 6, gamestate.players[1].prize.length)
check("after init: p2 prizes", 6, gamestate.players[2].prize.length)

const failed = cases.filter((c) => !c.pass)
const lines = [
  "# Init setup",
  "",
  `Passed: ${cases.filter((c) => c.pass).length}/${cases.length}`,
  "",
  "## Setup",
  "",
  `- Mulligans: p1=${mulligans[1]}, p2=${mulligans[2]}`,
  `- p1 opening hand (${handSize}): ${names(gamestate, handBefore).join(", ")}`,
  `- Chosen Active (p1): ${chosenActive || "(none)"}`,
  `- First player: ${gamestate.firstPlayer}`,
  `- p1 Active: ${names(gamestate, gamestate.players[1].active.evolution).join(", ")}`,
  `- p1 Bench: ${gamestate.players[1].bench
      .filter((s) => s.evolution.length)
      .map((s) => names(gamestate, s.evolution).join(">"))
      .join(", ") || "(empty)"}`,
  `- p2 Active: ${names(gamestate, gamestate.players[2].active.evolution).join(", ")}`,
  `- Prizes: p1=${gamestate.players[1].prize.length}, p2=${gamestate.players[2].prize.length}`,
  `- Phase: ${gamestate.phase}`,
  "",
  "## Action log",
  "",
  ...log.map((line) => `- ${line}`),
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
