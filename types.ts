import type { ActionFrame, Expr, HistoryEntry } from "./dsl.js"

// Printed card id (catalog `Card.id`, instance `sourceId`) — e.g. "base1-1"
export type SourceId = string

// Unique per copy; also the cardRegistry key
export type CardInstanceId = string

export type EffectEntry = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
  trainer?: Record<string, Expr>
  triggers?: Record<string, TriggerSpec>
  powers?: Record<string, PowerSpec>
}

export type EffectRegistry = Record<SourceId, EffectEntry>

// Game — the full snapshot the engine reads and writes
export type GameState = {
  id: string
  phase: Phase
  players: { 1: Player; 2: Player }
  turnCount: number
  firstPlayer: 1 | 2
  activePlayer: 1 | 2
  cardRegistry: CardRegistry
  effectRegistry: EffectRegistry
  mulligans: { 1: number; 2: number }
  setupReady: { 1: boolean; 2: boolean }
  energyAttachedThisTurn: boolean
  retreatedThisTurn: boolean
  actionStack: ActionFrame[]
  history: HistoryEntry[]
  subscriptions: TriggerSubscription[]
  lastHit: Record<CardInstanceId, LastHit>
  stadium: InPlayStadium | null
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
export type CardRegistry = Record<CardInstanceId, CardInstance>

// Zone — an ordered list of instance ids (index 0 is top)
export type Zone = CardInstanceId[]

// Shared in-play Stadium — not a player zone. Owner is who played it (replace discards to that discard).
export type InPlayStadium = {
  card: CardInstanceId
  player: 1 | 2
}

// Zone name — keys on Player that hold a Zone
export type ZoneName = "deck" | "hand" | "discard" | "prize"

// Zone position — where a card lands on a write; not part of a zone's identity
export type ZonePosition = "top" | "bottom" | "shuffle"

// Zone ref — which player's zone
export type ZoneRef = {
  player: 1 | 2
  zone: ZoneName
}

// Slot — one Pokémon in play (Active or a bench slot)
export type Slot = {
  evolution: CardInstanceId[] // last entry is the current form
  damage: number
  status: StatusFlags
  energy: CardInstanceId[]
  tools: CardInstanceId[]
  modifiers: Modifier[]
  evolvedThisTurn: boolean // played or evolved this turn; cannot evolve again yet. First-turn evolve and `block_evolve` are `mayEvolve`, not this flag.
  poisonCounters: number
}
// Slot id — which Pokémon in play
export type SlotId =
  | { player: 1 | 2; slot: "active" }
  | { player: 1 | 2; slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }

// Attachment — which card list on a slot
export type Attachment = "evolution" | "energy" | "tools"

// Slot ref — a slot plus which attachment
export type SlotRef = SlotId & { attachment: Attachment }

export type AttackDamageRewrite =
  | { set: number }
  | { add: number }
  | { sub: number }
  | { prevent: number }

/** Sibling to the numeric rewrite — not inside `rewriteOf`. */
export type DamageScope = { from?: CardInstanceId; attack?: string }

export type AttackEffectsRewrite = { prevent: "all" }

export type AttackUseRewrite =
  | { flip: true }
  | { ban: string }

export type AbilityUseRewrite = { ban: string }

export type EnergyTypeRewrite = { set: EnergyType }

export type ClockPhase = "pending" | "active"

export type EndOfTurnUntil = { beat: "end_of_turn"; player: 1 | 2; next?: true }

export type TurnClock = {
  until: EndOfTurnUntil
  phase: ClockPhase
}

export type ModifierUntil = EndOfTurnUntil | { beat: "leave_play" }

type ModifierClock = {
  until: ModifierUntil
  phase: ClockPhase
  card?: CardInstanceId
}

// Modifier — on a slot; end_of_turn.player is set when interpret applies the op
export type Modifier =
  | ({ field: "attack_damage" } & ModifierClock & AttackDamageRewrite & DamageScope)
  | ({ field: "attack_effects" } & ModifierClock & AttackEffectsRewrite)
  | ({ field: "attack_use" } & ModifierClock & AttackUseRewrite)
  | ({ field: "ability_use" } & ModifierClock & AbilityUseRewrite)
  | ({ field: "cannot_retreat" } & ModifierClock)
  | ({ field: "trainer_use" } & ModifierClock)
  | ({ field: "can_attack"; forbid: CardInstanceId } & ModifierClock)
  | ({ field: "energy_type" } & ModifierClock & EnergyTypeRewrite)
  | ({ field: "weakness_type" } & ModifierClock & EnergyTypeRewrite)
  | ({ field: "resistance_type" } & ModifierClock & EnergyTypeRewrite)

// Damage via — why counters changed; matcher filters on this (not history)
export type DamageVia =
  | "attack"
  | "recoil"
  | "splash"
  | "poison"
  | "burn"
  | "effect"
  | "trigger"

export type GameEvent = {
  kind: "damage_applied" | "pokemon_knocked_out"
  targetCard: CardInstanceId
  target: SlotId
  sourceCard?: CardInstanceId
  source?: SlotId
  via: DamageVia
  applied?: number
}

export type PowerSpec =
  | { kind: "blocks_status" }
  | { kind: "prevent_damage"; min: number }
  | { kind: "reduce_retreat" }
  | { kind: "block_evolve" }
  | { kind: "ignore_powers" }
  | { kind: "halve_damage" }
  | { kind: "reveal_hand" }
  | { kind: "copy_defending" }
  | { kind: "coin_prevent_attack" }

export type TriggerSpec =
  | {
      when: "damage_applied"
      via: DamageVia[]
      minApplied?: number
      blockedByStatus: boolean
      then: Expr
    }
  | {
      when: "pokemon_knocked_out"
      via: DamageVia[]
      blockedByStatus: boolean
      then: Expr
    }

// Temporary registration; standing specs stay on EffectEntry
export type TriggerSubscription = TurnClock & {
  id: string
  sourceCard: CardInstanceId
  trigger: TriggerSpec
}

// Compact Mirror Move memory — keyed by defender instance on GameState.lastHit
export type LastHit = {
  turn: number
  sourceCard: CardInstanceId
  applied: number
}

// Status — special conditions; more than one flag may be on
export type Status = "poison" | "burn" | "paralyzed" | "asleep" | "confused"

// Status flags — healthy is all false
export type StatusFlags = Record<Status, boolean>

// Printed fields a later write may replace (Buzzap: supertype / energyType / energyValue).
// Identity (`instanceId`, `sourceId`, `images`) is not overridable.
export type CardFieldOverrides = Partial<
  Omit<CardInstance, "instanceId" | "sourceId" | "images" | "fieldOverrides">
>

// Card instance — one physical copy in this game
export type CardInstance = {
  instanceId: CardInstanceId
  sourceId: SourceId
  name: string
  supertype: CardSupertype
  subtypes?: string[] | null
  hp?: string | null
  types?: EnergyType[]
  evolvesFrom?: string | null
  evolvesTo?: string | null
  retreatCost?: EnergyType[]
  attacks?: PrintedAttack[]
  abilities?: Ability[]
  weaknesses?: { type: EnergyType; modifier: DamageModifier }[]
  resistances?: { type: EnergyType; modifier: DamageModifier }[]
  energyType?: EnergyType
  energyValue?: number
  rules?: string[]
  cannotRetreat?: boolean
  blocksStatus?: boolean
  prizesOnKo?: boolean
  images: { small: string; large: string }
  fieldOverrides: CardFieldOverrides
}

// Printed attack — cost normalized to EnergyType for the survey
export type PrintedAttack = {
  name: string
  cost: EnergyType[]
  text: string
  damage: string
}

// Card supertype — printed category, Title Case from card data
type CardSupertype = "Pokémon" | "Trainer" | "Energy"

// Damage modifier — parsed from printed weakness / resistance text
export type DamageModifier =
  | { operation: "multiply"; value: number }
  | { operation: "add"; value: number }

// Damage counter — printed "damage counter" language is this many damage
export const DAMAGE_COUNTER = 10

// Energy types — Title Case, matches printed card JSON
export const EnergyTypes = [
  "Colorless", "Darkness", "Dragon", "Fairy", "Fighting",
  "Fire", "Free", "Grass", "Lightning", "Metal", "Psychic", "Water",
] as const

export type EnergyType = typeof EnergyTypes[number]

// Card — static row from the card database, not a copy in play
export type Card = {
  id: SourceId
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
