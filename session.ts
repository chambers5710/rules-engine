import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card, GameState } from "./types.js"
import { formatAction, formatGamestate } from "./ui.js"

const out = join(dirname(fileURLToPath(import.meta.url)), "gamestate.md")

export const DECKS = {
  1:  "d-ex9-1",
  2: "d-ex9-2"
} as const

export type Choice = {
  index: number
  label: string
  player: 1 | 2
  card?: string
}

export type Frame = {
  type: "STATE"
  gamestate: GameState
  choices: Choice[]
}

export type Session = {
  frame: () => Frame
  choose: (index: number) => Frame
}

export async function fetchDeck(deckId: string): Promise<Card[]> {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  if (!response.ok) throw new Error(`deck ${deckId}: ${response.status}`)
  return (await response.json()) as Card[]
}

export async function openSession(p1Id: string, p2Id: string): Promise<Session> {
  const [p1, p2] = await Promise.all([fetchDeck(p1Id), fetchDeck(p2Id)])
  return createSession(p1, p2)
}

export async function openDefaultSession(): Promise<Session> {
  return openSession(DECKS[1], DECKS[2])
}

export function createSession(p1Deck: Card[], p2Deck: Card[]): Session {
  return createSessionFromState(initializeGameState(p1Deck, p2Deck))
}

export function createSessionFromState(initial: GameState): Session {
  let gamestate = initial
  let actions = computeAvailableActions(gamestate)
  persist(gamestate)

  const frame = (): Frame => ({
    type: "STATE",
    gamestate,
    choices: actions.map((action, index) => ({
      index,
      label: formatAction(gamestate, action),
      player: action.player,
      ...("card" in action ? { card: action.card } : {}),
    })),
  })

  return {
    frame,
    choose(index: number) {
      const action = actions[index]
      if (!action) throw new Error("not a listed choice")
      gamestate = stateMachine(gamestate, action)
      actions = computeAvailableActions(gamestate)
      persist(gamestate)
      return frame()
    },
  }
}

function persist(gamestate: GameState) {
  writeFileSync(out, formatGamestate(gamestate))
}
