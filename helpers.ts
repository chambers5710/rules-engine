import { getSlot } from "./board.js"
import { stripLeaveActive, stripPairLocks } from "./modifiers.js"
import { emptyStatus } from "./status.js"
import { copy, copySlot, moveSlotToZone, moveZoneToZone } from "./ops.js"
import type { GameState, Slot, SlotId, ZoneName } from "./types.js"

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
  const next = copy(gamestate, player)
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
  const bench = gamestate.players[player].bench[index]
  if (bench.evolution.length === 0) return gamestate
  const left = [...gamestate.players[player].active.evolution]
  const next = copy(gamestate, 1, 2)
  const p = next.players[player]
  const outgoing = leaveActive(p.active)
  stripLeaveActive(outgoing)
  p.active = copySlot(p.bench[index])
  p.bench[index] = outgoing
  stripPairLocks(next, left)
  return next
}

// Empty slot — one vacant Pokémon slot
export const emptySlot = (): Slot => ({
  evolution: [],
  damage: 0,
  status: emptyStatus(),
  energy: [],
  tools: [],
  markers: [],
  modifiers: [],
  evolvedThisTurn: false,
  poisonCounters: 1,
})

// Empty a seat — Pokémon, energy, and tools to that owner's zone (default discard)
export function discardSlot(gamestate: GameState, ref: SlotId, dest: ZoneName = "discard"): GameState {
  const destRef = { player: ref.player, zone: dest } as const
  const slot = getSlot(gamestate, ref)
  const evolution = [...slot.evolution]
  const energy = [...slot.energy]
  const tools = [...slot.tools]
  for (const card of evolution) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "evolution" }, destRef, "bottom")
  }
  for (const card of energy) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "energy" }, destRef, "bottom")
  }
  for (const card of tools) {
    gamestate = moveSlotToZone(gamestate, card, { ...ref, attachment: "tools" }, destRef, "bottom")
  }
  const next = copy(gamestate, 1, 2)
  if (ref.slot === "active") next.players[ref.player].active = emptySlot()
  else next.players[ref.player].bench[ref.index] = emptySlot()
  if (ref.slot === "active") stripPairLocks(next, evolution)
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

// Take prize — one card from prize into hand (top of prize; face-up KO picks use Select)
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
