import { computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card, GameState } from "./types.js"
import { formatAction } from "./ui.js"

export const DECKS = {
  1:  "d-base1-1",
  2: "d-base1-2"
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
  decks: { p1: string; p2: string }
}

export type Session = {
  frame: () => Frame
  choose: (index: number) => Frame
}

let loadedDecks = { p1: DECKS[1], p2: DECKS[2] }

export function lastDecks() {
  return loadedDecks
}

export async function fetchDeck(deckId: string): Promise<Card[]> {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  if (!response.ok) throw new Error(`deck ${deckId}: ${response.status}`)
  return (await response.json()) as Card[]
}

function withDecks(session: Session): Session {
  const attach = (frame: Frame): Frame => ({ ...frame, decks: loadedDecks })
  return {
    frame: () => attach(session.frame()),
    choose: (index) => attach(session.choose(index)),
  }
}

export async function openSession(p1Id: string, p2Id: string): Promise<Session> {
  loadedDecks = { p1: p1Id, p2: p2Id }
  const [p1, p2] = await Promise.all([fetchDeck(p1Id), fetchDeck(p2Id)])
  return withDecks(createSession(p1, p2))
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

  const frame = (): Frame => ({
    type: "STATE",
    gamestate,
    decks: loadedDecks,
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
      return frame()
    },
  }
}
