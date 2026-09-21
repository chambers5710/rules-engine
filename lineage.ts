import { currentForm, getSlot, pokemonInPlay } from "./board.js"
import { foldedCard } from "./card.js"
import table from "./lineage.json" with { type: "json" }
import { mayEvolve } from "./reads.js"
import type { CardInstance, CardInstanceId, GameState } from "./types.js"

const evolvesFromByName = table as Record<string, string>

function evolvesFromName(gamestate: GameState, name: string): string | undefined {
  const printed = evolvesFromByName[name]
  if (printed) return printed
  for (const card of Object.values(gamestate.cardRegistry)) {
    if (card.name === name && card.evolvesFrom) return card.evolvesFrom
  }
}

/** Basic name a Stage 2 can Breeder onto (Venusaur → Bulbasaur, Dark Vileplume → Oddish). */
export function stage2BasicName(gamestate: GameState, cardId: CardInstanceId): string | undefined {
  const printed = foldedCard(gamestate, cardId)
  if (!printed?.subtypes?.includes("Stage 2") || !printed.evolvesFrom) return
  return evolvesFromName(gamestate, printed.evolvesFrom)
}

function isBasicForm(form: CardInstance): boolean {
  if (form.supertype !== "Pokémon") return false
  const subtypes = form.subtypes ?? []
  return subtypes.includes("Basic") || subtypes.includes("Baby")
}

/** True when this Stage 2 has a self in-play Basic that mayEvolve. */
export function hasBreederSeat(gamestate: GameState, player: 1 | 2, evoId: CardInstanceId): boolean {
  const basic = stage2BasicName(gamestate, evoId)
  if (!basic) return false
  for (const slotId of pokemonInPlay(gamestate, player)) {
    const slot = getSlot(gamestate, slotId)
    if (!mayEvolve(gamestate, player, slot)) continue
    const form = currentForm(gamestate, slot)
    if (!form || form.name !== basic || !isBasicForm(form)) continue
    return true
  }
  return false
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
