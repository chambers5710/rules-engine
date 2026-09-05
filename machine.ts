import { Action, type AvailableAction } from "./compute.js"
import { draw, placePrize } from "./helpers.js"
import { interpret } from "./interpret.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

const PRIZE_COUNT = 6
const PLAYERS = [1, 2] as const

// Apply one client-chosen action (or null when the phase runs with no input).
export function stateMachine(
  gamestate: GameState,
  action: AvailableAction | null
): GameState {
  switch (gamestate.phase) {
    case Phase.Init: {
      if (!action) return gamestate
      gamestate = initPhase(gamestate, action)
      if (!bothReady(gamestate)) return gamestate
      gamestate = setPrizes(gamestate)
      return enterTurn(gamestate, gamestate.activePlayer, 1)
    }

    case Phase.Turn:
      if (action?.kind === Action.EndTurn) return enterCheckup(gamestate)
      return turnPhase(gamestate, action)

    case Phase.Checkup:
      return checkupPhase(gamestate)

    case Phase.Ended:
    default:
      return gamestate
  }
}

// Init — apply one setup action (place or Ready)
function initPhase(gamestate: GameState, action: AvailableAction): GameState {
  if (action.kind === Action.Ready) {
    return {
      ...gamestate,
      setupReady: { ...gamestate.setupReady, [action.player]: true },
    }
  }
  return runAction(gamestate, action)
}

// Both ready — 6 prizes each from the top of the deck
function setPrizes(gamestate: GameState): GameState {
  for (const player of PLAYERS) {
    for (let i = 0; i < PRIZE_COUNT; i++) {
      const card = gamestate.players[player].deck[0]
      if (!card) break
      gamestate = placePrize(gamestate, player, card)
    }
  }
  return gamestate
}

// Turn — no action: draw; else run the expr
function turnPhase(
  gamestate: GameState,
  action: AvailableAction | null = null
): GameState {
  if (action) return runAction(gamestate, action)
  return draw(gamestate, gamestate.activePlayer, 1)
}

// Enter Turn and take the opening draw
function enterTurn(
  gamestate: GameState,
  activePlayer: 1 | 2,
  turnCount: number
): GameState {
  return turnPhase({ ...gamestate, phase: Phase.Turn, activePlayer, turnCount })
}

// Enter Checkup from the end of a turn
function enterCheckup(gamestate: GameState): GameState {
  return checkupPhase({ ...gamestate, phase: Phase.Checkup })
}

// Checkup — win/lose only; statuses and KO resolution later
function checkupPhase(gamestate: GameState): GameState {
  for (const player of PLAYERS) {
    if (gamestate.players[player].prize.length === 0) return endGame(gamestate)
    if (!hasPokemonInPlay(gamestate, player)) return endGame(gamestate)
  }
  return enterTurn(
    gamestate,
    opponent(gamestate.activePlayer),
    gamestate.turnCount + 1
  )
}

function endGame(gamestate: GameState): GameState {
  return { ...gamestate, phase: Phase.Ended }
}

function bothReady(gamestate: GameState): boolean {
  return gamestate.setupReady[1] && gamestate.setupReady[2]
}

function hasPokemonInPlay(gamestate: GameState, player: 1 | 2): boolean {
  const p = gamestate.players[player]
  return p.active.evolution.length > 0 || p.bench.some((seat) => seat.evolution.length > 0)
}

function opponent(player: 1 | 2): 1 | 2 {
  return player === 1 ? 2 : 1
}

// Run an action's expr through interpret
function runAction(gamestate: GameState, action: AvailableAction): GameState {
  const ctx = { bindings: { ...(action.seed ?? {}) } }
  for (const step of action.expr) {
    gamestate = interpret(gamestate, step, ctx)
  }
  return gamestate
}
