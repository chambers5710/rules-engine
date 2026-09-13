import type { ClockPhase, ModifierUntil } from "./types.js"

export type TickedClock = {
  until: ModifierUntil
  phase: ClockPhase
}

export function clockActivates(clock: TickedClock, activePlayer: 1 | 2): boolean {
  return clock.until.beat === "end_of_turn" && clock.phase === "pending" && clock.until.player === activePlayer
}

export function clockExpires(clock: TickedClock, endingPlayer: 1 | 2): boolean {
  return clock.until.beat === "end_of_turn" && clock.phase === "active" && clock.until.player === endingPlayer
}
