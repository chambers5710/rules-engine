import { Op, type Expr } from "./dsl.js"
import { isBasicPokemon, isEnergy } from "./helpers.js"
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
  Promote = "promote",
}

type ActionBase = {
  expr: Expr
  seed?: Record<string, unknown>
}

export type AvailableAction =
  | (ActionBase & { kind: Action.PlayActive; player: 1 | 2; card: string })
  | (ActionBase & { kind: Action.PlayBench; player: 1 | 2; card: string; index: 0 | 1 | 2 | 3 | 4 })
  | (ActionBase & { kind: Action.Ready; player: 1 | 2 })
  | (ActionBase & { kind: Action.AttachEnergy; player: 1 | 2; card: string; to: AttachTo })
  | (ActionBase & { kind: Action.EndTurn; player: 1 | 2 })
  | (ActionBase & { kind: Action.Promote; player: 1 | 2; index: 0 | 1 | 2 | 3 | 4 })

type AttachTo = { slot: "active" } | { slot: "bench"; index: 0 | 1 | 2 | 3 | 4 }

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

function basicsInHand(gamestate: GameState, player: 1 | 2): string[] {
  return gamestate.players[player].hand.filter((card) => isBasicPokemon(gamestate, card))
}

function energyInHand(gamestate: GameState, player: 1 | 2): string[] {
  return gamestate.players[player].hand.filter((card) => isEnergy(gamestate, card))
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

function occupiedBench(
  gamestate: GameState,
  player: 1 | 2
): Array<0 | 1 | 2 | 3 | 4> {
  return ([0, 1, 2, 3, 4] as const).filter(
    (seat) => gamestate.players[player].bench[seat].evolution.length > 0
  )
}

function promoteFromBench(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  return occupiedBench(gamestate, player).map((index) => ({
    kind: Action.Promote,
    player,
    index,
    expr: [],
  }))
}

function pokemonInPlay(
  gamestate: GameState,
  player: 1 | 2
): AttachTo[] {
  const dests: AttachTo[] = []
  if (hasActive(gamestate, player)) dests.push({ slot: "active" })
  for (const index of occupiedBench(gamestate, player)) {
    dests.push({ slot: "bench", index })
  }
  return dests
}

function placeEnergy(gamestate: GameState, player: 1 | 2): AvailableAction[] {
  if (gamestate.energyAttachedThisTurn) return []
  const dests = pokemonInPlay(gamestate, player)
  return energyInHand(gamestate, player).flatMap((card) =>
    dests.map((to) => ({
      kind: Action.AttachEnergy,
      player,
      card,
      to,
      expr: [
        {
          op: Op.MoveZoneToSlot,
          card,
          from: { player, zone: "hand" },
          to: { player, ...to, attachment: "energy" },
        },
      ],
    }))
  )
}

function computeTurn(gamestate: GameState): AvailableAction[] {
  const player = gamestate.activePlayer

  if (!hasActive(gamestate, player)) {
    return promoteFromBench(gamestate, player)
  }

  return [
    ...placeBench(gamestate, player),
    ...placeEnergy(gamestate, player),
    { kind: Action.EndTurn, player, expr: [] },
  ]
}
