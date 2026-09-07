import { getSlot } from "./board.js"
import type { GameState, Slot, SlotId, StatusFlags } from "./types.js"
import { copy, moveZoneToZone } from "./ops.js"

export function draw(gamestate: GameState, playerId: 1 | 2, count: number) {
  const next = copy(gamestate)
  const deck = next.players[playerId].deck
  const hand = next.players[playerId].hand
  const taken = deck.splice(0, Math.min(count, deck.length))
  hand.push(...taken)
  return next
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

// Promote — whole bench slot becomes Active; bench slot cleared
export function promote(
  gamestate: GameState,
  player: 1 | 2,
  index: 0 | 1 | 2 | 3 | 4
): GameState {
  const next = copy(gamestate)
  const p = next.players[player]
  const from = p.bench[index]
  p.active = {
    evolution: [...from.evolution],
    damage: from.damage,
    status: { ...from.status },
    energy: [...from.energy],
    tools: [...from.tools],
    modifiers: [...from.modifiers],
    evolvedThisTurn: from.evolvedThisTurn,
  }
  p.bench[index] = emptySlot()
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
})

// Empty status — no special conditions
export const emptyStatus = (): StatusFlags => ({
  poison: false,
  burn: false,
  paralyzed: false,
  sleep: false,
  confused: false,
})

// Discard slot — Pokémon, energy, and tools to discard; slot cleared
export function discardSlot(gamestate: GameState, ref: SlotId): GameState {
  const next = copy(gamestate)
  const slot = getSlot(next, ref)
  next.players[ref.player].discard.push(...slot.evolution, ...slot.energy, ...slot.tools)
  if (ref.slot === "active") {
    next.players[ref.player].active = emptySlot()
  } else {
    next.players[ref.player].bench[ref.index] = emptySlot()
  }
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
