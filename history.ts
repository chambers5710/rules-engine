import type { HistoryEntry } from "./dsl.js"
import type { GameState } from "./types.js"

export function record(gamestate: GameState, entry: HistoryEntry): GameState {
  return { ...gamestate, history: [...gamestate.history, entry] }
}
