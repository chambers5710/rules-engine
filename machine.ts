import {
  bothReady,
  getSlot,
  hasActive,
  hasPokemonInPlay,
  isKnockedOut,
  opponent,
} from "./board.js"
import { Action, type AvailableAction } from "./compute.js"
import { Op } from "./dsl.js"
import { discardActive, draw, placePrize, promote, takePrize } from "./helpers.js"
import { tickModifiersEnd, tickModifiersEnter } from "./modifiers.js"
import { interpret } from "./interpret.js"
import { copy } from "./ops.js"
import type { GameState, SlotId } from "./types.js"
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
    case Phase.Init:
      return initPhase(gamestate, action)
    case Phase.Turn:
      return turnPhase(gamestate, action)
    case Phase.Checkup:
      return checkupPhase(gamestate)
    case Phase.Ended:
    default:
      return gamestate
  }
}

// Init — apply one setup action (place or Ready)
function initPhase(
  gamestate: GameState,
  action: AvailableAction | null
): GameState {
  if (!action) return gamestate
  if (action.kind === Action.Ready) {
    gamestate = {
      ...gamestate,
      setupReady: { ...gamestate.setupReady, [action.player]: true },
    }
  } else {
    gamestate = runAction(gamestate, action)
  }
  if (!bothReady(gamestate)) return gamestate
  gamestate = setPrizes(gamestate)
  return enterTurn(gamestate, gamestate.activePlayer, 1)
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
  switch (action.kind) {
    case Action.EndTurn:
      return enterCheckup(gamestate)
    case Action.Attack:
      gamestate = runAction(gamestate, action)
      if (gamestate.actionStack.length > 0) return gamestate
      return enterCheckup(gamestate)
    case Action.Promote:
      gamestate = promote(gamestate, action.player, action.index)
      return drawOrLose(gamestate)
    case Action.AttachEnergy:
      return { ...runAction(gamestate, action), energyAttachedThisTurn: true }
    case Action.PlayBench:
      return markEvolvedThisTurn(
        runAction(gamestate, action),
        { player: action.player, slot: "bench", index: action.index }
      )
    case Action.Evolve: {
      const dest: SlotId = action.to.slot === "active"
        ? { player: action.player, slot: "active" }
        : { player: action.player, slot: "bench", index: action.to.index }
      return markEvolvedThisTurn(runAction(gamestate, action), dest)
    }
    default:
      return runAction(gamestate, action)
  }
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
  gamestate = clearEvolvedThisTurn(gamestate, activePlayer)
  gamestate = tickModifiersEnter(gamestate, activePlayer)
  if (!hasActive(gamestate, activePlayer)) return gamestate
  return turnPhase(gamestate)
}

// Draw 1 — cannot draw, that player loses
function drawOrLose(gamestate: GameState): GameState {
  const player = gamestate.activePlayer
  if (gamestate.players[player].deck.length === 0) return endGame(gamestate)
  return draw(gamestate, player, 1)
}

// Enter Checkup from the end of a turn
function enterCheckup(gamestate: GameState): GameState {
  gamestate = tickModifiersEnd(gamestate, gamestate.activePlayer)
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

// Run an action's expr; Select pushes a frame and stops
function runAction(gamestate: GameState, action: AvailableAction): GameState {
  const ctx = { bindings: { ...(action.seed ?? {}) } }
  for (let i = 0; i < action.expr.length; i++) {
    const step = action.expr[i]
    if (step.op === Op.Select) {
      return {
        ...gamestate,
        actionStack: [
          ...gamestate.actionStack,
          {
            remaining: action.expr.slice(i + 1),
            bindings: ctx.bindings,
            player: action.player,
            bind: step.bind,
            from: step.from,
            pick: step.pick,
          },
        ],
      }
    }
    gamestate = interpret(gamestate, step, ctx)
  }
  return gamestate
}

function markEvolvedThisTurn(gamestate: GameState, ref: SlotId): GameState {
  const next = copy(gamestate)
  getSlot(next, ref).evolvedThisTurn = true
  return next
}

function clearEvolvedThisTurn(gamestate: GameState, player: 1 | 2): GameState {
  const next = copy(gamestate)
  next.players[player].active.evolvedThisTurn = false
  for (const slot of next.players[player].bench) slot.evolvedThisTurn = false
  return next
}
