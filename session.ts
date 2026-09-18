import {
  createSession as playCreateSession,
  createSessionFromState as playFromState,
  type Choice,
  type Frame,
  type PlaySession,
} from "./play.js"
import type { Card, EffectRegistry, GameState, SourceId } from "./types.js"

export type { Choice, Frame }
export type Session = PlaySession

export const DECKS = {
  1:  "d-base1-1",
  2: "d-base1-2"
} as const

export type CompactDeck = {
  id: string
  name: string
  types: string[]
  cards: { id: string; name: string; rarity?: string; count: number }[]
}

let loadedDecks: { p1: string; p2: string } = { p1: DECKS[1], p2: DECKS[2] }
let loadedCustom: CompactDeck[] = []

export function lastDecks() {
  return loadedDecks
}

const CARD_API = "http://localhost:8787"

export async function fetchDeck(deckId: string): Promise<Card[]> {
  const response = await fetch(`${CARD_API}/api/decks/${deckId}`)
  if (!response.ok) throw new Error(`deck ${deckId}: ${response.status}`)
  return (await response.json()) as Card[]
}

async function fetchCard(id: string): Promise<Card> {
  const response = await fetch(`${CARD_API}/api/cards/${id}`)
  if (!response.ok) throw new Error(`card ${id}: ${response.status}`)
  return (await response.json()) as Card
}

export async function expandCompactDeck(deck: CompactDeck): Promise<Card[]> {
  const unique = [...new Set(deck.cards.map((entry) => entry.id))]
  const rows = await Promise.all(unique.map((id) => fetchCard(id)))
  const byId = new Map(rows.map((card) => [card.id, card]))
  const expanded = deck.cards.flatMap((entry) => {
    const card = byId.get(entry.id)
    if (!card) return []
    return Array.from({ length: entry.count }, () => card)
  })
  if (!expanded.length) throw new Error(`custom deck ${deck.id}: no cards`)
  return expanded
}

export async function resolveDeck(id: string, custom: CompactDeck[] = []): Promise<Card[]> {
  const stored = custom.find((deck) => deck.id === id)
  if (stored) return expandCompactDeck(stored)
  return fetchDeck(id)
}

export async function fetchEffects(ids: SourceId[]): Promise<EffectRegistry> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return {}
  const response = await fetch(
    `${CARD_API}/api/effects?ids=${encodeURIComponent(unique.join(","))}`
  )
  if (!response.ok) throw new Error(`effects: ${response.status}`)
  const rows = (await response.json()) as Array<{
    sourceId: SourceId
    attacks?: EffectRegistry[string]["attacks"] | null
    abilities?: EffectRegistry[string]["abilities"] | null
    trainer?: EffectRegistry[string]["trainer"] | null
    stadium?: EffectRegistry[string]["stadium"] | null
    triggers?: EffectRegistry[string]["triggers"] | null
    powers?: EffectRegistry[string]["powers"] | null
    energy?: EffectRegistry[string]["energy"] | null
  }>
  const registry: EffectRegistry = {}
  for (const row of rows) {
    registry[row.sourceId] = {
      ...(row.attacks ? { attacks: row.attacks } : {}),
      ...(row.abilities ? { abilities: row.abilities } : {}),
      ...(row.trainer ? { trainer: row.trainer } : {}),
      ...(row.stadium ? { stadium: row.stadium } : {}),
      ...(row.triggers ? { triggers: row.triggers } : {}),
      ...(row.powers ? { powers: row.powers } : {}),
      ...(row.energy ? { energy: row.energy } : {}),
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

export async function openSession(
  p1Id: string,
  p2Id: string,
  custom: CompactDeck[] = [],
): Promise<Session> {
  loadedDecks = { p1: p1Id, p2: p2Id }
  if (custom.length) loadedCustom = custom
  const rows = custom.length
    ? custom
    : loadedCustom.filter((deck) => deck.id === p1Id || deck.id === p2Id)
  const [p1, p2] = await Promise.all([
    resolveDeck(p1Id, rows),
    resolveDeck(p2Id, rows),
  ])
  const registry = await fetchEffects([...p1, ...p2].map((card) => card.id))
  return withDecks(createSession(p1, p2, registry))
}

export async function openDefaultSession(): Promise<Session> {
  return openSession(DECKS[1], DECKS[2])
}

export function createSession(p1Deck: Card[], p2Deck: Card[], registry: EffectRegistry): Session {
  return playCreateSession(p1Deck, p2Deck, registry, loadedDecks)
}

export function createSessionFromState(initial: GameState): Session {
  return playFromState(initial, loadedDecks)
}
