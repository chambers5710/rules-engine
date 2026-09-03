import { Op, type Expr } from "./dsl.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

// Action — every top-level choice the client can make
export enum Action {
  PlayActive = "play_active",
  PlayBench = "play_bench",
  AttachEnergy = "attach_energy",
  Attack = "attack",
  Retreat = "retreat",
  EndTurn = "end_turn",
}

// AvailableAction — legal choice for the current snapshot
export type AvailableAction = {
  kind: Action.PlayActive
  player: 1 | 2
  card: string
  expr: Expr
  seed: Record<string, unknown>
}

// Legal moves for the current snapshot. Phase decides which branch runs.
export function computeAvailableActions(gamestate: GameState): AvailableAction[] {
  switch (gamestate.phase) {
    case Phase.Init:
      return computeInit(gamestate)
    default:
      return []
  }
}

// Init — Active empty → each Basic in hand is a PlayActive choice
function computeInit(gamestate: GameState): AvailableAction[] {
  const actions: AvailableAction[] = []

  for (const player of [1, 2] as const) {
    if (gamestate.players[player].active.evolution.length > 0) continue

    for (const card of gamestate.players[player].hand) {
      const printed = gamestate.cardRegistry[card]
      if (printed?.supertype !== "Pokémon") continue
      if (!printed.subtypes?.includes("Basic")) continue

      actions.push({
        kind: Action.PlayActive,
        player,
        card,
        seed: {},
        expr: [
          {
            op: Op.MoveZoneToSlot,
            card,
            from: { player, zone: "hand" },
            to: { player, slot: "active", attachment: "evolution" },
          },
        ],
      })
    }
  }

  return actions
}
