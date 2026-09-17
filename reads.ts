import { copyingDefending, currentForm, getSlot, occupiedBench, opponent, physicalForm, pokemonInPlay } from "./board.js"
import type { CardInstance, CardInstanceId, EnergyType, GameState, PowerSpec, Slot, SlotId, Status } from "./types.js"

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

/** Specs on another seat that apply to this one (Aurora Veil / Guard). */
function aimedAt(gamestate: GameState, slot: SlotId): PowerSpec[] {
  const aimed: PowerSpec[] = []
  if (slot.slot === "bench") {
    for (const power of standingSpecs(gamestate, gamestate.players[slot.player].active)) {
      if (power.kind === "prevent_attacks" && power.on === "owner_bench") aimed.push(power)
    }
  }
  if (slot.slot === "active") {
    const foe = gamestate.players[opponent(slot.player)].active
    for (const power of standingSpecs(gamestate, foe)) {
      if (power.kind === "cannot_retreat" && power.on === "opponent_active") aimed.push(power)
    }
  }
  return aimed
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

/** Same status gate as `canAttack`, plus folded `cannotRetreat`, timed `cannot_retreat`, and standing Guard. */
export function canRetreat(gamestate: GameState, slot: Slot): boolean {
  if (statusBlocksAttackAndRetreat(slot)) return false
  if (slot.modifiers.some((m) => m.field === "cannot_retreat" && m.phase === "active")) return false
  const form = currentForm(gamestate, slot)
  if (!form || form.cannotRetreat) return false
  for (const player of PLAYERS) {
    if (gamestate.players[player].active !== slot) continue
    if (aimedAt(gamestate, { player, slot: "active" }).some((power) => power.kind === "cannot_retreat")) {
      return false
    }
  }
  return true
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

function attackSourceMatches(power: Extract<PowerSpec, { kind: "prevent_attacks" }>, from?: Slot): boolean {
  if (!power.from) return true
  if (!from) return false
  return power.from === "evolved" && from.evolution.length >= 2
}

/** Aurora Veil on owner bench; Neutral Shield on self from Evolved. */
export function preventsAttackEffects(gamestate: GameState, slot: SlotId, from?: Slot): boolean {
  const specs: Extract<PowerSpec, { kind: "prevent_attacks" }>[] = []
  for (const power of aimedAt(gamestate, slot)) {
    if (power.kind === "prevent_attacks") specs.push(power)
  }
  for (const power of standingSpecs(gamestate, getSlot(gamestate, slot))) {
    if (power.kind === "prevent_attacks" && power.on === "self") specs.push(power)
  }
  return specs.some((power) => attackSourceMatches(power, from))
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

/** Scale after W/R, round down 10. Standing Kabuto Armor is ×0.5; timed Light Screen is `attack_damage` `mul`. 0 stays 0. */
export function halveAttackDamage(gamestate: GameState, slot: Slot, amount: number): number {
  if (amount <= 0) return amount
  let factor = 1
  if (standingSpecs(gamestate, slot).some((power) => power.kind === "halve_damage")) factor *= 0.5
  for (const m of slot.modifiers) {
    if (m.field === "attack_damage" && m.phase === "active" && "mul" in m) factor *= m.mul
  }
  if (factor === 1) return amount
  return Math.floor((amount * factor) / 10) * 10
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

/** Pokémon Tower: discard → owner's hand stays in discard. Derived from the stuck Stadium dump. */
export function blocksDiscardToHand(gamestate: GameState): boolean {
  const stuck = gamestate.stadium
  if (!stuck) return false
  const sourceId = gamestate.cardRegistry[stuck.card]?.sourceId
  if (!sourceId) return false
  return Object.values(gamestate.effectRegistry[sourceId]?.stadium ?? {}).some(
    (spec) => spec.kind === "block_discard_to_hand"
  )
}
