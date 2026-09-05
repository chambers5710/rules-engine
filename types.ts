// Game — the full snapshot the engine reads and writes
export type GameState = {
  id: string
  phase: Phase
  players: { 1: Player; 2: Player }
  turnCount: number
  firstPlayer: 1 | 2
  activePlayer: 1 | 2
  cardRegistry: CardRegistry
  mulligans: { 1: number; 2: number }
  setupReady: { 1: boolean; 2: boolean }
  energyAttachedThisTurn: boolean
  actionStack: []
  actionHistory: []
}

// Phase — what kind of step is legal right now
export enum Phase {
  Init = "init",
  Turn = "turn",
  Checkup = "checkup",
  Ended = "ended",
}

// Player — one side of the table
export type Player = {
  id: 1 | 2
  deck: Zone
  discard: Zone
  hand: Zone
  prize: Zone
  active: Slot
  bench: Slot[]
}

// Card registry — every copy in this game, keyed by instanceId
export type CardRegistry = Record<string, CardInstance>

// Zone — an ordered pile of instance ids (index 0 is top)
export type Zone = CardInstanceId[]

// Slot — one Pokémon in play (the active or a bench seat)
export type Slot = {
  evolution: CardInstanceId[] // last entry is the current form
  damage: number
  status: StatusFlags
  energy: CardInstanceId[]
  tools: CardInstanceId[]
  modifiers: []
}

// Zone name — keys on Player that hold a Zone
export type ZoneName = "deck" | "hand" | "discard" | "prize"

// Zone position — where a card lands in a pile
export type ZonePosition = "top" | "bottom" | "shuffle"

// Zone ref — which player's pile
export type ZoneRef = {
  player: 1 | 2
  zone: ZoneName
}

// Zone dest — a pile plus where to insert
export type ZoneDest = ZoneRef & {
  position: ZonePosition
}

// Slot id — which Pokémon in play, with no pile on it
export type SlotId =
  | { player: 1 | 2; slot: "active" }
  | { player: 1 | 2; slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }

// Attachment — a pile that lives on a slot
export type Attachment = "evolution" | "energy" | "tools"

// Slot ref — a Pokémon in play plus which attachment pile
export type SlotRef = SlotId & { attachment: Attachment }

// Status — special conditions; more than one flag may be on
export type Status = "psn" | "brn" | "par" | "slp" | "cnf"

// Status flags — healthy is all false
export type StatusFlags = Record<Status, boolean>

// Card instance — one physical copy in this game
export type CardInstance = {
  instanceId: CardInstanceId
  sourceId: string // printed card id, e.g. "base1-1"
  name: string
  supertype: CardSupertype
  subtypes?: string[] | null
  hp?: string | null
  types?: EnergyType[]
  evolvesFrom?: string | null
  evolvesTo?: string | null
  retreatCost?: EnergyType[]
  attacks?: PrintedAttack[]
  weaknesses?: { type: EnergyType; modifier: DamageModifier }
  resistances?: { type: EnergyType; modifier: DamageModifier }
  energyType?: EnergyType
  energyValue?: number
  fieldOverrides: []
}

// Printed attack — cost normalized to EnergyType for the survey
export type PrintedAttack = {
  name: string
  cost: EnergyType[]
}

// Card instance id — unique per copy; also the registry key
export type CardInstanceId = string

// Card supertype — printed category, Title Case from card data
type CardSupertype = "Pokémon" | "Trainer" | "Energy"

// Damage modifier — parsed from printed weakness / resistance text
export type DamageModifier =
  | { operation: "multiply"; value: number }
  | { operation: "add"; value: number }

// Energy types — Title Case, matches printed card JSON
export const EnergyTypes = [
  "Colorless", "Darkness", "Dragon", "Fairy", "Fighting",
  "Fire", "Free", "Grass", "Lightning", "Metal", "Psychic", "Water",
] as const

export type EnergyType = typeof EnergyTypes[number]

// Card — static row from the card database, not a copy in play
export type Card = {
  id: string // e.g. "sv8-161"
  name: string
  supertype: "Pokémon" | "Trainer" | "Energy"
  number: string
  rarity?: string | null
  artist?: string | null
  flavorText?: string | null
  legalities: {
    unlimited?: "Legal" | "Banned" | "Not Legal"
    standard?: "Legal" | "Banned" | "Not Legal"
    expanded?: "Legal" | "Banned" | "Not Legal"
  }
  images: { small: string; large: string }
  regulationMark?: string | null
  setId: string
  hp?: string | null
  level?: string | null
  subtypes?: string[]
  types?: string[]
  evolvesFrom?: string | null
  evolvesTo?: string[] | null
  abilities?: Ability[] | null
  attacks?: Attack[]
  weaknesses?: Weakness[]
  resistances?: Resistance[]
  retreatCost?: string[]
  convertedRetreatCost?: number | null
  nationalPokedexNumbers?: number[]
  ancientTrait?: AncientTrait
  rules?: string[]
}

// Ability — printed Pokémon Power / Ability text
export type Ability = {
  name: string
  text: string
  type: string // e.g. "Ability", "Pokémon Power"
}

// Attack — printed attack line; damage stays a string ("30+", "—")
export type Attack = {
  name: string
  cost: string[]
  convertedEnergyCost: number
  damage: string
  text: string
}

// Weakness — printed as type + display value ("×2")
export type Weakness = {
  type: string
  value: string
}

// Resistance — printed as type + display value ("-30")
export type Resistance = {
  type: string
  value: string
}

// Ancient trait — printed extra box on some cards
export type AncientTrait = {
  name: string
  text: string
}
