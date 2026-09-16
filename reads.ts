import { currentForm, occupiedBench } from "./board.js"
import type { CardInstance, CardInstanceId, EnergyType, GameState, PowerSpec, Slot, Status } from "./types.js"

function standingSpecs(gamestate: GameState, slot: Slot): PowerSpec[] {
  const form = currentForm(gamestate, slot)
  if (!form || !mayUsePokemonPower(slot)) return []
  const powers = gamestate.effectRegistry[form.sourceId]?.powers
  return powers ? Object.values(powers) : []
}

function statusBlocksAttackAndRetreat(slot: Slot): boolean {
  return slot.status.asleep || slot.status.paralyzed
}

/** Asleep / Paralyzed — no attack. `target` is the defending instance (Tail Wag). Named bans are `attackBanned`. */
export function canAttack(slot: Slot, target?: CardInstanceId): boolean {
  if (statusBlocksAttackAndRetreat(slot)) return false
  if (!target) return true
  return !slot.modifiers.some(
    (m) => m.field === "can_attack" && m.phase === "active" && m.forbid === target
  )
}

/** Same status gate as `canAttack`, plus folded `cannotRetreat` (Doll) and timed `cannot_retreat`. */
export function canRetreat(gamestate: GameState, slot: Slot): boolean {
  if (statusBlocksAttackAndRetreat(slot)) return false
  if (slot.modifiers.some((m) => m.field === "cannot_retreat" && m.phase === "active")) return false
  const form = currentForm(gamestate, slot)
  return !!form && !form.cannotRetreat
}

/** Base Pokémon Power: not Asleep / Confused / Paralyzed. `evenIf` later, on this helper. */
export function mayUsePokemonPower(slot: Slot): boolean {
  const s = slot.status
  return !s.asleep && !s.paralyzed && !s.confused
}

/** Doll `blocksStatus` or a standing Power (Thick Skinned). Burn is not on the printed list. Vacant seat still accepts. */
export function acceptsStatus(gamestate: GameState, slot: Slot, status: Status): boolean {
  if (status === "burn") return true
  if (currentForm(gamestate, slot)?.blocksStatus === true) return false
  return !standingSpecs(gamestate, slot).some((power) => power.kind === "blocks_status")
}

/** Invisible Wall — attack/splash damage ≥ min while the Power is on. */
export function preventsAttackDamage(gamestate: GameState, slot: Slot, amount: number): boolean {
  if (amount < 0) return false
  return standingSpecs(gamestate, slot).some(
    (power) => power.kind === "prevent_damage" && amount >= power.min
  )
}

/** Printed Active retreat, minus one Colorless per benched `reduce_retreat` Power that is on. */
export function retreatCost(gamestate: GameState, player: 1 | 2): EnergyType[] {
  const printed = currentForm(gamestate, gamestate.players[player].active)?.retreatCost ?? []
  let drop = 0
  for (const index of occupiedBench(gamestate, player)) {
    const bench = gamestate.players[player].bench[index]
    if (standingSpecs(gamestate, bench).some((power) => power.kind === "reduce_retreat")) drop++
  }
  if (drop === 0) return printed
  const cost: EnergyType[] = []
  for (const type of printed) {
    if (type === "Colorless" && drop > 0) {
      drop--
      continue
    }
    cost.push(type)
  }
  return cost
}

/** Doll `prizesOnKo: false`. Missing form still takes a prize. Discard is not this question. */
export function takesPrizeOnKo(form: CardInstance | undefined): boolean {
  return form?.prizesOnKo !== false
}
