import {
  bothReady,
  getSlot,
  hasActive,
  hasPokemonInPlay,
  isKnockedOut,
  occupiedBench,
  opponent,
} from "./board.js"
import { type AvailableAction } from "./compute.js"
import { Action, Op, type ActionFrame, type Expr, type Primitive } from "./dsl.js"
import { discardSlot, draw, placePrize, promote, takePrize } from "./helpers.js"
import { tickModifiersEnd, tickModifiersEnter } from "./modifiers.js"
import { interpret, resolveSlot, type InterpretCtx } from "./interpret.js"
import { copy } from "./ops.js"
import type { GameState, SlotId, SlotRef, ZoneRef } from "./types.js"
import { Phase } from "./types.js"

const PRIZE_COUNT = 6
const PRIZES_ON_KO = 1
const PLAYERS = [1, 2] as const

// Apply one client-chosen action (or null when the phase runs with no input).
export function stateMachine(
  gamestate: GameState,
  action: AvailableAction | null
): GameState {
  // If action stack has any length, this was a paused state for selection
  if (gamestate.actionStack.length > 0) {
    if (action?.kind === Action.Choose) return resumeSelect(gamestate, action)
    return gamestate
  }
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
      return onComplete(gamestate, action.kind)
    case Action.Attack:
      return runAction(gamestate, action)
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
    case Action.Evolve:
      return markEvolvedThisTurn(runAction(gamestate, action), action.slot)
    case Action.Ability:
      return runAction(gamestate, action)
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

// Checkup — KO every slot, then win/lose; statuses later
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

// KO — discard that slot; opponent takes the default prize count
function resolveKnockouts(gamestate: GameState): GameState {
  for (const player of PLAYERS) {
    const refs: SlotId[] = [
      { player, slot: "active" },
      ...occupiedBench(gamestate, player).map((index) => ({
        player,
        slot: "bench" as const,
        index,
      })),
    ]
    for (const ref of refs) {
      if (!isKnockedOut(gamestate, getSlot(gamestate, ref))) continue
      gamestate = discardSlot(gamestate, ref)
      for (let i = 0; i < PRIZES_ON_KO; i++) {
        gamestate = takePrize(gamestate, opponent(player))
      }
    }
  }
  return gamestate
}

function endGame(gamestate: GameState): GameState {
  return { ...gamestate, phase: Phase.Ended }
}

function resumeSelect(
  gamestate: GameState,
  action: Extract<AvailableAction, { kind: Action.Choose }>
): GameState {
  const frame = gamestate.actionStack.at(-1)
  if (!frame) return gamestate
  const ctx: InterpretCtx = {
    bindings: { ...frame.bindings, [frame.bind]: chooseBinding(action) },
  }
  gamestate = { ...gamestate, actionStack: gamestate.actionStack.slice(0, -1) }
  return onComplete(runExpr(gamestate, frame.remaining, ctx, frame.player, frame.kind), frame.kind)
}

function chooseBinding(
  action: Extract<AvailableAction, { kind: Action.Choose }>
): SlotId {
  return action.slot
}

// Run an action's expr; Select pushes a frame and stops
function runAction(gamestate: GameState, action: AvailableAction): GameState {
  const ctx: InterpretCtx = { bindings: { ...(action.seed ?? {}) } }
  return onComplete(runExpr(gamestate, action.expr, ctx, action.player, action.kind), action.kind)
}

function runExpr(
  gamestate: GameState,
  expr: Expr,
  ctx: InterpretCtx,
  player: 1 | 2,
  kind: Action
): GameState {
  for (let i = 0; i < expr.length; i++) {
    const step = expr[i]
    if (step.op === Op.Select) {
      return {
        ...gamestate,
        actionStack: [
          ...gamestate.actionStack,
          pauseSelect(step, ctx, player, kind, expr.slice(i + 1)),
        ],
      }
    }
    gamestate = interpret(gamestate, step, ctx)
  }
  return gamestate
}

function pauseSelect(
  step: Extract<Primitive, { op: Op.Select }>,
  ctx: InterpretCtx,
  player: 1 | 2,
  kind: Action,
  remaining: Expr
): ActionFrame {
  const base = {
    remaining,
    bindings: ctx.bindings,
    player,
    bind: step.bind,
    filter: step.filter,
    kind,
  }
  switch (step.pick) {
    case "slots":
      return { ...base, pick: "slots", who: step.who }
    case "cards": {
      const source: ZoneRef | SlotRef =
        typeof step.source === "string" ? ctx.bindings[step.source] as ZoneRef | SlotRef : step.source
      return { ...base, pick: "cards", source }
    }
    case "attacks":
      return { ...base, pick: "attacks", slot: resolveSlot(step.slot, ctx) }
  }
}

// Action finished — paused Select is not done; Attack / EndTurn then Checkup
function onComplete(gamestate: GameState, kind: Action): GameState {
  if (gamestate.actionStack.length > 0) return gamestate
  if (kind === Action.Attack || kind === Action.EndTurn) return enterCheckup(gamestate)
  return gamestate
}

function markEvolvedThisTurn(gamestate: GameState, slotId: SlotId): GameState {
  const next = copy(gamestate)
  getSlot(next, slotId).evolvedThisTurn = true
  return next
}

function clearEvolvedThisTurn(gamestate: GameState, player: 1 | 2): GameState {
  const next = copy(gamestate)
  next.players[player].active.evolvedThisTurn = false
  for (const slot of next.players[player].bench) slot.evolvedThisTurn = false
  return next
}
