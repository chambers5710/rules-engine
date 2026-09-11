import { moveZoneToSlot, moveZoneToZone } from "../ops.js"
import type { Card, GameState, SlotId, ZoneName } from "../types.js"
import { Phase } from "../types.js"

export function printed(cards: Card[], id: string): Card {
  const card = cards.find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

export function copies(card: Card, n: number): Card[] {
  return Array.from({ length: n }, () => card)
}

function pull(
  gamestate: GameState,
  player: 1 | 2,
  sourceId: string,
  skip: ZoneName[] = []
): { card: string; zone: ZoneName } | undefined {
  const zones: ZoneName[] = ["hand", "deck", "prize", "discard"]
  for (const zone of zones) {
    if (skip.includes(zone)) continue
    const card = gamestate.players[player][zone].find(
      (id) => gamestate.cardRegistry[id].sourceId === sourceId
    )
    if (card) return { card, zone }
  }
}

function countIn(
  gamestate: GameState,
  player: 1 | 2,
  sourceId: string,
  zone: ZoneName
): number {
  return gamestate.players[player][zone].filter(
    (id) => gamestate.cardRegistry[id].sourceId === sourceId
  ).length
}

export function moveToActive(gamestate: GameState, player: 1 | 2, sourceId: string): GameState {
  const found = pull(gamestate, player, sourceId)
  if (!found) throw new Error(`no ${sourceId} for p${player}`)
  return moveZoneToSlot(
    gamestate,
    found.card,
    { player, zone: found.zone },
    { player, slot: "active", attachment: "evolution" }
  )
}

export function moveToBench(
  gamestate: GameState,
  player: 1 | 2,
  sourceId: string,
  index: 0 | 1 | 2 | 3 | 4
): GameState {
  const found = pull(gamestate, player, sourceId)
  if (!found) throw new Error(`no ${sourceId} for p${player} bench`)
  return moveZoneToSlot(
    gamestate,
    found.card,
    { player, zone: found.zone },
    { player, slot: "bench", index, attachment: "evolution" }
  )
}

export function attachEnergy(
  gamestate: GameState,
  player: 1 | 2,
  sourceId: string,
  n: number,
  dest: SlotId = { player, slot: "active" }
): GameState {
  for (let i = 0; i < n; i++) {
    const found = pull(gamestate, player, sourceId)
    if (!found) throw new Error(`not enough ${sourceId} to attach for p${player}`)
    gamestate = moveZoneToSlot(
      gamestate,
      found.card,
      { player, zone: found.zone },
      { ...dest, attachment: "energy" }
    )
  }
  return gamestate
}

export function toHand(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
  while (countIn(gamestate, player, sourceId, "hand") < n) {
    const found = pull(gamestate, player, sourceId, ["hand"])
    if (!found) throw new Error(`not enough ${sourceId} for p${player} hand`)
    gamestate = moveZoneToZone(
      gamestate,
      found.card,
      { player, zone: found.zone },
      { player, zone: "hand" },
      "bottom"
    )
  }
  return gamestate
}

export function toDeck(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
  while (countIn(gamestate, player, sourceId, "deck") < n) {
    const found = pull(gamestate, player, sourceId, ["deck"])
    if (!found) throw new Error(`not enough ${sourceId} for p${player} deck`)
    gamestate = moveZoneToZone(
      gamestate,
      found.card,
      { player, zone: found.zone },
      { player, zone: "deck" },
      "bottom"
    )
  }
  return gamestate
}

export function toPrize(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
  while (countIn(gamestate, player, sourceId, "prize") < n) {
    const found = pull(gamestate, player, sourceId, ["prize", "hand"])
    if (!found) throw new Error(`not enough ${sourceId} for p${player} prizes`)
    gamestate = moveZoneToZone(
      gamestate,
      found.card,
      { player, zone: found.zone },
      { player, zone: "prize" },
      "bottom"
    )
  }
  return gamestate
}

export function liveTurn(gamestate: GameState): GameState {
  return {
    ...gamestate,
    phase: Phase.Turn,
    turnCount: 1,
    firstPlayer: 1,
    activePlayer: 1,
    setupReady: { 1: true, 2: true },
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
  }
}
