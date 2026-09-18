import type { SurveyFilter } from "./survey.js"
import type { Attachment, AttackDamageRewrite, AttackUseRewrite, CardFieldOverrides, CardInstanceId, DamageVia, EnergyType, EnergyTypeRewrite, GameEvent, SlotId, SlotRef, Status, ZoneName, ZonePosition, ZoneRef } from "./types.js"

export enum Op {
  MoveZoneToZone = "move_zone_to_zone",
  MoveZoneToSlot = "move_zone_to_slot",
  MoveSlotToZone = "move_slot_to_zone",
  MoveSlotToSlot = "move_slot_to_slot",
  MoveZoneToStadium = "move_zone_to_stadium",
  Attack = "attack",
  ApplyDamage = "apply_damage",
  ApplyStatus = "apply_status",
  RemoveStatus = "remove_status",
  FlipCoin = "flip_coin",
  Select = "select",
  If = "if",
  Loop = "loop",
  ApplyModifier = "apply_modifier",
  ApplyMarker = "apply_marker",
  ApplyFieldOverrides = "apply_field_overrides",
  Count = "count",
  Calc = "calc",
  SwapActive = "swap_active",
  RunEffect = "run_effect",
  Draw = "draw",
  Shuffle = "shuffle",
  EndTurn = "end_turn",
  Reveal = "reveal",
  Push = "push",
  Reorder = "reorder",
  Each = "each",
  Arm = "arm",
  DiscardSlot = "discard_slot",
  Devolve = "devolve",
}

// Action — every top-level choice the client can make
export enum Action {
  PlayActive = "play_active",
  PlayBench = "play_bench",
  AttachEnergy = "attach_energy",
  Evolve = "evolve",
  Attack = "attack",
  Ability = "ability",
  PlayTrainer = "play_trainer",
  PlayStadium = "play_stadium",
  UseStadium = "use_stadium",
  Choose = "choose",
  Retreat = "retreat",
  Promote = "promote",
  Ready = "ready",
  EndTurn = "end_turn",
}

export type BindingName = `$${string}`

// Durable interpret context — pause stores this, resume restores it
export type InterpretScript = {
  coins?: Array<"heads" | "tails">
}

export type InterpretCtx = {
  bindings: Record<string, unknown>
  script?: InterpretScript
  via?: "attack" | "trigger"
  attack?: string
  events?: GameEvent[]
  attackShield?: Record<string, boolean>
  endTurn?: true
}

export type EndOfTurnWho = {
  beat: "end_of_turn"
  who: "owner" | "opponent"
  next?: true
  leave_active?: true
  leave_play?: true
}

// Select pick — what the paused menu lists
export type SelectPick = "cards" | "attacks" | "slots" | "types" | "names"

export type NameOption = { name: string; zone?: BindingName }

export type SlotFilter =
  | { kind: "has_counters"; counters: number }
  | { kind: "survives_counters"; counters: number }
  | { kind: "other_than"; bind: BindingName }
  | { kind: "name"; name: string }
  | { kind: "has_type"; type: EnergyType | BindingName; not?: true }
  | { kind: "has_energy"; type?: EnergyType }
  | { kind: "empty" }
  | { kind: "evolved" }
  | { kind: "benched" }
  | { kind: "evolved_this_turn"; not?: true }
  | { kind: "breeder"; bind: BindingName }
  | { kind: "marker"; name: string }

export type CardFilter =
  | SurveyFilter
  | { kind: "other_than"; bind: BindingName }
  | { kind: "among"; bind: BindingName }
  | { kind: "pays"; bind: BindingName }
  | { kind: "any"; of: CardFilter[] }

export type CalcFn = "add" | "sub" | "mul" | "min" | "max" | "half_up_10" | "half_down_10"

export type SeatWho = "self" | "opponent" | "both"
export type SeatAmong = "bench" | "in_play"

export type RevealTo = "self" | "opponent" | "both"

// Authored `set` — string fields may be a bind (Buzzap `energyType: "$type"`)
export type CardFieldOverrideSet = {
  [K in keyof CardFieldOverrides]?: NonNullable<CardFieldOverrides[K]> extends string
    ? NonNullable<CardFieldOverrides[K]> | BindingName
    : CardFieldOverrides[K]
} & { types?: EnergyType[] | BindingName }

export type Primitive =
  | { op: Op.MoveZoneToZone; card: string; source: ZoneRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition }
  | { op: Op.MoveZoneToSlot; card: string; source: ZoneRef | BindingName; dest: SlotId | BindingName; attachment: Attachment }
  | { op: Op.MoveSlotToZone; card: string; source: SlotRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition; attachment?: Attachment }
  | { op: Op.MoveSlotToSlot; card: string; source: SlotRef | BindingName; dest: SlotRef | BindingName; attachment?: Attachment; sourceAttachment?: Attachment }
  | { op: Op.MoveZoneToStadium; card: string; source: ZoneRef | BindingName }
  | { op: Op.Attack; base: number | BindingName; attacker: SlotId | BindingName; defender: SlotId | BindingName; bind: BindingName; matchup?: false }
  | { op: Op.ApplyDamage; amount: number | BindingName; slot: SlotId | BindingName; source?: "poison" | "burn" }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId | BindingName; counters?: number }
  | { op: Op.ApplyMarker; slot: SlotId | BindingName; name: string }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId | BindingName }
  | { op: Op.FlipCoin; bind: BindingName; check?: Status }
  | { op: Op.Select; bind: BindingName; pick: "slots"; who: SeatWho; among?: SeatAmong; chooser?: "self" | "opponent"; filter?: SlotFilter | SlotFilter[]; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "cards"; source: ZoneRef | SlotRef | BindingName; attachment?: Attachment; filter?: CardFilter | CardFilter[]; hidden?: true; optional?: true; chooser?: "self" | "opponent" }
  | { op: Op.Select; bind: BindingName; pick: "attacks"; slot: SlotId | BindingName; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "types"; except?: EnergyType[]; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "names"; names: NameOption[]; optional?: true; chooser?: "self" | "opponent" }
  | { op: Op.If; bind: BindingName; equals: unknown; not?: true; gate?: true; then: Expr }
  | { op: Op.If; slot: SlotId | BindingName; status: Status; then: Expr }
  | { op: Op.If; slot: SlotId | BindingName; filter: SlotFilter | SlotFilter[]; then: Expr }
  | { op: Op.Loop; bind: BindingName; until: number | BindingName; then: Expr }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_damage"; until: EndOfTurnWho; card?: string | BindingName; from?: SlotId | BindingName; attack?: string | BindingName; before?: "matchup" } & AttackDamageRewrite
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_effects"; prevent: "all"; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_use"; until: EndOfTurnWho | { beat: "leave_play" }; card?: string | BindingName } & (
      | { flip: true }
      | { ban: string | BindingName }
    )
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "ability_use"; ban: string | BindingName; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "cannot_retreat"; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "trainer_use"; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "can_attack"; forbid: SlotId | BindingName; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "energy_type"; set: EnergyType; until: EndOfTurnWho; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "weakness_type" | "resistance_type"; set: EnergyType | BindingName; until: { beat: "leave_play" } | { beat: "leave_active" } }
  | { op: Op.ApplyFieldOverrides; card: string | BindingName; set: CardFieldOverrideSet }
  | { op: Op.Count; kind: "cards" | "energy_value"; slot: SlotId | BindingName; attachment: Attachment; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "cards"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "prefix"; n: number | BindingName; zone: ZoneRef | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "first" | "last" | "random"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "first" | "last"; slot: SlotId | BindingName; attachment: Attachment; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "damage"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "hp"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "weakness"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "type"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "attack_damage"; slot: SlotId | BindingName; attack: BindingName; bind: BindingName }
  | { op: Op.Count; kind: "last_attacked" | "last_hit" | "knocked_out"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "slots"; who: SeatWho; among: SeatAmong; filter?: SlotFilter | SlotFilter[]; bind: BindingName }
  | { op: Op.Arm; who: "owner" | "opponent"; when: "pokemon_knocked_out" | "damage_applied"; via: DamageVia[]; minApplied?: number; blockedByStatus: boolean; then: Expr }
  | { op: Op.DiscardSlot; slot: SlotId | BindingName; dest?: ZoneName }
  | { op: Op.Devolve; slot: SlotId | BindingName; from: string | BindingName; dest?: ZoneName }
  | { op: Op.Each; who: SeatWho; among: SeatAmong; filter?: SlotFilter | SlotFilter[]; bind: BindingName; then: Expr }
  | { op: Op.Calc; fn: CalcFn; a: number | BindingName; b: number | BindingName; bind: BindingName }
  | { op: Op.SwapActive; slot: SlotId | BindingName }
  | { op: Op.RunEffect; attack: BindingName; slot: SlotId | BindingName; strip?: CopyStrip[] }
  | { op: Op.Draw; who: "self" | "opponent"; count: number | BindingName }
  | { op: Op.Shuffle; zone: ZoneRef | BindingName }
  | { op: Op.EndTurn }
  | { op: Op.Reveal; cards: BindingName | BindingName[]; to: RevealTo }
  | { op: Op.Push; bind: BindingName; value: BindingName | string }
  | { op: Op.Reorder; zone: ZoneRef | BindingName; cards: BindingName }

export type Expr = Primitive[]

/** What a copy may drop. Default `run_effect` keeps the attack as written. */
export const CopyStrips = ["energy_pay", "recoil"] as const
export type CopyStrip = typeof CopyStrips[number]

// Resolved execution — binds already filled; no If/Loop/Select/Count/Calc
export type HistoryEntry =
  | { op: Op.MoveZoneToZone; card: string; source: ZoneRef; dest: ZoneRef; position: ZonePosition; prevented?: true }
  | { op: Op.MoveZoneToSlot; card: string; source: ZoneRef; dest: SlotRef }
  | { op: Op.MoveSlotToZone; card: string; source: SlotRef; dest: ZoneRef; position: ZonePosition }
  | { op: Op.MoveSlotToSlot; card: string; source: SlotRef; dest: SlotRef }
  | { op: Op.MoveZoneToStadium; card: string; source: ZoneRef; discarded?: { card: string; player: 1 | 2 } }
  | { op: Op.Attack; attacker: SlotId; defender: SlotId; damage: number; raw: number; weakness: boolean; resistance: boolean; prevented: boolean }
  | { op: Op.ApplyDamage; amount: number; slot: SlotId; source?: "poison" | "burn" }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId }
  | { op: Op.ApplyMarker; slot: SlotId; name: string }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId }
  | { op: Op.FlipCoin; result: "heads" | "tails"; check?: Status }
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_damage"; until: { beat: "end_of_turn"; player: 1 | 2 }; from?: CardInstanceId; attack?: string; before?: "matchup" } & AttackDamageRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_effects"; prevent: "all"; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_use"; until: { beat: "end_of_turn"; player: 1 | 2 } | { beat: "leave_play" } } & AttackUseRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "ability_use"; ban: string; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "cannot_retreat"; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "trainer_use"; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "can_attack"; forbid: string; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "energy_type"; until: { beat: "end_of_turn"; player: 1 | 2 } } & EnergyTypeRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "weakness_type" | "resistance_type"; until: { beat: "leave_play" } | { beat: "leave_active" } } & EnergyTypeRewrite
  | { op: Op.ApplyFieldOverrides; card: string; set: CardFieldOverrides }
  | { op: Op.SwapActive; slot: SlotId }
  | { op: Op.Shuffle; zone: ZoneRef }
  | { op: Op.EndTurn }
  | { op: Op.Reveal; cards: string[]; from: 1 | 2; to: RevealTo; zone?: ZoneName }
  | { op: Op.Reorder; zone: ZoneRef; cards: string[] }

type ActionFrameBase = {
  player: 1 | 2
  kind: Action
  remaining: Expr
  ctx: InterpretCtx
  bind: BindingName
  optional?: true
  pendingTriggers?: Array<{
    seat: SlotId
    then: Expr
    drop?: string
    attacker?: SlotId
    applied?: number
    retreated?: SlotId
  }>
}

// Paused expr — Select stopped here; remaining runs after the bind is written
export type ActionFrame =
  | (ActionFrameBase & { pick: "slots"; who: SeatWho; among: SeatAmong; chooser: 1 | 2; filter?: SlotFilter | SlotFilter[] })
  | (ActionFrameBase & { pick: "cards"; source: ZoneRef | SlotRef; filter?: CardFilter | CardFilter[]; hidden?: true; chooser: 1 | 2 })
  | (ActionFrameBase & { pick: "attacks"; slot: SlotId })
  | (ActionFrameBase & { pick: "types"; except: EnergyType[] })
  | (ActionFrameBase & { pick: "names"; names: NameOption[]; chooser: 1 | 2 })
