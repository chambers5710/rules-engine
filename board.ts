import { foldedCard } from "./card.js"
import type { CardInstance, GameState, PowerSpec, Slot, SlotId, SourceId } from "./types.js"

const BENCH = [0, 1, 2, 3, 4] as const

export function opponent(player: 1 | 2): 1 | 2 {
  return player === 1 ? 2 : 1
}

export function bothReady(gamestate: GameState): boolean {
  return gamestate.setupReady[1] && gamestate.setupReady[2]
}

export function hasActive(gamestate: GameState, player: 1 | 2): boolean {
  return gamestate.players[player].active.evolution.length > 0
}

export function nextEmptyBench(
  gamestate: GameState,
  player: 1 | 2
): 0 | 1 | 2 | 3 | 4 | undefined {
  return BENCH.find(
    (index) => gamestate.players[player].bench[index].evolution.length === 0
  )
}

// Check which bench slots are filled
export function occupiedBench(
  gamestate: GameState,
  player: 1 | 2
): Array<0 | 1 | 2 | 3 | 4> {
  return BENCH.filter(
    (index) => gamestate.players[player].bench[index].evolution.length > 0
  )
}

export function benchSeats(player: 1 | 2): Array<Extract<SlotId, { slot: "bench" }>> {
  return BENCH.map((index) => ({ player, slot: "bench" as const, index }))
}

// Pokémon in play — Returns in-play SlotIds
export function pokemonInPlay(gamestate: GameState, player: 1 | 2): SlotId[] {
  const slots: SlotId[] = []
  if (hasActive(gamestate, player)) slots.push({ player, slot: "active" })
  for (const index of occupiedBench(gamestate, player)) {
    slots.push({ player, slot: "bench", index })
  }
  return slots
}

export function sameSlot(a: SlotId, b: SlotId): boolean {
  if (a.player !== b.player || a.slot !== b.slot) return false
  if (a.slot === "bench" && b.slot === "bench") return a.index === b.index
  return true
}

export function hasPokemonInPlay(gamestate: GameState, player: 1 | 2): boolean {
  return hasActive(gamestate, player) || occupiedBench(gamestate, player).length > 0
}

export function needsPromote(gamestate: GameState, player: 1 | 2): boolean {
  return !hasActive(gamestate, player) && occupiedBench(gamestate, player).length > 0
}

// Slot — resolve Active or a bench slot by id, with data
export function getSlot(gamestate: GameState, slotId: SlotId): Slot {
  const player = gamestate.players[slotId.player]
  return slotId.slot === "active" ? player.active : player.bench[slotId.index]
}

/** Printed + `fieldOverrides`. Transform overlay is `currentForm`. */
export function physicalForm(gamestate: GameState, slot: Slot): CardInstance | undefined {
  const id = slot.evolution.at(-1)
  if (!id) return undefined
  return foldedCard(gamestate, id)
}

function powerLive(gamestate: GameState, slot: Slot): PowerSpec[] {
  if (slot.status.asleep || slot.status.paralyzed || slot.status.confused) return []
  const form = physicalForm(gamestate, slot)
  if (!form) return []
  const powers = gamestate.effectRegistry[form.sourceId]?.powers
  return powers ? Object.values(powers) : []
}

function ignorePowersLive(gamestate: GameState): boolean {
  for (const player of [1, 2] as const) {
    for (const id of pokemonInPlay(gamestate, player)) {
      if (powerLive(gamestate, getSlot(gamestate, id)).some((power) => power.kind === "ignore_powers")) {
        return true
      }
    }
  }
  return false
}

/** Transform — Active, Power on, not Toxic Gas. Identity fold, not a capability read. */
export function copyingDefending(gamestate: GameState, slot: Slot): boolean {
  if (gamestate.players[1].active !== slot && gamestate.players[2].active !== slot) return false
  if (ignorePowersLive(gamestate)) return false
  return powerLive(gamestate, slot).some((power) => power.kind === "copy_defending")
}

/** Effect lookup while Transform is on — defending printed id, not Ditto. */
export function attackSourceId(gamestate: GameState, player: 1 | 2): SourceId | undefined {
  const slot = gamestate.players[player].active
  const printed = physicalForm(gamestate, slot)
  if (!printed) return
  if (!copyingDefending(gamestate, slot)) return printed.sourceId
  return physicalForm(gamestate, gamestate.players[opponent(player)].active)?.sourceId ?? printed.sourceId
}

// Current form — top of the evolution stack, plus Transform copy of the Defending Pokémon
export function currentForm(gamestate: GameState, slot: Slot): CardInstance | undefined {
  const printed = physicalForm(gamestate, slot)
  if (!printed) return
  if (!copyingDefending(gamestate, slot)) return printed
  const owner = gamestate.players[1].active === slot ? 1 : 2
  const other = physicalForm(gamestate, gamestate.players[opponent(owner)].active)
  if (!other) return printed
  return {
    ...printed,
    name: other.name,
    hp: other.hp,
    types: other.types,
    weaknesses: other.weaknesses,
    resistances: other.resistances,
    retreatCost: other.retreatCost,
    attacks: other.attacks,
    cannotRetreat: other.cannotRetreat,
    blocksStatus: other.blocksStatus,
    prizesOnKo: other.prizesOnKo,
  }
}

// KO — damage has reached printed HP on the current form
export function isKnockedOut(gamestate: GameState, slot: Slot): boolean {
  const hp = Number(currentForm(gamestate, slot)?.hp)
  return Number.isFinite(hp) && slot.damage >= hp
}
