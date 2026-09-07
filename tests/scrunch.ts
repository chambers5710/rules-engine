import cards from "../data/cards/base1.json" with { type: "json" }
import { listen } from "../index.js"
import { initializeGameState } from "../initialize.js"
import { moveZoneToSlot, moveZoneToZone } from "../ops.js"
import { createSessionFromState } from "../session.js"
import type { Card, GameState, ZoneName } from "../types.js"
import { Phase } from "../types.js"

function printed(id: string): Card {
  const card = (cards as Card[]).find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

function copies(card: Card, n: number): Card[] {
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

function moveToActive(gamestate: GameState, player: 1 | 2, sourceId: string): GameState {
  const found = pull(gamestate, player, sourceId)
  if (!found) throw new Error(`no ${sourceId} for p${player}`)
  return moveZoneToSlot(
    gamestate,
    found.card,
    { player, zone: found.zone },
    { player, slot: "active", attachment: "evolution" }
  )
}

function moveToBench(
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

function attachEnergy(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
  for (let i = 0; i < n; i++) {
    const found = pull(gamestate, player, sourceId)
    if (!found) throw new Error(`not enough ${sourceId} to attach for p${player}`)
    gamestate = moveZoneToSlot(
      gamestate,
      found.card,
      { player, zone: found.zone },
      { player, slot: "active", attachment: "energy" }
    )
  }
  return gamestate
}

function toHand(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
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

function toPrize(gamestate: GameState, player: 1 | 2, sourceId: string, n: number): GameState {
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

function board(): GameState {
  const chansey = printed("base1-3")
  const hitmonchan = printed("base1-7")
  const fighting = printed("base1-97")

  let gamestate = initializeGameState(
    [chansey, chansey, ...copies(fighting, 16)],
    [hitmonchan, hitmonchan, ...copies(fighting, 16)]
  )

  gamestate = moveToActive(gamestate, 1, "base1-3")
  gamestate = moveToBench(gamestate, 1, "base1-3", 0)
  gamestate = moveToActive(gamestate, 2, "base1-7")
  gamestate = moveToBench(gamestate, 2, "base1-7", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 3)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  gamestate = toHand(gamestate, 2, "base1-97", 3)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)

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

function session() {
  return createSessionFromState(board())
}

console.log("Chansey vs Hitmonchan")
listen(session(), () => session())
