import {
  createSession as playCreateSession,
  createSessionFromState as playFromState,
  type Choice,
  type Frame,
  type PlaySession,
} from "./play.js"
import { cardApi } from "./env.js"
import { loadSavedState, type GameSave } from "../save.js"
import type { Card, EffectRegistry, GameState, SourceId } from "../types.js"

export type { Choice, Frame }
export type Session = PlaySession

export type CompactDeck = {
  id: string
  name: string
  types: string[]
  cards: { id: string; name: string; rarity?: string; count: number }[]
}

export async function fetchDeck(deckId: string): Promise<Card[]> {
  const response = await fetch(`${cardApi()}/api/decks/${deckId}`)
  if (!response.ok) throw new Error(`deck ${deckId}: ${response.status}`)
  return (await response.json()) as Card[]
}

async function fetchCard(id: string): Promise<Card> {
  const response = await fetch(`${cardApi()}/api/cards/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(`card ${id}: ${response.status}`)
  return (await response.json()) as Card
}

export async function expandCompactDeck(deck: CompactDeck): Promise<Card[]> {
  const unique = [...new Set(deck.cards.map((entry) => entry.id))]
  const rows = await Promise.all(unique.map((id) => fetchCard(id)))
  const byId = new Map(rows.map((card) => [card.id, card]))
  const missing = unique.filter((id) => !byId.has(id))
  if (missing.length) throw new Error(`compact deck ${deck.id}: missing ${missing.join(", ")}`)
  const expanded = deck.cards.flatMap((entry) => {
    const card = byId.get(entry.id)
    if (!card) return []
    return Array.from({ length: entry.count }, () => card)
  })
  if (!expanded.length) throw new Error(`compact deck ${deck.id}: no cards`)
  return expanded
}

export async function resolveDeck(id: string, compactDecks: CompactDeck[] = []): Promise<Card[]> {
  const stored = compactDecks.find((deck) => deck.id === id)
  if (stored) return expandCompactDeck(stored)
  return fetchDeck(id)
}

export async function fetchEffects(ids: SourceId[]): Promise<EffectRegistry> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return {}
  const response = await fetch(
    `${cardApi()}/api/effects?ids=${encodeURIComponent(unique.join(","))}`
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

export async function openSession(
  p1Id: string,
  p2Id: string,
  compactDecks: CompactDeck[] = [],
): Promise<Session> {
  const decks = { p1: p1Id, p2: p2Id }
  const [p1, p2] = await Promise.all([
    resolveDeck(p1Id, compactDecks),
    resolveDeck(p2Id, compactDecks),
  ])
  const registry = await fetchEffects([...p1, ...p2].map((card) => card.id))
  return playCreateSession(p1, p2, registry, decks)
}

export function createSession(
  p1Deck: Card[],
  p2Deck: Card[],
  registry: EffectRegistry,
  decks: { p1: string; p2: string },
): Session {
  return playCreateSession(p1Deck, p2Deck, registry, decks)
}

export function createSessionFromState(
  initial: GameState,
  decks: { p1: string; p2: string } = { p1: "", p2: "" },
): Session {
  return playFromState(initial, decks)
}

export function openLoadedSession(save: GameSave): Session {
  return playFromState(loadSavedState(save), save.decks)
}
