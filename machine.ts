import { Action, type AvailableAction } from "./compute.js"
import { discardActive, draw, isKnockedOut, placePrize, promote, takePrize } from "./helpers.js"
import { interpret } from "./interpret.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

const PRIZE_COUNT = 6
const PRIZES_ON_KO = 1
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
      if (action?.kind === Action.Attack) {
        return enterCheckup(runAction(gamestate, action))
      }
      if (action?.kind === Action.Promote) {
        gamestate = promote(gamestate, action.player, action.index)
        return drawOrLose(gamestate)
      }
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

// Turn — no action: draw (empty deck loses); else run the expr
function turnPhase(
  gamestate: GameState,
  action: AvailableAction | null = null
): GameState {
  if (!action) return drawOrLose(gamestate)
  if (action.kind === Action.AttachEnergy) {
    return { ...runAction(gamestate, action), energyAttachedThisTurn: true }
  }
  return runAction(gamestate, action)
}

// Draw 1 — cannot draw, that player loses
function drawOrLose(gamestate: GameState): GameState {
  const player = gamestate.activePlayer
  if (gamestate.players[player].deck.length === 0) return endGame(gamestate)
  return draw(gamestate, player, 1)
}

// Enter Turn — draw only if Active is already filled
function enterTurn(
  gamestate: GameState,
  activePlayer: 1 | 2,
  turnCount: number
): GameState {
  gamestate = {
    ...gamestate,
    phase: Phase.Turn,
    activePlayer,
    turnCount,
    energyAttachedThisTurn: false,
  }
  if (!hasActive(gamestate, activePlayer)) return gamestate
  return turnPhase(gamestate)
}

// Enter Checkup from the end of a turn
function enterCheckup(gamestate: GameState): GameState {
  return checkupPhase({ ...gamestate, phase: Phase.Checkup })
}

// Checkup — KO Active, then win/lose; statuses later
function checkupPhase(gamestate: GameState): GameState {
  gamestate = resolveKnockouts(gamestate)
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

// KO — discard the Active; opponent takes the default prize count
function resolveKnockouts(gamestate: GameState): GameState {
  for (const player of PLAYERS) {
    if (!isKnockedOut(gamestate, gamestate.players[player].active)) continue
    gamestate = discardActive(gamestate, player)
    for (let i = 0; i < PRIZES_ON_KO; i++) {
      gamestate = takePrize(gamestate, opponent(player))
    }
  }
  return gamestate
}

function endGame(gamestate: GameState): GameState {
  return { ...gamestate, phase: Phase.Ended }
}

function bothReady(gamestate: GameState): boolean {
  return gamestate.setupReady[1] && gamestate.setupReady[2]
}

function hasActive(gamestate: GameState, player: 1 | 2): boolean {
  return gamestate.players[player].active.evolution.length > 0
}

function hasPokemonInPlay(gamestate: GameState, player: 1 | 2): boolean {
  const p = gamestate.players[player]
  return hasActive(gamestate, player) || p.bench.some((seat) => seat.evolution.length > 0)
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
