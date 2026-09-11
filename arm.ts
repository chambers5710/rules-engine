import { getSlot } from "./board.js"
import { copy } from "./ops.js"
import type { ArmedTrigger, GameState, Slot, SlotId } from "./types.js"

const PLAYERS = [1, 2] as const

export function applyArm(
  gamestate: GameState,
  slot: SlotId,
  trigger: Omit<ArmedTrigger, "phase">
): GameState {
  const next = copy(gamestate)
  const phase =
    trigger.until.player === gamestate.activePlayer ? "active" : "pending"
  getSlot(next, slot).armed.push({ ...trigger, phase })
  return next
}

function walkSlots(gamestate: GameState, visit: (slot: Slot) => void) {
  for (const player of PLAYERS) {
    visit(gamestate.players[player].active)
    for (const seat of gamestate.players[player].bench) visit(seat)
  }
}

export function tickArmedEnter(gamestate: GameState, activePlayer: 1 | 2): GameState {
  const next = copy(gamestate)
  walkSlots(next, (slot) => {
    for (const row of slot.armed) {
      if (row.phase === "pending" && row.until.player === activePlayer) row.phase = "active"
    }
  })
  return next
}

export function tickArmedEnd(gamestate: GameState, endingPlayer: 1 | 2): GameState {
  const next = copy(gamestate)
  walkSlots(next, (slot) => {
    slot.armed = slot.armed.filter(
      (row) => !(row.phase === "active" && row.until.player === endingPlayer)
    )
  })
  return next
}