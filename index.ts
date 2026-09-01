import CARD_SET from "./base1.json" with { type: "json" };

// action needs no "check" string key because gamestate is omnipotent


// central engine is a state machine
// state is captured by GameState including all game and player values as well as 
// rules resolution stack

// drive stack frame interpretation
// game state is base state. each action calculation combines various conditions into 
// resulting values inside gamestate variables, replaces them, and returns new gamestate.

// stack frames are expressions of an alteration to the game state provided by an effect, or game action.
// the engine interprets the resulting gamestate by evaluating one stack at a time. 
// some interrupts may pause the stack execution, for example K.O. 
// the position of stack frames in the stack may be altered by an effect. 

// expressions are built on primitive operations defined in a DSL. 
// game action intent is interpreted and an expression with proper gamestate variables is produced. 
// the expression is pushed onto the stack. 

// basically: 
// 1. compute legal actions based on game state current
// 2. provide action options to active player
// 3. player selects an action already deemed legal
// 4. interpreter decodes primitive operations
// 5. delta gamestate computed and returned

// outcomes may potentially be pre-computed by available choice calculator
// allows for optimistic UI


// deck cards should be constructed as a set of classes from data at game start


// --- Energy Types ---
export const EnergyTypes = [
  'Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting',
  'Fire', 'Free', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water'
] as const;

export type EnergyType = typeof EnergyTypes[number]

// --- Core shared fields ---
export type Card = {
  id: string;                // e.g. "sv8-161"
  name: string;              // "Terapagos"
  supertype: "Pokémon" | "Trainer" | "Energy";
  number: string;            // collector number in set
  rarity?: string | null;    // "RARE", "ACE_SPEC_RARE", etc.
  artist?: string | null;
  flavorText?: string | null;
  legalities: {
    unlimited?: "Legal" | "Banned" | "Not Legal";
    standard?: "Legal" | "Banned" | "Not Legal";
    expanded?: "Legal" | "Banned" | "Not Legal";
  };
  images: { small: string; large: string };
  regulationMark?: string | null;  // e.g. "H"
  setId: string;                   // e.g. "sv8"

  // --- Pokémon-specific fields ---
  hp?: string | null;
  level?: string | null;
  subtypes?: string[];
  types?: string[];
  evolvesFrom?: string | null;
  evolvesTo?: string[] | null;
  abilities?: Ability[] | null;
  attacks?: Attack[];
  weaknesses?: Weakness[];
  resistances?: Resistance[];
  retreatCost?: string[];
  convertedRetreatCost?: number | null;
  nationalPokedexNumbers?: number[];
  ancientTrait?: AncientTrait;

  // --- Trainer/Energy-specific fields ---
  rules?: string[];
};

export type Ability = {
  name: string;
  text: string;
  type: string;  // e.g. "Ability", "Ancient Trait", etc.
};

export type Attack = {
  name: string;
  cost: string[];               // e.g. ["Colorless", "Colorless"]
  convertedEnergyCost: number;
  damage: string;                // keep as string since some are "30+" or "-"
  text: string;
};

export type Weakness = {
  type: string;
  value: string;                 // e.g. "×2"
};

export type Resistance = {
  type: string;
  value: string;                 // e.g. "-30"
};

export type AncientTrait = {
  name: string;
  text: string;
}


// --- Runtime Cards ---
type CardInstanceId = string                           // Primary ID for all cards in-play
type CardSupertype = "Pokémon" | "Trainer" | "Energy"

type DamageModifier =
  | { operation: "multiply"; value: number }
  | { operation: "add"; value: number }

type CardInstance = {
  instanceId: CardInstanceId
  sourceId: string

  name: string;
  sueprtype: CardSupertype
  subtypes?: string[] | null

  // Pokémon fields
  hp?: string | null
  types?: EnergyType[]
  evolvesFrom?: string | null
  retreatCost?: EnergyType[]
  weaknesses?: { type: EnergyType; modifier: DamageModifier }
  resistances?: { type: EnergyType; modifier: DamageModifier }

  // Energy fields
  energyType?: EnergyType
  energyValue?: number

  // Trainer fields ??? 
  // Actionable effects this card provides
  effects: Effect[]

  // Card-data field overrides for temporary effects
  fieldOverrides: []
}


// --- Card Locations ---
type Zone = CardInstanceId[]

type ZoneName = "deck" | "hand" | "discard" | "prize"

type ZonePosition = "top" | "bottom" | "shuffle"

type ZoneRef = {
  player: 1 | 2
  zone: ZoneName
}

type ZoneDest = ZoneRef & {
  position: ZonePosition
}

type Attachment = "evolution" | "energy" | "tools"

type SlotRef =
  | { player: 1 | 2; slot: "active"; attachment: Attachment }
  | { player: 1 | 2; slot: "bench"; index: 0 | 1 | 2 | 3 | 4; attachment: Attachment }

// Board position for cards in-play
type Slot = {
  evolution: CardInstanceId[] // top is active form
  damage: number
  status?: 'ok' | 'psn' | 'brn' | 'par' | 'slp' | 'frz'
  energy: CardInstanceId[]
  tools: CardInstanceId[]
  modifiers: []
}

type Player = {
  id: 1 | 2
  deck: Zone
  discard: Zone
  hand: Zone
  prize: Zone
  active: Slot
  bench: Slot[]
}

type Effect = {
  // card action (move, draw, discard, shuffle)
  // apply status (+ / -)
  // apply damage (+ / -)
}

// messages come from "event listener" system; centralized message definition


type GameState = {
  id: string
  phase: "init" | "player_turn" | "checkup" | "ended"
  players: {
    1: Player
    2: Player
  }
  turnCount: number
  firstPlayer: 1 | 2 
  activePlayer: 1 | 2

  // All card data for both players live here
  cardRegsitry: Record<string, CardInstance>

  actionStack: []
  actionHistory: []
}


function instantiatePlayers() {
  const playerOne: Player = {
    id: 1,
    deck: [],
    discard: [],
    hand: [],
    prize: [],
    active: {
      evolution: [],
      damage: 0,
      status: 'ok',
      energy: [],
      tools: [],
      modifiers: []
    },
    bench: [
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      }
    ]
  }

  const playerTwo: Player = {
    id: 2,
    deck: [],
    discard: [],
    hand: [],
    prize: [],
    active: {
      evolution: [],
      damage: 0,
      status: 'ok',
      energy: [],
      tools: [],
      modifiers: []
    },
    bench: [
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        status: 'ok',
        energy: [],
        tools: [],
        modifiers: []
      },
      {
        evolution: [],
        damage: 0,
        energy: [],
        tools: [],
        modifiers: []
      }
    ]
  }

  return { playerOne, playerTwo }
}


const shuffleZone = (zone: Zone) => {
  for (let i = zone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[zone[i], zone[j]] = [zone[j], zone[i]]
  }
}

const placeInZone = (zone: Zone, position: ZonePosition, cardId: CardInstanceId) => {
  if (position === "top") {
    zone.unshift(cardId)
    return
  }
  zone.push(cardId) // bottom
  if (position === "shuffle") {
    shuffleZone(zone)
  }
}

const moveZoneToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: ZoneRef,
  to: ZoneDest
) => {
  const location = gamestate.players[from.player][from.zone]
  const target = gamestate.players[to.player][to.zone]

  const index = location.indexOf(cardId)
  if (index === -1) {
    // throw error if invalid action should never make it here.
    return gamestate
  }

  location.splice(index, 1)
  placeInZone(target, to.position, cardId)

  return gamestate
}

const getSlotAttachment = (gamestate: GameState, ref: SlotRef): CardInstanceId[] => {
  const player = gamestate.players[ref.player]
  const slot = ref.slot === "active" ? player.active : player.bench[ref.index]
  return slot[ref.attachment]
}

const moveZoneToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: ZoneRef,
  to: SlotRef
) => {
  const location = gamestate.players[from.player][from.zone]
  const target = getSlotAttachment(gamestate, to)

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  target.push(cardId)

  return gamestate
}

const moveSlotToZone = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: ZoneDest
) => {
  const location = getSlotAttachment(gamestate, from)
  const target = gamestate.players[to.player][to.zone]

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  placeInZone(target, to.position, cardId)

  return gamestate
}

const moveSlotToSlot = (
  gamestate: GameState,
  cardId: CardInstanceId,
  from: SlotRef,
  to: SlotRef
) => {
  const location = getSlotAttachment(gamestate, from)
  const target = getSlotAttachment(gamestate, to)

  const index = location.indexOf(cardId)
  if (index === -1) {
    return gamestate
  }

  location.splice(index, 1)
  target.push(cardId)

  return gamestate
}



const stack = []
// stack is for async actions that need to occur in order
// gamestate in suspended "awaiting" resolution

type CoinResult = 'heads' | 'tails'
const flipCoin = (count: number): CoinResult[] => {
  const result: CoinResult[] = []

  for (let i = 0; i < count; i++) {
    const flip = Math.random()
    if (flip > 0.5) {
      result.push('heads')
    } else {
      result.push('tails')
    }
  }

  return result
}


function initializeGameState(): GameState {
  const { playerOne, playerTwo } = instantiatePlayers()
  let firstPlayer: 1 | 2

  const coinResult = flipCoin(1)
  if (coinResult[0] === 'heads') {
    firstPlayer = 1
  } else {
    firstPlayer = 2
  }

  const gamestate: GameState = {
    id: "game-1",
    phase: "init",
    players: {
      1: playerOne,
      2: playerTwo
    },
    turnCount: 0,
    firstPlayer: firstPlayer,
    activePlayer: 1,

    cardRegsitry: {},

    actionStack: [],
    actionHistory: []
  }



  return gamestate
}

// reads primitive expression and returns delta gamestate
// business logical difference between gameplay and atomic action
function evaluateAction() {
  // log action history
  // action already determined legal before getting here
  // should be purely updating values to gamestate directly

  // effects are always sourced by some card whether environmental or active play
  const effect = {
    action: 'DISCARD',
    target: '{playZoneId}'
  }

  switch (effect.action) {
    case 'MOVE_CARD':
    // remove from subject zone
    // place in target zone 
  }

  // return gamestate
}

