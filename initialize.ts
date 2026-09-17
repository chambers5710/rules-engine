import { draw, emptySlot, returnHandToDeck } from "./helpers.js"
import { surveyCount } from "./survey.js"
import { flipCoin, shuffle } from "./ops.js"
import type {
  Card,
  CardInstance,
  CardRegistry,
  DamageModifier,
  EffectRegistry,
  EnergyType,
  GameState,
  Player,
  Ruleset,
} from "./types.js"
import { EnergyTypes, Phase } from "./types.js"

const OPENING_HAND = 7

// Game — coin flip, hydrate decks, opening hands + mulligans, assemble snapshot.
// Caller already loaded the registry (Card API locally, D1 in GameRoom). No I/O here.
export function initializeGameState(
  p1DeckData: Card[],
  p2DeckData: Card[],
  effectRegistry: EffectRegistry,
  ruleset: Ruleset = "wotc-base",
): GameState {
  const firstPlayer: 1 | 2 = flipCoin(1)[0] === "heads" ? 1 : 2
  const deckData = { 1: p1DeckData, 2: p2DeckData }

  const decks: { 1: CardInstance[]; 2: CardInstance[] } = { 1: [], 2: [] }
  const cardRegistry: CardRegistry = {}

  for (const player of [1, 2] as const) {
    decks[player] = initializeDeck(player, deckData[player])
    for (const card of decks[player]) {
      cardRegistry[card.instanceId] = card
    }
  }

  const gamestate: GameState = {
    id: `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    phase: Phase.Init,
    ruleset,
    players: {
      1: instantiatePlayer(1, decks[1].map((c) => c.instanceId)),
      2: instantiatePlayer(2, decks[2].map((c) => c.instanceId)),
    },
    turnCount: 0,
    firstPlayer,
    activePlayer: firstPlayer,
    cardRegistry,
    effectRegistry,
    mulligans: { 1: 0, 2: 0 },
    setupReady: { 1: false, 2: false },
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    stadiumUsedThisTurn: false,
    actionStack: [],
    history: [],
    subscriptions: [],
    lastHit: {},
    stadium: null,
  }

  return dealOpeningHands(gamestate)
}

// Opening hands — shuffle, draw 7, mulligan until Basic (or none left in library)
function dealOpeningHands(gamestate: GameState): GameState {
  const mulligans: { 1: number; 2: number } = { 1: 0, 2: 0 }

  for (const player of [1, 2] as const) {
    gamestate = shuffle(gamestate, player, "deck")
    gamestate = draw(gamestate, player, OPENING_HAND)

    while (!handHasBasic(gamestate, player)) {
      if (!libraryHasBasic(gamestate, player)) break
      gamestate = returnHandToDeck(gamestate, player)
      gamestate = shuffle(gamestate, player, "deck")
      gamestate = draw(gamestate, player, OPENING_HAND)
      mulligans[player]++
    }
  }

  // Opponent draws one per mulligan you took
  gamestate = draw(gamestate, 1, mulligans[2])
  gamestate = draw(gamestate, 2, mulligans[1])
  return { ...gamestate, mulligans }
}

function handHasBasic(gamestate: GameState, player: 1 | 2): boolean {
  return surveyCount(gamestate, { player, zone: "hand" }, { kind: "basic_pokemon" }) > 0
}

// Basic still available in hand or deck (can a mulligan help?)
function libraryHasBasic(gamestate: GameState, player: 1 | 2): boolean {
  return (
    surveyCount(gamestate, { player, zone: "hand" }, { kind: "basic_pokemon" }) > 0 ||
    surveyCount(gamestate, { player, zone: "deck" }, { kind: "basic_pokemon" }) > 0
  )
}

// Player — empty board, deck already minted as instance ids
function instantiatePlayer(id: 1 | 2, deck: string[]): Player {
  return {
    id,
    deck,
    discard: [],
    hand: [],
    prize: [],
    active: emptySlot(),
    bench: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  }
}

// Deck — one CardInstance per printed row, ids minted as player-index-source
function initializeDeck(playerId: 1 | 2, deckData: Card[]): CardInstance[] {
  const deck: CardInstance[] = []

  for (let i = 0; i < deckData.length; i++) {
    const gameCard = instantiateCard(deckData[i])
    gameCard.instanceId = `${playerId}-${i}-${deckData[i].id}`
    deck.push(gameCard)
  }

  return deck
}

// Card instance — printed Card mapped onto a playable copy
function instantiateCard(cardData: Card): CardInstance {
  const types = cardData.types?.map(asEnergyType)
  const retreatCost = cardData.retreatCost?.map(asEnergyType)

  const weaknesses = cardData.weaknesses?.map((row) => ({
    type: asEnergyType(row.type),
    modifier: parseDamageModifier(row.value),
  }))
  const resistances = cardData.resistances?.map((row) => ({
    type: asEnergyType(row.type),
    modifier: parseDamageModifier(row.value),
  }))

  let energyType: EnergyType | undefined
  let energyValue: number | undefined
  if (cardData.supertype === "Energy") {
    const parsed = energyFromPrinted(cardData.name)
    energyType = parsed.type
    energyValue = parsed.value
  }

  const cardInstance: CardInstance = {
    instanceId: "",
    sourceId: cardData.id,
    name: cardData.name,
    supertype: cardData.supertype,
    subtypes: cardData.subtypes,
    hp: cardData.hp,
    types: types,
    evolvesFrom: cardData.evolvesFrom,
    evolvesTo: cardData.evolvesTo?.[0] ?? null,
    retreatCost: retreatCost,
    attacks: cardData.attacks?.map((attack) => ({
      name: attack.name,
      cost: (attack.cost ?? []).map(asEnergyType),
      text: attack.text ?? "",
      damage: attack.damage == null ? "" : String(attack.damage),
    })),
    abilities: cardData.abilities?.map((ability) => ({
      name: ability.name,
      text: ability.text,
      type: ability.type,
    })),
    weaknesses: weaknesses,
    resistances: resistances,
    energyType: energyType,
    energyValue: energyValue,
    rules: cardData.rules,
    images: cardData.images,
    fieldOverrides: {},
  }

  return cardInstance
}

// Energy type — assert a printed string is in EnergyTypes
function asEnergyType(value: string): EnergyType {
  if ((EnergyTypes as readonly string[]).includes(value)) {
    return value as EnergyType
  }
  throw new Error(`Unknown energy type: ${value}`)
}

function isEnergyType(value: string): value is EnergyType {
  return (EnergyTypes as readonly string[]).includes(value)
}

// Basic "{Type} Energy" and Double Colorless. Other Energy (Potion, Rainbow, …) pays Colorless 1.
function energyFromPrinted(name: string): { type: EnergyType; value: number } {
  if (name === "Double Colorless Energy") return { type: "Colorless", value: 2 }
  const stripped = name.replace(/ Energy$/, "")
  if (isEnergyType(stripped)) return { type: stripped, value: 1 }
  return { type: "Colorless", value: 1 }
}

// Damage modifier — "×2" → multiply, "-30" → add
function parseDamageModifier(value: string): DamageModifier {
  if (value.startsWith("×") || value.startsWith("x") || value.startsWith("X")) {
    const n = Number(value.slice(1))
    if (!Number.isFinite(n)) throw new Error(`Unknown damage modifier: ${value}`)
    return { operation: "multiply", value: n }
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Unknown damage modifier: ${value}`)
  return { operation: "add", value: n }
}
