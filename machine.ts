import { interpret } from "./interpret.js"
import type { AvailableAction } from "./compute.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

// Apply one client-chosen action (or null when the phase runs with no input).
export function stateMachine(
  gamestate: GameState,
  action: AvailableAction | null
): GameState {
  switch (gamestate.phase) {
    case Phase.Init:
      if (!action) return gamestate
      return runAction(gamestate, action)

    case Phase.Turn:
    case Phase.Checkup:
    case Phase.Ended:
      return gamestate

    default:
      return gamestate
  }
}

function runAction(gamestate: GameState, action: AvailableAction): GameState {
  const ctx = { bindings: { ...action.seed } }
  for (const step of action.expr) {
    gamestate = interpret(gamestate, step, ctx)
  }
  return gamestate
}
