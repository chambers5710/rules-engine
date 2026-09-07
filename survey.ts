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
  | { kind: "energy" }
  | { kind: "energy_type"; type: EnergyType }
  | { kind: "basic_pokemon" }
  | { kind: "evolves_from"; name: string }

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
  return cardsAt(gamestate, source).filter((card) => cardMatches(gamestate, card, filter))
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
    return sum + (gamestate.cardRegistry[card]?.energyValue ?? 0)
  }, 0)
}

// Units on a Pokémon — one entry per energyValue, typed as the card provides
export function energyUnitsOn(gamestate: GameState, slot: SlotId): EnergyType[] {
  const units: EnergyType[] = []
  for (const card of cardsAt(gamestate, { ...slot, attachment: "energy" })) {
    const printed = gamestate.cardRegistry[card]
    const type = printed?.energyType
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
  const typed = cost.filter((type) => type !== "Colorless")
  for (const need of typed) {
    const i = pool.indexOf(need)
    if (i === -1) return false
    pool.splice(i, 1)
  }
  return pool.length >= cost.length - typed.length
}

// Basic Pokémon — Energy's printed "Basic" subtype does not count
export function isBasicPokemon(gamestate: GameState, cardId: string): boolean {
  const printed = gamestate.cardRegistry[cardId]
  return printed?.supertype === "Pokémon" && printed.subtypes?.includes("Basic") === true
}

export function isEnergy(gamestate: GameState, cardId: string): boolean {
  return gamestate.cardRegistry[cardId]?.supertype === "Energy"
}

function cardMatches(
  gamestate: GameState,
  cardId: CardInstanceId,
  filter?: SurveyFilter
): boolean {
  if (!filter) return true
  switch (filter.kind) {
    case "energy":
      return isEnergy(gamestate, cardId)
    case "energy_type":
      return (
        isEnergy(gamestate, cardId) &&
        gamestate.cardRegistry[cardId]?.energyType === filter.type
      )
    case "basic_pokemon":
      return isBasicPokemon(gamestate, cardId)
    case "evolves_from":
      return gamestate.cardRegistry[cardId]?.evolvesFrom === filter.name
  }
}
