import type { GameState, Slot, StatusFlags } from "./types.js"
import { moveZoneToSlot, moveZoneToZone } from "./ops.js"

// these are extra helpers and not at this point used in ops

export function draw(gamestate: GameState, playerId: 1 | 2, count: number) {
  const next = structuredClone(gamestate)
  const deck = next.players[playerId].deck
  const hand = next.players[playerId].hand
  const taken = deck.splice(0, Math.min(count, deck.length))
  hand.push(...taken)
  return next
}

export function discard(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToZone(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, zone: "discard", position: "bottom" }
  )
}

export function placePrize(gamestate: GameState, playerId: 1 | 2, cardId: string) {
return moveZoneToZone(
  gamestate,
  cardId,
  { player: playerId, zone: "deck" },
  { player: playerId, zone: "prize", position: "bottom" }
)
}

export function playActive(gamestate: GameState, playerId: 1 | 2, cardId: string) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, slot: "active", attachment: "evolution" }
  )
}

export function playBench(
  gamestate: GameState,
  playerId: 1 | 2,
  cardId: string,
  index: 0 | 1 | 2 | 3 | 4
) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, slot: "bench", index, attachment: "evolution" }
  )
}

// Promote — whole bench seat becomes Active; bench seat cleared
export function promote(
  gamestate: GameState,
  player: 1 | 2,
  index: 0 | 1 | 2 | 3 | 4
): GameState {
  const next = structuredClone(gamestate)
  const p = next.players[player]
  const from = p.bench[index]
  p.active = {
    evolution: [...from.evolution],
    damage: from.damage,
    status: { ...from.status },
    energy: [...from.energy],
    tools: [...from.tools],
    modifiers: [...from.modifiers],
  }
  p.bench[index] = emptySlot()
  return next
}

// Empty slot — one vacant Pokémon seat
export const emptySlot = (): Slot => ({
  evolution: [],
  damage: 0,
  status: emptyStatus(),
  energy: [],
  tools: [],
  modifiers: [],
})

// Empty status — no special conditions
export const emptyStatus = (): StatusFlags => ({
  psn: false,
  brn: false,
  par: false,
  slp: false,
  cnf: false,
})

// Basic Pokémon — Energy's printed "Basic" subtype does not count
export function isBasicPokemon(gamestate: GameState, cardId: string): boolean {
  const printed = gamestate.cardRegistry[cardId]
  return printed?.supertype === "Pokémon" && printed.subtypes?.includes("Basic") === true
}

export function isEnergy(gamestate: GameState, cardId: string): boolean {
  return gamestate.cardRegistry[cardId]?.supertype === "Energy"
}

// KO — damage has reached printed HP on the current form
export function isKnockedOut(gamestate: GameState, slot: Slot): boolean {
  const id = slot.evolution.at(-1)
  if (!id) return false
  const hp = Number(gamestate.cardRegistry[id]?.hp)
  return Number.isFinite(hp) && slot.damage >= hp
}

// Discard Active — Pokémon, energy, and tools to discard; seat cleared
export function discardActive(gamestate: GameState, player: 1 | 2): GameState {
  const next = structuredClone(gamestate)
  const slot = next.players[player].active
  next.players[player].discard.push(...slot.evolution, ...slot.energy, ...slot.tools)
  next.players[player].active = emptySlot()
  return next
}

// Take prize — one card from prize into hand (top of prize)
export function takePrize(gamestate: GameState, player: 1 | 2): GameState {
  const card = gamestate.players[player].prize[0]
  if (!card) return gamestate
  return moveZoneToZone(
    gamestate,
    card,
    { player, zone: "prize" },
    { player, zone: "hand", position: "bottom" }
  )
}

export function attachEnergy(
  gamestate: GameState,
  playerId: 1 | 2,
  cardId: string,
  to: { slot: "active" } | { slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }
) {
  return moveZoneToSlot(
    gamestate,
    cardId,
    { player: playerId, zone: "hand" },
    { player: playerId, ...to, attachment: "energy" }
  )
}
