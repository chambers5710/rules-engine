import cards from "../../data/cards/base1.json" with { type: "json" }
import { emptySlot, promote, swapActive } from "../../helpers.js"
import { initializeGameState } from "../../initialize.js"
import { emptyStatus } from "../../status.js"
import type { Card, GameState, Slot } from "../../types.js"
import { copies, liveTurn, moveToActive, moveToBench, printed } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function same(a: unknown, b: unknown, message: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(message)
}

function copySlot(slot: Slot): Slot {
  return structuredClone(slot)
}

function leaveActive(slot: Slot): Slot {
  const next = copySlot(slot)
  next.status = emptyStatus()
  next.poisonCounters = 1
  return next
}

function mark(slot: Slot, tag: number) {
  slot.damage = tag * 10
  slot.evolvedThisTurn = tag === 1
  slot.poisonCounters = tag
  slot.status.confused = tag === 1
  slot.modifiers = [
    {
      field: "attack_damage",
      prevent: 10 * tag,
      until: { beat: "end_of_turn", player: 1 },
      phase: "active",
    },
  ]
}

function stage(): GameState {
  const a = printed(set, "base1-36")
  const b = printed(set, "base1-58")
  let gamestate = initializeGameState([a, b, ...copies(printed(set, "base1-98"), 16)], copies(a, 18))
  gamestate = moveToActive(gamestate, 1, "base1-36")
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  return liveTurn(gamestate)
}

{
  const before = stage()
  mark(before.players[1].bench[0], 2)
  const kept = copySlot(before.players[1].bench[0])
  before.players[1].active = emptySlot()
  const after = promote(before, 1, 0)
  same(after.players[1].active, kept, "promote must move the whole bench Slot")
  same(after.players[1].bench[0], emptySlot(), "promote must vacate the bench with emptySlot")
}

{
  const before = stage()
  mark(before.players[1].active, 1)
  mark(before.players[1].bench[0], 2)
  const fromBench = copySlot(before.players[1].bench[0])
  const fromActive = copySlot(before.players[1].active)
  const after = swapActive(before, 1, 0)
  same(after.players[1].active, fromBench, "swap must move the whole bench Slot to Active")
  same(after.players[1].bench[0], leaveActive(fromActive), "swap must keep the Active Slot minus Active-only status")
}

console.log("slot-transfer-check assertions passed")
