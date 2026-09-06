import { copy, getSlot } from "./ops.js"
import type { GameState, Modifier, Slot, SlotId } from "./types.js"

const PLAYERS = [1, 2] as const

function walkSlots(gamestate: GameState, visit: (slot: Slot) => void) {
  for (const player of PLAYERS) {
    const p = gamestate.players[player]
    visit(p.active)
    for (const seat of p.bench) visit(seat)
  }
}

export function applyModifier(
  gamestate: GameState,
  slot: SlotId,
  modifier: Omit<Modifier, "phase">
): GameState {
  const next = copy(gamestate)
  getSlot(next, slot).modifiers.push({ ...modifier, phase: "pending" })
  return next
}

export function readModifier(
  gamestate: GameState,
  slot: SlotId,
  field: Modifier["field"],
  base: number
): number {
  const hit = getSlot(gamestate, slot).modifiers.find(
    (m) => m.field === field && m.phase === "active"
  )
  return hit ? hit.set : base
}

export function tickModifiersEnter(gamestate: GameState, activePlayer: 1 | 2): GameState {
  const next = copy(gamestate)
  walkSlots(next, (slot) => {
    for (const m of slot.modifiers) {
      if (m.phase === "pending" && m.until.player === activePlayer) m.phase = "active"
    }
  })
  return next
}

export function tickModifiersEnd(gamestate: GameState, endingPlayer: 1 | 2): GameState {
  const next = copy(gamestate)
  walkSlots(next, (slot) => {
    slot.modifiers = slot.modifiers.filter(
      (m) => !(m.phase === "active" && m.until.player === endingPlayer)
    )
  })
  return next
}
