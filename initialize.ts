import { draw, emptySlot, isBasicPokemon } from "./helpers.js"
import { flipCoin, moveZoneToZone, shuffle } from "./ops.js"
import type {
  Card,
  CardInstance,
  CardRegistry,
  DamageModifier,
  EnergyType,
  GameState,
  Player,
} from "./types.js"
import { EnergyTypes, Phase } from "./types.js"

const OPENING_HAND = 7

// Game — coin flip, hydrate decks, opening hands + mulligans, assemble snapshot
export function initializeGameState(p1DeckData: Card[], p2DeckData: Card[]): GameState {
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
    id: "game-1",
    phase: Phase.Init,
    players: {
      1: instantiatePlayer(1, decks[1].map((c) => c.instanceId)),
      2: instantiatePlayer(2, decks[2].map((c) => c.instanceId)),
    },
    turnCount: 0,
    firstPlayer,
    activePlayer: firstPlayer,
    cardRegistry,
    mulligans: { 1: 0, 2: 0 },
    setupReady: { 1: false, 2: false },
    energyAttachedThisTurn: false,
    actionStack: [],
    actionHistory: [],
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
  return gamestate.players[player].hand.some((id) => isBasicPokemon(gamestate, id))
}

// Basic still available in hand or deck (can a mulligan help?)
function libraryHasBasic(gamestate: GameState, player: 1 | 2): boolean {
  const p = gamestate.players[player]
  return [...p.hand, ...p.deck].some((id) => isBasicPokemon(gamestate, id))
}

function returnHandToDeck(gamestate: GameState, player: 1 | 2): GameState {
  for (const card of [...gamestate.players[player].hand]) {
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player, zone: "hand" },
      { player, zone: "deck", position: "bottom" }
    )
  }
  return gamestate
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
    attacks: cardData.attacks?.map((attack) => ({
      name: attack.name,
      cost: attack.cost.map(asEnergyType),
      text: attack.text,
      damage: attack.damage,
    })),
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
