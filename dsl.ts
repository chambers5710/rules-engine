import type { SlotId, SlotRef, Status, ZoneDest, ZoneRef } from "./types.js"

export enum Op {
  MoveZoneToZone = "move_zone_to_zone",
  MoveZoneToSlot = "move_zone_to_slot",
  MoveSlotToZone = "move_slot_to_zone",
  MoveSlotToSlot = "move_slot_to_slot",
  ApplyDamage = "apply_damage",
  ApplyStatus = "apply_status",
  RemoveStatus = "remove_status",
  FlipCoin = "flip_coin",
  Select = "select",
  If = "if",
}

export type Primitive =
  | { op: Op.MoveZoneToZone; card: string; from: ZoneRef; to: ZoneDest }
  | { op: Op.MoveZoneToSlot; card: string; from: ZoneRef; to: SlotRef }
  | { op: Op.MoveSlotToZone; card: string; from: SlotRef; to: ZoneDest }
  | { op: Op.MoveSlotToSlot; card: string; from: SlotRef; to: SlotRef }
  | { op: Op.ApplyDamage; amount: number; to: SlotId }
  | { op: Op.ApplyStatus; status: Status; to: SlotId }
  | { op: Op.RemoveStatus; status: Status; from: SlotId }
  | { op: Op.FlipCoin; bind: string }
  | { op: Op.Select; bind: string; from: ZoneRef | SlotRef }
  | { op: Op.If; bind: string; equals: unknown; then: Primitive[] }

export type Expr = Primitive[]
