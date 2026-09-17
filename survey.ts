import { foldedCard } from "./card.js"
import { getSlot } from "./board.js"
import { isStage2Pokemon } from "./lineage.js"
import { foldedEnergyType } from "./modifiers.js"
import { energyPaysAny } from "./reads.js"
import type {
  CardInstanceId,
  EnergyType,
  GameState,
  SlotId,
  SlotRef,
  ZoneRef,
} from "./types.js"

// Filter — data so compute and (later) expr ask the same question
// this seems painfully arbitrary
export type SurveyFilter =
  | { kind: "energy"; type?: EnergyType }
  | { kind: "basic_energy"; type?: EnergyType }
  | { kind: "basic_pokemon" }
  | { kind: "evolves_from"; name: string }
  | { kind: "name"; name: string }
  | { kind: "has_type"; type: EnergyType }
  | { kind: "trainer" }
  | { kind: "pokemon" }
  | { kind: "stage_2" }

// Cards at — ids in that zone or slot attachment, top-first
export function cardsAt(gamestate: GameState, source: ZoneRef | SlotRef): CardInstanceId[] {
  if ("zone" in source) {
    return [...gamestate.players[source.player][source.zone]]
  }
  const player = gamestate.players[source.player]
  const slot = source.slot === "active" ? player.active : player.bench[source.index]
  return [...slot[source.attachment]]
}

export function surveyCards(
  gamestate: GameState,
  source: ZoneRef | SlotRef,
  filter?: SurveyFilter
): CardInstanceId[] {
  return cardsAt(gamestate, source).filter((card) => cardMatches(gamestate, card, filter, source))
}

function energyTypeOf(
  gamestate: GameState,
  cardId: CardInstanceId,
  source?: ZoneRef | SlotRef
): EnergyType | undefined {
  const printed = foldedCard(gamestate, cardId)?.energyType
  if (source && !("zone" in source) && source.attachment === "energy") {
    return foldedEnergyType(gamestate, source) ?? printed
  }
  return printed
}

export function surveyCount(
  gamestate: GameState,
  source: ZoneRef | SlotRef,
  filter?: SurveyFilter
): number {
  return surveyCards(gamestate, source, filter).length
}

// Energy value — sum of printed units (Double Colorless = 2)
export function surveyEnergyValue(
  gamestate: GameState,
  source: ZoneRef | SlotRef,
  filter?: SurveyFilter
): number {
  return surveyCards(gamestate, source, filter).reduce((sum, card) => {
    return sum + (foldedCard(gamestate, card)?.energyValue ?? 0)
  }, 0)
}

// Units on a Pokémon — one entry per energyValue, typed as the card provides
export function energyUnitsOn(gamestate: GameState, slot: SlotId): EnergyType[] {
  const units: EnergyType[] = []
  const energy = { ...slot, attachment: "energy" } as const
  for (const card of cardsAt(gamestate, energy)) {
    const printed = foldedCard(gamestate, card)
    const type = energyTypeOf(gamestate, card, energy)
    const n = printed?.energyValue ?? 0
    if (!type) continue
    for (let i = 0; i < n; i++) units.push(type)
  }
  return units
}

// Pay cost — typed units first; leftover (any type) pays Colorless
export function canPayEnergyCost(
  gamestate: GameState,
  slot: SlotId,
  cost: EnergyType[]
): boolean {
  const pool = energyUnitsOn(gamestate, slot)
  if (energyPaysAny(gamestate, getSlot(gamestate, slot))) {
    return pool.length >= cost.length
  }
  const typed = cost.filter((type) => type !== "Colorless")
  for (const need of typed) {
    const i = pool.indexOf(need)
    if (i === -1) return false
    pool.splice(i, 1)
  }
  return pool.length >= cost.length - typed.length
}

// Basic Pokémon — Baby counts as Basic; Energy's printed "Basic" subtype does not
export function isBasicPokemon(gamestate: GameState, cardId: string): boolean {
  const printed = foldedCard(gamestate, cardId)
  if (printed?.supertype !== "Pokémon") return false
  const subtypes = printed.subtypes ?? []
  return subtypes.includes("Basic") || subtypes.includes("Baby")
}

export function isEnergy(gamestate: GameState, cardId: string): boolean {
  return foldedCard(gamestate, cardId)?.supertype === "Energy"
}

export function isBasicEnergy(gamestate: GameState, cardId: string): boolean {
  const printed = foldedCard(gamestate, cardId)
  return printed?.supertype === "Energy" && printed.subtypes?.includes("Basic") === true
}

export function printedAttackDamage(damage?: string | number | null): number {
  const raw = damage == null ? "" : String(damage).trim()
  if (!/^\d+$/.test(raw)) return 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function cardMatches(
  gamestate: GameState,
  cardId: CardInstanceId,
  filter?: SurveyFilter,
  source?: ZoneRef | SlotRef
): boolean {
  if (!filter) return true
  switch (filter.kind) {
    case "energy":
      if (!isEnergy(gamestate, cardId)) return false
      if (filter.type && energyTypeOf(gamestate, cardId, source) !== filter.type) return false
      return true
    case "basic_energy":
      if (!isBasicEnergy(gamestate, cardId)) return false
      if (filter.type && energyTypeOf(gamestate, cardId, source) !== filter.type) return false
      return true
    case "basic_pokemon":
      return isBasicPokemon(gamestate, cardId)
    case "evolves_from":
      return foldedCard(gamestate, cardId)?.evolvesFrom === filter.name
    case "name":
      return foldedCard(gamestate, cardId)?.name === filter.name
    case "has_type":
      return foldedCard(gamestate, cardId)?.types?.includes(filter.type) === true
    case "trainer":
      return foldedCard(gamestate, cardId)?.supertype === "Trainer"
    case "pokemon":
      return foldedCard(gamestate, cardId)?.supertype === "Pokémon"
    case "stage_2":
      return isStage2Pokemon(gamestate, cardId)
  }
}
