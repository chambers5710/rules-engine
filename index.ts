import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card } from "./types.js"
import { Phase } from "./types.js"
import { chooseAction, formatGamestate } from "./ui.js"

console.log("Initializing...")

async function fetchDeckData(deckId: string) {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  return await response.json() as Card[]
}

const decks = {
  1: "d-base1-1",
  2: "d-base1-2",
  3: "d-base1-3",
}

const p1Deck = await fetchDeckData(decks[2])
const p2Deck = await fetchDeckData(decks[3])

let gamestate = initializeGameState(p1Deck, p2Deck)

while (gamestate.phase !== Phase.Ended) {
  const actions = computeAvailableActions(gamestate)
  if (actions.length === 0) break
  const action = await chooseAction(gamestate, actions)
  gamestate = stateMachine(gamestate, action)
}

const out = join(dirname(fileURLToPath(import.meta.url)), "gamestate.txt")
writeFileSync(out, formatGamestate(gamestate))
console.log(`Wrote ${out}`)
