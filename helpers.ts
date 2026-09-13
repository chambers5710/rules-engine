import { getSlot } from "./board.js"
import { emptyStatus } from "./status.js"
import type { GameState, Slot, SlotId } from "./types.js"
import { copy, moveSlotToZone, moveZoneToZone } from "./ops.js"

export function draw(gamestate: GameState, playerId: 1 | 2, count: number) {
  for (let i = 0; i < count; i++) {
    const card = gamestate.players[playerId].deck[0]
    if (!card) break
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player: playerId, zone: "deck" },
      { player: playerId, zone: "hand" },
      "bottom"
    )
  }
  return gamestate
}

export function placePrize(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToZone(
    gamestate,
    cardId,
    { player: playerId, zone: "deck" },
    { player: playerId, zone: "prize" },
    "bottom"
  )
}

function copySlot(slot: Slot): Slot {
  return structuredClone(slot)
}

// Left Active — conditions are Active-only; poison amount resets with the flag
function leaveActive(slot: Slot): Slot {
  const next = copySlot(slot)
  next.status = emptyStatus()
  next.poisonCounters = 1
  return next
}

// Promote — whole bench slot becomes Active; bench slot cleared
export function promote(
  gamestate: GameState,
  player: 1 | 2,
  index: 0 | 1 | 2 | 3 | 4
): GameState {
  const next = copy(gamestate)
  const p = next.players[player]
  p.active = copySlot(p.bench[index])
  p.bench[index] = emptySlot()
  return next
}

// Retreat / Switch / Gust — seats trade; the Pokémon that left Active drops status
export function swapActive(
  gamestate: GameState,
  player: 1 | 2,
  index: 0 | 1 | 2 | 3 | 4
): GameState {
  const next = copy(gamestate)
  const p = next.players[player]
  const bench = p.bench[index]
  if (bench.evolution.length === 0) return gamestate
  const outgoing = leaveActive(p.active)
  p.active = copySlot(bench)
  p.bench[index] = outgoing
  return next
}

// Empty slot — one vacant Pokémon slot
export const emptySlot = (): Slot => ({
  evolution: [],
  damage: 0,
  status: emptyStatus(),
  energy: [],
  tools: [],
  modifiers: [],
  evolvedThisTurn: false,
  poisonCounters: 1,
})

// Discard slot — Pokémon, energy, and tools to discard; slot cleared
export function discardSlot(gamestate: GameState, ref: SlotId): GameState {
  const dest = { player: ref.player, zone: "discard" as const }
  const slot = getSlot(gamestate, ref)
  const evolution = [...slot.evolution]
  const energy = [...slot.energy]
  const tools = [...slot.tools]
  for (const card of evolution) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "evolution" }, dest, "bottom")
  }
  for (const card of energy) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "energy" }, dest, "bottom")
  }
  for (const card of tools) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "tools" }, dest, "bottom")
  }
  const next = copy(gamestate)
  if (ref.slot === "active") next.players[ref.player].active = emptySlot()
  else next.players[ref.player].bench[ref.index] = emptySlot()
  return next
}

export function returnHandToDeck(gamestate: GameState, player: 1 | 2): GameState {
  for (const card of [...gamestate.players[player].hand]) {
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player, zone: "hand" },
      { player, zone: "deck" },
      "bottom"
    )
  }
  return gamestate
}

// Take prize — one card from prize into hand (top of prize)
export function takePrize(gamestate: GameState, player: 1 | 2): GameState {
  const card = gamestate.players[player].prize[0]
  if (!card) return gamestate
  return moveZoneToZone(
    gamestate,
    card,
    { player, zone: "prize" },
    { player, zone: "hand" },
    "bottom"
  )
}
