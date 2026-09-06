import type { SlotId, SlotRef, Status, ZoneDest, ZoneRef } from "./types.js"

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
  ApplyModifier = "apply_modifier",
}

export type BindingName = `$${string}`

export type SlotTarget = SlotId | BindingName

// Select pick — what the paused menu lists from `from`
export type SelectPick = "cards" | "attacks"

export type Primitive =
  | { op: Op.MoveZoneToZone; card: string; from: ZoneRef; to: ZoneDest }
  | { op: Op.MoveZoneToSlot; card: string; from: ZoneRef; to: SlotRef }
  | { op: Op.MoveSlotToZone; card: string; from: SlotRef; to: ZoneDest }
  | { op: Op.MoveSlotToSlot; card: string; from: SlotRef; to: SlotRef }
  | { op: Op.Attack; base: number; from: SlotTarget; to: SlotTarget; bind: BindingName }
  | { op: Op.ApplyDamage; amount: number | BindingName; slot: SlotTarget }
  | { op: Op.ApplyStatus; status: Status; slot: SlotTarget }
  | { op: Op.RemoveStatus; status: Status; slot: SlotTarget }
  | { op: Op.FlipCoin; bind: BindingName }
  | { op: Op.Select; bind: BindingName; from: ZoneRef | SlotRef | SlotTarget; pick: SelectPick }
  | { op: Op.If; bind: BindingName; equals: unknown; then: Primitive[] }
  | { op: Op.ApplyModifier; slot: SlotTarget; field: "attack_damage"; set: number; until: { beat: "end_of_turn"; who: "owner" | "opponent" } }

export type Expr = Primitive[]

// Paused expr — Select stopped here; remaining runs after the bind is written
export type ActionFrame = {
  remaining: Expr
  bindings: Record<string, unknown>
  player: 1 | 2
  bind: BindingName
  from: ZoneRef | SlotRef | SlotTarget
  pick: SelectPick
}
