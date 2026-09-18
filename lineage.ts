import { foldedCard } from "./card.js"
import catalog from "./data/cards/base1.json" with { type: "json" }
import type { Card, CardInstanceId, GameState } from "./types.js"

const byName = new Map<string, Card>()
for (const card of catalog as Card[]) {
  if (card.supertype === "Pokémon" && !byName.has(card.name)) byName.set(card.name, card)
}

/** Basic name a Stage 2 can Breeder onto (Venusaur → Bulbasaur). */
export function stage2BasicName(gamestate: GameState, cardId: CardInstanceId): string | undefined {
  const printed = foldedCard(gamestate, cardId)
  if (!printed?.subtypes?.includes("Stage 2") || !printed.evolvesFrom) return
  const mid = byName.get(printed.evolvesFrom)
  return mid?.evolvesFrom ?? undefined
}

export function isStage2Pokemon(gamestate: GameState, cardId: CardInstanceId): boolean {
  return foldedCard(gamestate, cardId)?.subtypes?.includes("Stage 2") === true
}

/** Stage 1 or Stage 2 — WOTC “Evolution card.” Not Basic / Baby. */
export function isEvolutionPokemon(gamestate: GameState, cardId: CardInstanceId): boolean {
  const printed = foldedCard(gamestate, cardId)
  if (printed?.supertype !== "Pokémon") return false
  const subtypes = printed.subtypes ?? []
  return subtypes.includes("Stage 1") || subtypes.includes("Stage 2")
}
