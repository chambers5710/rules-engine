import { computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card, EffectRegistry, GameState, SourceId } from "./types.js"
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

let loadedDecks: { p1: string; p2: string } = { p1: DECKS[1], p2: DECKS[2] }

export function lastDecks() {
  return loadedDecks
}

export async function fetchDeck(deckId: string): Promise<Card[]> {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  if (!response.ok) throw new Error(`deck ${deckId}: ${response.status}`)
  return (await response.json()) as Card[]
}

export async function fetchEffects(ids: SourceId[]): Promise<EffectRegistry> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return {}
  const response = await fetch(
    `http://localhost:8787/api/effects?ids=${encodeURIComponent(unique.join(","))}`
  )
  if (!response.ok) throw new Error(`effects: ${response.status}`)
  const rows = (await response.json()) as Array<{
    sourceId: SourceId
    attacks?: EffectRegistry[string]["attacks"] | null
    abilities?: EffectRegistry[string]["abilities"] | null
    trainer?: EffectRegistry[string]["trainer"] | null
    triggers?: EffectRegistry[string]["triggers"] | null
  }>
  const registry: EffectRegistry = {}
  for (const row of rows) {
    registry[row.sourceId] = {
      ...(row.attacks ? { attacks: row.attacks } : {}),
      ...(row.abilities ? { abilities: row.abilities } : {}),
      ...(row.trainer ? { trainer: row.trainer } : {}),
      ...(row.triggers ? { triggers: row.triggers } : {}),
    }
  }
  return registry
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
  const registry = await fetchEffects([...p1, ...p2].map((card) => card.id))
  return withDecks(createSession(p1, p2, registry))
}

export async function openDefaultSession(): Promise<Session> {
  return openSession(DECKS[1], DECKS[2])
}

export function createSession(p1Deck: Card[], p2Deck: Card[], registry?: EffectRegistry): Session {
  return createSessionFromState(initializeGameState(p1Deck, p2Deck, registry))
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
