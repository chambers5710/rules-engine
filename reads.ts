import { currentForm } from "./board.js"
import type { CardInstance, GameState, Slot, Status } from "./types.js"

/** Asleep / Paralyzed — no attack. Named attack bans are `attackBanned`. */
export function canAttack(slot: Slot): boolean {
  return !slot.status.asleep && !slot.status.paralyzed
}

/** Same status gate as `canAttack`, plus folded `cannotRetreat` (Doll). */
export function canRetreat(gamestate: GameState, slot: Slot): boolean {
  if (!canAttack(slot)) return false
  const form = currentForm(gamestate, slot)
  return !!form && !form.cannotRetreat
}

/** Base Pokémon Power: not Asleep / Confused / Paralyzed. `evenIf` later, on this helper. */
export function mayUsePokemonPower(slot: Slot): boolean {
  const s = slot.status
  return !s.asleep && !s.paralyzed && !s.confused
}

/** Doll `blocksStatus` — Burn is not on the printed list. Vacant seat still accepts. */
export function acceptsStatus(gamestate: GameState, slot: Slot, status: Status): boolean {
  if (status === "burn") return true
  return currentForm(gamestate, slot)?.blocksStatus !== true
}

/** Doll `prizesOnKo: false`. Missing form still takes a prize. Discard is not this question. */
export function takesPrizeOnKo(form: CardInstance | undefined): boolean {
  return form?.prizesOnKo !== false
}
