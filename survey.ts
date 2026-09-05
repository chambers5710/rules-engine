import { isBasicPokemon, isEnergy } from "./helpers.js"
import type {
  CardInstanceId,
  EnergyType,
  GameState,
  SlotId,
  SlotRef,
  ZoneRef,
} from "./types.js"

// From — a pile the calculator can read (zone or one slot attachment)
export type SurveyFrom = ZoneRef | SlotRef

// Filter — data so compute and (later) expr ask the same question
export type SurveyFilter =
  | { kind: "energy" }
  | { kind: "energy_type"; type: EnergyType }
  | { kind: "basic_pokemon" }

// Cards at — ids in that pile, top-first
export function cardsAt(gamestate: GameState, from: SurveyFrom): CardInstanceId[] {
  if ("zone" in from) {
    return [...gamestate.players[from.player][from.zone]]
  }
  const player = gamestate.players[from.player]
  const slot = from.slot === "active" ? player.active : player.bench[from.index]
  return [...slot[from.attachment]]
}

export function surveyCards(
  gamestate: GameState,
  from: SurveyFrom,
  filter?: SurveyFilter
): CardInstanceId[] {
  return cardsAt(gamestate, from).filter((card) => cardMatches(gamestate, card, filter))
}

export function surveyCount(
  gamestate: GameState,
  from: SurveyFrom,
  filter?: SurveyFilter
): number {
  return surveyCards(gamestate, from, filter).length
}

// Energy value — sum of printed units (Double Colorless = 2)
export function surveyEnergyValue(
  gamestate: GameState,
  from: SurveyFrom,
  filter?: SurveyFilter
): number {
  return surveyCards(gamestate, from, filter).reduce((sum, card) => {
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
  }
}
