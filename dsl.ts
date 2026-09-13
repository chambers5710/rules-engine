import type { SurveyFilter } from "./survey.js"
import type { Attachment, AttackDamageRewrite, AttackUseRewrite, DamageVia, EnergyType, EnergyTypeRewrite, GameEvent, SlotId, SlotRef, Status, ZoneName, ZonePosition, ZoneRef } from "./types.js"

export enum Op {
  MoveZoneToZone = "move_zone_to_zone",
  MoveZoneToSlot = "move_zone_to_slot",
  MoveSlotToZone = "move_slot_to_zone",
  MoveSlotToSlot = "move_slot_to_slot",
  Attack = "attack",
  ApplyDamage = "apply_damage",
  ApplyStatus = "apply_status",
  RemoveStatus = "remove_status",
  FlipCoin = "flip_coin",
  Select = "select",
  If = "if",
  Loop = "loop",
  ApplyModifier = "apply_modifier",
  Count = "count",
  Calc = "calc",
  SwapActive = "swap_active",
  RunEffect = "run_effect",
  Draw = "draw",
  Shuffle = "shuffle",
  Reveal = "reveal",
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
  events?: GameEvent[]
}

// Select pick — what the paused menu lists
export type SelectPick = "cards" | "attacks" | "slots" | "types"

export type SlotFilter =
  | { kind: "has_counters"; counters: number }
  | { kind: "survives_counters"; counters: number }
  | { kind: "other_than"; bind: BindingName }
  | { kind: "has_type"; type: EnergyType }
  | { kind: "has_energy"; type?: EnergyType }
  | { kind: "empty" }
  | { kind: "evolved" }
  | { kind: "breeder"; bind: BindingName }

export type CardFilter =
  | SurveyFilter
  | { kind: "other_than"; bind: BindingName }
  | { kind: "pays"; bind: BindingName }

export type CalcFn = "add" | "sub" | "mul" | "min" | "max" | "half_up_10" | "half_down_10"

export type SeatWho = "self" | "opponent" | "both"
export type SeatAmong = "bench" | "in_play"

export type RevealTo = "self" | "opponent" | "both"

export type Primitive =
  | { op: Op.MoveZoneToZone; card: string; source: ZoneRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition }
  | { op: Op.MoveZoneToSlot; card: string; source: ZoneRef | BindingName; dest: SlotId | BindingName; attachment: Attachment }
  | { op: Op.MoveSlotToZone; card: string; source: SlotRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition; attachment?: Attachment }
  | { op: Op.MoveSlotToSlot; card: string; source: SlotRef | BindingName; dest: SlotRef | BindingName; attachment?: Attachment }
  | { op: Op.Attack; base: number | BindingName; attacker: SlotId | BindingName; defender: SlotId | BindingName; bind: BindingName }
  | { op: Op.ApplyDamage; amount: number | BindingName; slot: SlotId | BindingName; source?: "poison" | "burn" }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId | BindingName; counters?: number }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId | BindingName }
  | { op: Op.FlipCoin; bind: BindingName; check?: Status }
  | { op: Op.Select; bind: BindingName; pick: "slots"; who: "self" | "opponent"; among?: SeatAmong; chooser?: "self" | "opponent"; filter?: SlotFilter | SlotFilter[]; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "cards"; source: ZoneRef | SlotRef | BindingName; attachment?: Attachment; filter?: CardFilter | CardFilter[]; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "attacks"; slot: SlotId | BindingName; optional?: true }
  | { op: Op.Select; bind: BindingName; pick: "types"; except?: EnergyType[]; optional?: true }
  | { op: Op.If; bind: BindingName; equals: unknown; then: Expr }
  | { op: Op.If; slot: SlotId | BindingName; status: Status; then: Expr }
  | { op: Op.Loop; bind: BindingName; until: number | BindingName; then: Expr }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_damage"; until: { beat: "end_of_turn"; who: "owner" | "opponent" }; card?: string | BindingName } & AttackDamageRewrite
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_effects"; prevent: "all"; until: { beat: "end_of_turn"; who: "owner" | "opponent" }; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_use"; until: { beat: "end_of_turn"; who: "owner" | "opponent" } | { beat: "leave_play" }; card?: string | BindingName } & (
      | { flip: true }
      | { ban: string | BindingName }
    )
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "energy_type"; set: EnergyType; until: { beat: "end_of_turn"; who: "owner" | "opponent" }; card?: string | BindingName }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "weakness_type" | "resistance_type"; set: EnergyType | BindingName; until: { beat: "leave_play" } }
  | { op: Op.Count; kind: "cards" | "energy_value"; slot: SlotId | BindingName; attachment: Attachment; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "cards"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "first"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "first"; slot: SlotId | BindingName; attachment: Attachment; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "damage"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "hp"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "weakness"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "attack_damage"; slot: SlotId | BindingName; attack: BindingName; bind: BindingName }
  | { op: Op.Count; kind: "last_attacked" | "last_hit"; slot: SlotId | BindingName; bind: BindingName }
  | { op: Op.Count; kind: "slots"; who: SeatWho; among: SeatAmong; filter?: SlotFilter | SlotFilter[]; bind: BindingName }
  | { op: Op.Arm; who: "owner" | "opponent"; when: "pokemon_knocked_out"; via: DamageVia[]; blockedByStatus: boolean; then: Expr }
  | { op: Op.DiscardSlot; slot: SlotId | BindingName }
  | { op: Op.Devolve; slot: SlotId | BindingName; from: string | BindingName }
  | { op: Op.Each; who: SeatWho; among: SeatAmong; filter?: SlotFilter | SlotFilter[]; bind: BindingName; then: Expr }
  | { op: Op.Calc; fn: CalcFn; a: number | BindingName; b: number | BindingName; bind: BindingName }
  | { op: Op.SwapActive; slot: SlotId | BindingName }
  | { op: Op.RunEffect; attack: BindingName; slot: SlotId | BindingName }
  | { op: Op.Draw; who: "self" | "opponent"; count: number | BindingName }
  | { op: Op.Shuffle; zone: ZoneRef | BindingName }
  | { op: Op.Reveal; cards: BindingName | BindingName[]; to: RevealTo }

export type Expr = Primitive[]

// Resolved execution — binds already filled; no If/Loop/Select/Count/Calc
export type HistoryEntry =
  | { op: Op.MoveZoneToZone; card: string; source: ZoneRef; dest: ZoneRef; position: ZonePosition }
  | { op: Op.MoveZoneToSlot; card: string; source: ZoneRef; dest: SlotRef }
  | { op: Op.MoveSlotToZone; card: string; source: SlotRef; dest: ZoneRef; position: ZonePosition }
  | { op: Op.MoveSlotToSlot; card: string; source: SlotRef; dest: SlotRef }
  | { op: Op.Attack; attacker: SlotId; defender: SlotId; damage: number; raw: number; weakness: boolean; resistance: boolean; prevented: boolean }
  | { op: Op.ApplyDamage; amount: number; slot: SlotId; source?: "poison" | "burn" }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId }
  | { op: Op.FlipCoin; result: "heads" | "tails"; check?: Status }
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_damage"; until: { beat: "end_of_turn"; player: 1 | 2 } } & AttackDamageRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_effects"; prevent: "all"; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_use"; until: { beat: "end_of_turn"; player: 1 | 2 } | { beat: "leave_play" } } & AttackUseRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "energy_type"; until: { beat: "end_of_turn"; player: 1 | 2 } } & EnergyTypeRewrite
  | { op: Op.ApplyModifier; slot: SlotId; field: "weakness_type" | "resistance_type"; until: { beat: "leave_play" } } & EnergyTypeRewrite
  | { op: Op.SwapActive; slot: SlotId }
  | { op: Op.Shuffle; zone: ZoneRef }
  | { op: Op.Reveal; cards: string[]; from: 1 | 2; to: RevealTo; zone?: ZoneName }

type ActionFrameBase = {
  player: 1 | 2
  kind: Action
  remaining: Expr
  ctx: InterpretCtx
  bind: BindingName
  optional?: true
}

// Paused expr — Select stopped here; remaining runs after the bind is written
export type ActionFrame =
  | (ActionFrameBase & { pick: "slots"; who: "self" | "opponent"; among: SeatAmong; chooser: 1 | 2; filter?: SlotFilter | SlotFilter[] })
  | (ActionFrameBase & { pick: "cards"; source: ZoneRef | SlotRef; filter?: CardFilter | CardFilter[] })
  | (ActionFrameBase & { pick: "attacks"; slot: SlotId })
  | (ActionFrameBase & { pick: "types"; except: EnergyType[] })
