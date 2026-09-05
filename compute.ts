import { Op, type Expr } from "./dsl.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

// Action — every top-level choice the client can make
export enum Action {
  PlayActive = "play_active",
  PlayBench = "play_bench",
  Ready = "ready",
  AttachEnergy = "attach_energy",
  Attack = "attack",
  Retreat = "retreat",
  EndTurn = "end_turn",
}

type ActionBase = {
  expr: Expr
  seed?: Record<string, unknown>
}

export type AvailableAction =
  | (ActionBase & { kind: Action.PlayActive; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.PlayBench; player: 1 | 2; card: string; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.Ready; player: 1 | 2 })
  | (ActionBase & { kind: Action.EndTurn; player: 1 | 2 })

export function computeAvailableActions(gamestate: GameState): AvailableAction[] {
  switch (gamestate.phase) {
    case Phase.Init:
      return computeInit(gamestate)
    case Phase.Turn:
      return computeTurn(gamestate)
    default:
      return []
  }
}

function isBasicPokemon(gamestate: GameState, cardId: string): boolean {
  const printed = gamestate.cardRegistry[cardId]
  return printed?.supertype === "Pokémon" && printed.subtypes?.includes("Basic") === true
}

function basicsInHand(gamestate: GameState, player: 1 | 2): string[] {
  return gamestate.players[player].hand.filter((card) => isBasicPokemon(gamestate, card))
}

function hasActive(gamestate: GameState, player: 1 | 2): boolean {
  return gamestate.players[player].active.evolution.length > 0
}

function nextEmptyBench(
  gamestate: GameState,
  player: 1 | 2
): 0 | 1 | 2 | 3 | 4 | undefined {
  return ([0, 1, 2, 3, 4] as const).find(
    (seat) => gamestate.players[player].bench[seat].evolution.length === 0
  )
}

function placeActive(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (hasActive(gamestate, player)) return []
  return basicsInHand(gamestate, player).map((card) => ({
    kind: Action.PlayActive,
    player,
    card,
    expr: [
      {
        op: Op.MoveZoneToSlot,
        card,
        from: { player, zone: "hand" },
        to: { player, slot: "active", attachment: "evolution" },
      },
    ],
  }))
}

function placeBench(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  const index = nextEmptyBench(gamestate, player)
  if (index === undefined) return []
  return basicsInHand(gamestate, player).map((card) => ({
    kind: Action.PlayBench,
    player,
    card,
    index,
    expr: [
      {
        op: Op.MoveZoneToSlot,
        card,
        from: { player, zone: "hand" },
        to: { player, slot: "bench", index, attachment: "evolution" },
      },
    ],
  }))
}

function computeInit(gamestate: GameState): AvailableAction[] {
  const actions: AvailableAction[] = []

  for (const player of [1, 2] as const) {
    if (gamestate.setupReady[player]) continue

    if (!hasActive(gamestate, player)) {
      actions.push(...placeActive(gamestate, player))
      continue
    }

    actions.push(...placeBench(gamestate, player))
    actions.push({ kind: Action.Ready, player, expr: [] })
  }

  return actions
}

function computeTurn(gamestate: GameState): AvailableAction[] {
  const player = gamestate.activePlayer

  if (!hasActive(gamestate, player)) {
    return placeActive(gamestate, player)
  }

  return [
    ...placeBench(gamestate, player),
    { kind: Action.EndTurn, player, expr: [] },
  ]
}
