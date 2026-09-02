import { computeAvailableActions } from "./compute.js"
import { stateMachine } from "./machine.js"
import type { Card } from "./types.js"
import { Phase } from "./types.js"
import { initializeGameState } from "./initialize.js"

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
  // gamestate + actions → client; await choice
  let action = null as ReturnType<typeof computeAvailableActions>[number] | null
  gamestate = stateMachine(gamestate, action)
}
