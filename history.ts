import { currentForm, getSlot, sameSlot } from "./board.js"
import { Op, type HistoryEntry } from "./dsl.js"
import type { GameState, SlotId } from "./types.js"

export function record(gamestate: GameState, entry: HistoryEntry): GameState {
  return { ...gamestate, history: [...gamestate.history, entry] }
}

export function lastAttackOn(
  gamestate: GameState,
  slot: SlotId
): { turn: number; amount: number } | undefined {
  const card = currentForm(gamestate, getSlot(gamestate, slot))?.instanceId
  if (!card) return
  for (let i = gamestate.history.length - 1; i >= 0; i--) {
    const entry = gamestate.history[i]
    if (entry.op !== Op.Attack) continue
    if (entry.defenderCard !== card) continue
    return { turn: entry.turn, amount: entry.damage }
  }
}

export function lastDamageFrom(gamestate: GameState, slot: SlotId): SlotId | undefined {
  for (let i = gamestate.history.length - 1; i >= 0; i--) {
    const entry = gamestate.history[i]
    if (entry.op !== Op.ApplyDamage) continue
    if (entry.amount <= 0) continue
    if (!sameSlot(entry.slot, slot)) continue
    if (entry.source === "poison" || entry.source === "burn") return
    return entry.from
  }
}
