import type { SurveyFilter } from "./survey.js"
import type { Attachment, EnergyType, SlotId, SlotRef, Status, ZoneName, ZonePosition, ZoneRef } from "./types.js"

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

// Select pick — what the paused menu lists
export type SelectPick = "cards" | "attacks" | "slots"

export type SelectFilter =
  | { kind: "has_counters"; counters: number }
  | { kind: "survives_counters"; counters: number }
  | { kind: "other_than"; bind: BindingName }
  | { kind: "pays"; bind: BindingName }
  | { kind: "has_type"; type: EnergyType }
  | SurveyFilter

export type CalcFn = "add" | "sub" | "mul" | "min" | "max"

export type RevealTo = "self" | "opponent" | "both"

export type Primitive =
  | { op: Op.MoveZoneToZone; card: string; source: ZoneRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition }
  | { op: Op.MoveZoneToSlot; card: string; source: ZoneRef | BindingName; dest: SlotId | BindingName; attachment: Attachment }
  | { op: Op.MoveSlotToZone; card: string; source: SlotRef | BindingName; dest: ZoneRef | BindingName; position: ZonePosition; attachment?: Attachment }
  | { op: Op.MoveSlotToSlot; card: string; source: SlotRef; dest: SlotRef }
  | { op: Op.Attack; base: number | BindingName; attacker: SlotId | BindingName; defender: SlotId | BindingName; bind: BindingName }
  | { op: Op.ApplyDamage; amount: number | BindingName; slot: SlotId | BindingName }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId | BindingName }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId | BindingName }
  | { op: Op.FlipCoin; bind: BindingName }
  | { op: Op.Select; bind: BindingName; pick: "slots"; who: "self" | "opponent"; filter?: SelectFilter | SelectFilter[] }
  | { op: Op.Select; bind: BindingName; pick: "cards"; source: ZoneRef | SlotRef | BindingName; attachment?: Attachment; filter?: SelectFilter | SelectFilter[] }
  | { op: Op.Select; bind: BindingName; pick: "attacks"; slot: SlotId | BindingName; filter?: SelectFilter | SelectFilter[] }
  | { op: Op.If; bind: BindingName; equals: unknown; then: Expr }
  | { op: Op.Loop; bind: BindingName; until: number | BindingName; then: Expr }
  | { op: Op.ApplyModifier; slot: SlotId | BindingName; field: "attack_damage"; set: number; until: { beat: "end_of_turn"; who: "owner" | "opponent" } }
  | { op: Op.Count; kind: "cards" | "energy_value"; slot: SlotId | BindingName; attachment: Attachment; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "cards"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "first"; zone: ZoneRef | BindingName; filter?: SurveyFilter; bind: BindingName }
  | { op: Op.Count; kind: "damage"; slot: SlotId | BindingName; bind: BindingName }
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
  | { op: Op.Attack; attacker: SlotId; defender: SlotId; damage: number; weakness: boolean; resistance: boolean }
  | { op: Op.ApplyDamage; amount: number; slot: SlotId }
  | { op: Op.ApplyStatus; status: Status; slot: SlotId }
  | { op: Op.RemoveStatus; status: Status; slot: SlotId }
  | { op: Op.FlipCoin; result: "heads" | "tails" }
  | { op: Op.ApplyModifier; slot: SlotId; field: "attack_damage"; set: number; until: { beat: "end_of_turn"; player: 1 | 2 } }
  | { op: Op.SwapActive; slot: SlotId }
  | { op: Op.Shuffle; zone: ZoneRef }
  | { op: Op.Reveal; cards: string[]; from: 1 | 2; to: RevealTo; zone?: ZoneName }

type ActionFrameBase = {
  player: 1 | 2
  kind: Action
  remaining: Expr
  bindings: Record<string, unknown>
  bind: BindingName
  filter?: SelectFilter | SelectFilter[]
}

// Paused expr — Select stopped here; remaining runs after the bind is written
export type ActionFrame =
  | (ActionFrameBase & { pick: "slots"; who: "self" | "opponent" })
  | (ActionFrameBase & { pick: "cards"; source: ZoneRef | SlotRef })
  | (ActionFrameBase & { pick: "attacks"; slot: SlotId })
