import { flipCoin } from "./ops.js"
import type {
  Card,
  CardInstance,
  CardRegistry,
  DamageModifier,
  EnergyType,
  GameState,
  Player,
  Slot,
  StatusFlags,
} from "./types.js"
import { EnergyTypes, Phase } from "./types.js"

// Game — coin flip, hydrate both decks, assemble the snapshot
export function initializeGameState(p1DeckData: Card[], p2DeckData: Card[]): GameState {
  let firstPlayer: 1 | 2

  const coinResult = flipCoin(1)
  if (coinResult[0] === "heads") {
    firstPlayer = 1
  } else {
    firstPlayer = 2
  }

  const p1Deck = initializeDeck(1, p1DeckData)
  const p2Deck = initializeDeck(2, p2DeckData)

  const p1DeckIds: string[] = []
  p1Deck.forEach((card) => {
    p1DeckIds.push(card.instanceId)
  })

  const p2DeckIds: string[] = []
  p2Deck.forEach((card) => {
    p2DeckIds.push(card.instanceId)
  })

  const { playerOne, playerTwo } = instantiatePlayers(p1DeckIds, p2DeckIds)

  const cardRegistry: CardRegistry = {}
  p1Deck.forEach((card) => {
    cardRegistry[card.instanceId] = card
  })
  p2Deck.forEach((card) => {
    cardRegistry[card.instanceId] = card
  })

  const gamestate: GameState = {
    id: "game-1",
    phase: Phase.Init,
    players: {
      1: playerOne,
      2: playerTwo,
    },
    turnCount: 0,
    firstPlayer: firstPlayer,
    activePlayer: firstPlayer,
    cardRegistry: cardRegistry,
    actionStack: [],
    actionHistory: [],
  }

  return gamestate
}

// Players — empty board, decks already minted as instance ids
function instantiatePlayers(p1DeckCardIds: string[], p2DeckCardIds: string[]) {
  const playerOne: Player = {
    id: 1,
    deck: p1DeckCardIds,
    discard: [],
    hand: [],
    prize: [],
    active: emptySlot(),
    bench: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  }

  const playerTwo: Player = {
    id: 2,
    deck: p2DeckCardIds,
    discard: [],
    hand: [],
    prize: [],
    active: emptySlot(),
    bench: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  }

  return { playerOne, playerTwo }
}

// Empty slot — one vacant Pokémon seat
const emptySlot = (): Slot => ({
  evolution: [],
  damage: 0,
  status: emptyStatus(),
  energy: [],
  tools: [],
  modifiers: [],
})

// Empty status — no special conditions
const emptyStatus = (): StatusFlags => ({
  psn: false,
  brn: false,
  par: false,
  slp: false,
  cnf: false,
})

// Deck — one CardInstance per printed row, ids minted as player-index-source
function initializeDeck(playerId: number, deckData: Card[]): CardInstance[] {
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

  const printedWeakness = cardData.weaknesses?.[0] // multiple weaknesses? check database
  const weaknesses = printedWeakness
    ? { type: asEnergyType(printedWeakness.type), modifier: parseDamageModifier(printedWeakness.value) }
    : undefined

  const printedResistance = cardData.resistances?.[0]
  const resistances = printedResistance
    ? { type: asEnergyType(printedResistance.type), modifier: parseDamageModifier(printedResistance.value) }
    : undefined

  let energyType: EnergyType | undefined
  let energyValue: number | undefined
  if (cardData.supertype === "Energy") {
    if (cardData.name === "Double Colorless Energy") { // this clearly ain't gonna fucking work lmao
      energyType = "Colorless"
      energyValue = 2
    } else {
      energyType = asEnergyType(cardData.name.replace(/ Energy$/, ""))
      energyValue = 1
    }
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
    weaknesses: weaknesses,
    resistances: resistances,
    energyType: energyType,
    energyValue: energyValue,
    fieldOverrides: [],
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

// Damage modifier — "×2" → multiply, "-30" → add
function parseDamageModifier(value: string): DamageModifier {
  if (value.startsWith("×") || value.startsWith("x") || value.startsWith("X")) {
    return { operation: "multiply", value: Number(value.slice(1)) }
  }
  return { operation: "add", value: Number(value) }
}
