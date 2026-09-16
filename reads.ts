import { copyingDefending, currentForm, getSlot, occupiedBench, opponent, physicalForm, pokemonInPlay } from "./board.js"
import type { CardInstance, CardInstanceId, EnergyType, GameState, PowerSpec, Slot, Status } from "./types.js"

const PLAYERS = [1, 2] as const

/** Status only. `standingSpecs` filters `ignore_powers`; do not call that from here. */
function livePowers(gamestate: GameState, slot: Slot): PowerSpec[] {
  const form = physicalForm(gamestate, slot)
  if (!form || !mayUsePokemonPower(slot)) return []
  const powers = gamestate.effectRegistry[form.sourceId]?.powers
  return powers ? Object.values(powers) : []
}

function standingSpecs(gamestate: GameState, slot: Slot): PowerSpec[] {
  const specs = livePowers(gamestate, slot)
  if (!powersSuppressed(gamestate)) return specs
  return specs.filter((power) => power.kind === "ignore_powers")
}

function statusBlocksAttackAndRetreat(slot: Slot): boolean {
  return slot.status.asleep || slot.status.paralyzed
}

/** WOTC: neither player may evolve on their first turn, including setup Pokémon. */
export function isPlayersFirstTurn(gamestate: GameState, player: 1 | 2): boolean {
  if (gamestate.turnCount < 1) return false
  return player === gamestate.firstPlayer
    ? gamestate.turnCount === 1
    : gamestate.turnCount === 2
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

/** Headache — timed `trainer_use` on that player's seats (Acid clock on `$defending`). */
export function mayPlayTrainer(gamestate: GameState, player: 1 | 2): boolean {
  for (const id of pokemonInPlay(gamestate, player)) {
    if (getSlot(gamestate, id).modifiers.some((m) => m.field === "trainer_use" && m.phase === "active")) {
      return false
    }
  }
  return true
}

/** Base Pokémon Power: not Asleep / Confused / Paralyzed. `evenIf` later, on this helper. */
export function mayUsePokemonPower(slot: Slot): boolean {
  const s = slot.status
  return !s.asleep && !s.paralyzed && !s.confused
}

/** Muk Toxic Gas — ignore other Pokémon Powers. Live `ignore_powers` stays on. */
export function powersSuppressed(gamestate: GameState): boolean {
  for (const player of PLAYERS) {
    for (const id of pokemonInPlay(gamestate, player)) {
      if (livePowers(gamestate, getSlot(gamestate, id)).some((power) => power.kind === "ignore_powers")) {
        return true
      }
    }
  }
  return false
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

/** Haunter Transparency — Power is on; the coin lives in interpret (`attackShield`). */
export function coinPreventsAttack(gamestate: GameState, slot: Slot): boolean {
  return standingSpecs(gamestate, slot).some((power) => power.kind === "coin_prevent_attack")
}

/** Kabuto Armor — half after W/R, round down 10. 0 stays 0. */
export function halveAttackDamage(gamestate: GameState, slot: Slot, amount: number): number {
  if (amount <= 0) return amount
  if (!standingSpecs(gamestate, slot).some((power) => power.kind === "halve_damage")) return amount
  return Math.floor(amount / 2 / 10) * 10
}

/** Hand evolve and Breeder: not first turn, not played/evolved this turn, no live `block_evolve` / Transform. */
export function mayEvolve(gamestate: GameState, player: 1 | 2, slot: Slot): boolean {
  if (isPlayersFirstTurn(gamestate, player) || slot.evolvedThisTurn) return false
  if (copyingDefending(gamestate, slot)) return false
  for (const who of PLAYERS) {
    for (const id of pokemonInPlay(gamestate, who)) {
      if (standingSpecs(gamestate, getSlot(gamestate, id)).some((power) => power.kind === "block_evolve")) {
        return false
      }
    }
  }
  return true
}

/** Transform — attached Energy pays as any type. */
export function energyPaysAny(gamestate: GameState, slot: Slot): boolean {
  return copyingDefending(gamestate, slot)
}

/** Omanyte Clairvoyance — this hand is face up if the opponent has a live `reveal_hand` Power. */
export function handIsPublic(gamestate: GameState, player: 1 | 2): boolean {
  const other = opponent(player)
  for (const id of pokemonInPlay(gamestate, other)) {
    if (standingSpecs(gamestate, getSlot(gamestate, id)).some((power) => power.kind === "reveal_hand")) {
      return true
    }
  }
  return false
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
