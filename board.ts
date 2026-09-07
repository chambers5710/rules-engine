import type { CardInstance, GameState, Slot, SlotId } from "./types.js"

const BENCH = [0, 1, 2, 3, 4] as const

export type InPlaySlot = { slot: "active" } | { slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }

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

// Lists all Pokemon in play for which player might attach a card during a turn
export function pokemonInPlay(
  gamestate: GameState,
  player: 1 | 2
): InPlaySlot[] {
  const dests: InPlaySlot[] = []
  if (hasActive(gamestate, player)) dests.push({ slot: "active" })
  for (const index of occupiedBench(gamestate, player)) {
    dests.push({ slot: "bench", index })
  }
  return dests
}

export function hasPokemonInPlay(gamestate: GameState, player: 1 | 2): boolean {
  return hasActive(gamestate, player) || occupiedBench(gamestate, player).length > 0
}

// Slot — resolve Active or a bench slot
export function getSlot(gamestate: GameState, ref: SlotId): Slot {
  const player = gamestate.players[ref.player]
  return ref.slot === "active" ? player.active : player.bench[ref.index]
}

// Current form — top of the evolution stack
export function currentForm(gamestate: GameState, slot: Slot): CardInstance | undefined {
  const id = slot.evolution.at(-1)
  if (!id) return undefined
  return gamestate.cardRegistry[id]
}

// KO — damage has reached printed HP on the current form
export function isKnockedOut(gamestate: GameState, slot: Slot): boolean {
  const hp = Number(currentForm(gamestate, slot)?.hp)
  return Number.isFinite(hp) && slot.damage >= hp
}
