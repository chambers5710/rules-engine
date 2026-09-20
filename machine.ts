import {
  attackSourceId,
  bothReady,
  currentForm,
  getSlot,
  hasActive,
  hasPokemonInPlay,
  isKnockedOut,
  needsPromote,
  occupiedBench,
  opponent,
} from "./board.js"
import { type AvailableAction } from "./compute.js"
import { Action, Op, type Expr } from "./dsl.js"
import { attackExpr, stadiumUseCappedThisTurn, stadiumUses, stripCopy } from "./effects.js"
import { discardSlot, draw, placePrize, promote } from "./helpers.js"
import { babyCoinOnAnnounce, canAttack, canRetreat, mayAttachEnergy, mayEvolve, mayPlayTrainer, mayUsePokemonPower, powersSuppressed, prizeIsPublic, takesPrizeOnKo } from "./reads.js"
import { abilityBanned, attackBanned, attackFlipGated, tickModifiersEnd, tickModifiersEnter } from "./modifiers.js"
import { gatePasses, ifPasses, interpret, resolveSlot, surveySlots, type InterpretCtx } from "./interpret.js"
import { matchTriggers, tickSubscriptionsEnd, tickSubscriptionsEnter, triggerCtx, type TriggerJob } from "./triggers.js"
import { copy } from "./ops.js"
import { selectChoices, selectFrame } from "./select.js"
import type { GameState, SlotId } from "./types.js"
import { DAMAGE_COUNTER, Phase } from "./types.js"

const PRIZE_COUNT = 6
const PRIZES_ON_KO = 1
const POISON_COUNTERS = 1
const BURN_COUNTERS = 2
const EXPR_STEP_BUDGET = 256
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
      if (action?.kind === Action.Promote) {
        return afterKnockouts(promote(gamestate, action.player, action.index))
      }
      return gamestate
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
    case Action.Attack: {
      const active = getSlot(gamestate, { player: action.player, slot: "active" })
      const target = currentForm(
        gamestate,
        getSlot(gamestate, { player: opponent(action.player), slot: "active" })
      )?.instanceId
      if (!canAttack(active, target)) return gamestate
      if (attackBanned(active, action.name)) return gamestate
      if (!gatePasses(gamestate, action.expr, action.seed)) return gamestate
      return gatedAttack(gamestate, action)
    }
    case Action.Promote:
      return promote(gamestate, action.player, action.index)
    case Action.AttachEnergy:
      if (!mayAttachEnergy(gamestate, action.slot, action.card)) return gamestate
      return { ...runAction(gamestate, action), energyAttachedThisTurn: true }
    case Action.PlayBench:
      return markEvolvedThisTurn(
        runAction(gamestate, action),
        { player: action.player, slot: "bench", index: action.index }
      )
    case Action.Evolve: {
      const seat = getSlot(gamestate, action.slot)
      if (!mayEvolve(gamestate, action.player, seat)) return gamestate
      return markEvolvedThisTurn(runAction(gamestate, action), action.slot)
    }
    case Action.Ability: {
      const seat = getSlot(gamestate, action.slot)
      if (!mayUsePokemonPower(seat) || powersSuppressed(gamestate)) return gamestate
      if (abilityBanned(seat, action.name)) return gamestate
      if (!gatePasses(gamestate, action.expr, action.seed)) return gamestate
      return runAction(gamestate, action)
    }
    case Action.PlayTrainer:
    case Action.PlayStadium:
      if (!mayPlayTrainer(gamestate, action.player)) return gamestate
      return runAction(gamestate, action)
    case Action.UseStadium: {
      if (!gamestate.stadium || gamestate.stadium.card !== action.card) return gamestate
      const uses = stadiumUses(
        gamestate.effectRegistry,
        gamestate.cardRegistry[action.card]?.sourceId ?? ""
      )
      const row = uses.find((use) => use.name === action.name)
      if (!row) return gamestate
      if (stadiumUseCappedThisTurn(row.limit) && gamestate.stadiumUsedThisTurn) return gamestate
      const next = runAction(gamestate, action)
      return stadiumUseCappedThisTurn(row.limit) ? { ...next, stadiumUsedThisTurn: true } : next
    }
    case Action.Retreat:
      if (!canRetreat(gamestate, getSlot(gamestate, { player: action.player, slot: "active" }))) {
        return gamestate
      }
      return { ...runAction(gamestate, action), retreatedThisTurn: true }
    default:
      return runAction(gamestate, action)
  }
}

// Baby coin (defending Active), then Confused, then Sand-attack-style flip.
// Baby / flip-gate tails: no expr. Confused tails: 3 counters, no expr.
export function gatedAttack(
  gamestate: GameState,
  action: Extract<AvailableAction, { kind: Action.Attack }>,
  ctx: InterpretCtx = { bindings: {} }
): GameState {
  if (babyCoinOnAnnounce(gamestate, action.player)) {
    gamestate = interpret(gamestate, { op: Op.FlipCoin, bind: "$announce" }, ctx)
    if (ctx.bindings.$announce !== "heads") return onComplete(gamestate, action.kind)
  }
  const slot = { player: action.player, slot: "active" } as const
  if (getSlot(gamestate, slot).status.confused) {
    const ctx: InterpretCtx = { bindings: {} }
    gamestate = interpret(gamestate, { op: Op.FlipCoin, bind: "$coin", check: "confused" }, ctx)
    if (ctx.bindings.$coin !== "heads") {
      gamestate = interpret(gamestate, {
        op: Op.ApplyDamage,
        amount: 3 * DAMAGE_COUNTER,
        slot,
      }, ctx)
      return onComplete(gamestate, action.kind)
    }
  }
  if (attackFlipGated(getSlot(gamestate, slot))) {
    const ctx: InterpretCtx = { bindings: {} }
    gamestate = interpret(gamestate, { op: Op.FlipCoin, bind: "$coin" }, ctx)
    if (ctx.bindings.$coin !== "heads") return onComplete(gamestate, action.kind)
  }
  return runAction(gamestate, action)
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
    retreatedThisTurn: false,
    stadiumUsedThisTurn: false,
  }
  gamestate = clearEvolvedThisTurn(gamestate, activePlayer)
  gamestate = tickModifiersEnter(gamestate, activePlayer)
  gamestate = tickSubscriptionsEnter(gamestate, activePlayer)
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
  gamestate = tickSubscriptionsEnd(gamestate, gamestate.activePlayer)
  return checkupPhase({ ...gamestate, phase: Phase.Checkup })
}

// Checkup — status in order (poison, burn, asleep, paralyzed), then KO, then win/lose
function checkupPhase(gamestate: GameState): GameState {
  for (const player of PLAYERS) gamestate = checkupPoison(gamestate, player)
  for (const player of PLAYERS) gamestate = checkupBurn(gamestate, player)
  for (const player of PLAYERS) gamestate = checkupAsleep(gamestate, player)
  gamestate = checkupParalyzed(gamestate, gamestate.activePlayer)

  gamestate = resolveKnockouts(gamestate)
  if (gamestate.actionStack.length > 0) return gamestate
  return afterKnockouts(gamestate)
}

// After KO: win, then fill empty Actives before the next player's turn starts
function afterKnockouts(gamestate: GameState): GameState {
  for (const player of PLAYERS) {
    if (gamestate.players[player].prize.length === 0) return endGame(gamestate)
    if (!hasPokemonInPlay(gamestate, player)) return endGame(gamestate)
  }
  if (needsPromote(gamestate, 1) || needsPromote(gamestate, 2)) {
    return { ...gamestate, phase: Phase.Checkup }
  }
  return enterTurn(
    gamestate,
    opponent(gamestate.activePlayer),
    gamestate.turnCount + 1
  )
}

function checkupSlot(gamestate: GameState, player: 1 | 2) {
  const slot = { player, slot: "active" } as const
  const pokemon = getSlot(gamestate, slot)
  if (isKnockedOut(gamestate, pokemon)) return null
  return { slot, pokemon }
}

function checkupPoison(gamestate: GameState, player: 1 | 2): GameState {
  const seat = checkupSlot(gamestate, player)
  if (!seat || !seat.pokemon.status.poison) return gamestate
  const counters = seat.pokemon.poisonCounters ?? POISON_COUNTERS
  return interpret(gamestate, {
    op: Op.ApplyDamage,
    amount: counters * DAMAGE_COUNTER,
    slot: seat.slot,
    source: "poison",
  })
}

function checkupBurn(gamestate: GameState, player: 1 | 2): GameState {
  const seat = checkupSlot(gamestate, player)
  if (!seat || !seat.pokemon.status.burn) return gamestate
  gamestate = interpret(gamestate, {
    op: Op.ApplyDamage,
    amount: BURN_COUNTERS * DAMAGE_COUNTER,
    slot: seat.slot,
    source: "burn",
  })
  const ctx: InterpretCtx = { bindings: {} }
  gamestate = interpret(gamestate, { op: Op.FlipCoin, bind: "$coin", check: "burn" }, ctx)
  if (ctx.bindings.$coin !== "heads") return gamestate
  return interpret(gamestate, { op: Op.RemoveStatus, status: "burn", slot: seat.slot })
}

function checkupAsleep(gamestate: GameState, player: 1 | 2): GameState {
  const seat = checkupSlot(gamestate, player)
  if (!seat || !seat.pokemon.status.asleep) return gamestate
  const ctx: InterpretCtx = { bindings: {} }
  gamestate = interpret(gamestate, { op: Op.FlipCoin, bind: "$coin", check: "asleep" }, ctx)
  if (ctx.bindings.$coin !== "heads") return gamestate
  return interpret(gamestate, { op: Op.RemoveStatus, status: "asleep", slot: seat.slot })
}

function checkupParalyzed(gamestate: GameState, player: 1 | 2): GameState {
  if (player !== gamestate.activePlayer) return gamestate
  const seat = checkupSlot(gamestate, player)
  if (!seat || !seat.pokemon.status.paralyzed) return gamestate
  return interpret(gamestate, { op: Op.RemoveStatus, status: "paralyzed", slot: seat.slot })
}

// KO — discard that slot; opponent picks a prize into hand (face-down unless prizes are public)
function resolveKnockouts(gamestate: GameState): GameState {
  const owed: Record<1 | 2, number> = { 1: 0, 2: 0 }
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
      const seat = getSlot(gamestate, ref)
      if (!isKnockedOut(gamestate, seat)) continue
      const form = currentForm(gamestate, seat)
      gamestate = discardSlot(gamestate, ref)
      if (!takesPrizeOnKo(form)) continue
      owed[opponent(player)] += PRIZES_ON_KO
    }
  }
  const faceUp = prizeIsPublic(gamestate)
  const acting: 1 | 2 = owed[1] > 0 ? 1 : 2
  const steps: Expr = []
  for (const player of PLAYERS) {
    for (let i = 0; i < owed[player]; i++) {
      steps.push(...prizeTakeSteps(player, acting, faceUp))
    }
  }
  if (steps.length === 0) return gamestate
  return runExpr(gamestate, steps, { bindings: {} }, acting, Action.Choose)
}

function prizeTakeSteps(taker: 1 | 2, acting: 1 | 2, faceUp: boolean): Expr {
  const prize = { player: taker, zone: "prize" as const }
  const hand = { player: taker, zone: "hand" as const }
  return [
    {
      op: Op.Select,
      pick: "cards",
      source: prize,
      bind: "$take",
      chooser: taker === acting ? "self" : "opponent",
      ...(faceUp ? {} : { hidden: true as const }),
    },
    {
      op: Op.MoveZoneToZone,
      card: "$take",
      source: prize,
      dest: hand,
      position: "bottom",
    },
  ]
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
  const leftover = frame.pendingTriggers ?? []
  const ctx: InterpretCtx = {
    ...frame.ctx,
    bindings: { ...frame.ctx.bindings, [frame.bind]: chooseBinding(action) },
  }
  gamestate = { ...gamestate, actionStack: gamestate.actionStack.slice(0, -1) }
  const budget = { left: EXPR_STEP_BUDGET }
  gamestate = runExpr(gamestate, frame.remaining, ctx, frame.player, frame.kind, budget)
  if (gamestate.actionStack.length > 0) return stashLeftover(gamestate, leftover)
  gamestate = runTriggerJobs(gamestate, leftover, frame.kind, budget)
  return onComplete(gamestate, frame.kind, ctx)
}

function chooseBinding(
  action: Extract<AvailableAction, { kind: Action.Choose }>
): SlotId | string {
  if (action.pick === "skip") return ""
  if (action.pick === "cards") return action.card
  if (action.pick === "attacks" || action.pick === "types" || action.pick === "names") return action.name
  return action.slot
}

// Run an action's expr; Select pushes a frame and stops
function runAction(gamestate: GameState, action: AvailableAction): GameState {
  const named = "name" in action ? action.name : undefined
  const ctx: InterpretCtx = {
    bindings: { ...(action.seed ?? {}) },
    ...(named ? { attack: named } : {}),
    ...(action.kind === Action.Attack ? { via: "attack" as const } : {}),
  }
  return onComplete(runExpr(gamestate, action.expr, ctx, action.player, action.kind), action.kind, ctx)
}

export function runExpr(
  gamestate: GameState,
  expr: Expr,
  ctx: InterpretCtx,
  player: 1 | 2,
  kind: Action,
  budget: { left: number } = { left: EXPR_STEP_BUDGET }
): GameState {
  for (let i = 0; i < expr.length; i++) {
    if (budget.left <= 0) return gamestate
    budget.left -= 1
    const step = expr[i]
    if (step.op === Op.Select) {
      const frame = selectFrame(step, ctx, player, kind, expr.slice(i + 1), gamestate)
      const choices = frame ? selectChoices(gamestate, frame) : []
      if (!frame || (choices.length === 0 && !step.optional)) continue
      return {
        ...gamestate,
        actionStack: [...gamestate.actionStack, frame],
      }
    }
    if (step.op === Op.If) {
      if (!ifPasses(gamestate, step, ctx)) continue
      return runExpr(gamestate, [...step.then, ...expr.slice(i + 1)], ctx, player, kind, budget)
    }
    if (step.op === Op.Loop) {
      const until = typeof step.until === "number" ? step.until : ctx.bindings[step.until]
      if (ctx.bindings[step.bind] === until) continue
      return runExpr(gamestate, [...step.then, step, ...expr.slice(i + 1)], ctx, player, kind, budget)
    }
    if (step.op === Op.Each) {
      const self = resolveSlot("$self_slot", ctx)
      if (!self) continue
      const paused = gamestate.actionStack.length
      for (const seat of surveySlots(
        gamestate,
        self.player,
        step.who,
        step.among,
        [step.filter ?? []].flat(),
        ctx.bindings
      )) {
        ctx.bindings[step.bind] = seat
        gamestate = runExpr(gamestate, step.then, ctx, player, kind, budget)
        if (gamestate.actionStack.length > paused) return gamestate
      }
      continue
    }
    if (step.op === Op.RunEffect) {
      const slot = resolveSlot(step.slot, ctx)
      const copied = slot
        ? stripCopy(
            copiedAttackExpr(gamestate, slot, String(ctx.bindings[step.attack] ?? "")),
            step.strip ?? []
          )
        : []
      return runExpr(gamestate, [...copied, ...expr.slice(i + 1)], ctx, player, kind, budget)
    }
    gamestate = interpret(gamestate, step, ctx)
    gamestate = drainEvents(gamestate, ctx, kind, budget)
    if (gamestate.actionStack.length > 0) return gamestate
  }
  return gamestate
}

function drainEvents(
  gamestate: GameState,
  ctx: InterpretCtx,
  kind: Action,
  budget: { left: number }
): GameState {
  const events = ctx.events ?? []
  ctx.events = []
  const jobs: TriggerJob[] = []
  for (const event of events) {
    jobs.push(...matchTriggers(gamestate, event))
  }
  return runTriggerJobs(gamestate, jobs, kind, budget)
}

function runTriggerJobs(
  gamestate: GameState,
  jobs: TriggerJob[],
  kind: Action,
  budget: { left: number }
): GameState {
  const paused = gamestate.actionStack.length
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    gamestate = runExpr(gamestate, job.then, triggerCtx(job), job.seat.player, kind, budget)
    if (gamestate.actionStack.length > paused) return stashLeftover(gamestate, jobs.slice(i + 1))
    if (job.drop) {
      gamestate = {
        ...gamestate,
        subscriptions: gamestate.subscriptions.filter((sub) => sub.id !== job.drop),
      }
    }
  }
  return gamestate
}

function stashLeftover(gamestate: GameState, leftover: TriggerJob[]): GameState {
  if (leftover.length === 0) return gamestate
  const top = gamestate.actionStack.at(-1)
  if (!top) return gamestate
  return {
    ...gamestate,
    actionStack: [
      ...gamestate.actionStack.slice(0, -1),
      { ...top, pendingTriggers: leftover.concat(top.pendingTriggers ?? []) },
    ],
  }
}

/** Seat + name → that attack’s expr as written. `run_effect` `strip` rewrites. */
export function copiedAttackExpr(gamestate: GameState, slot: SlotId, name: string): Expr {
  const form = currentForm(gamestate, getSlot(gamestate, slot))
  const attack = form?.attacks?.find((row) => row.name === name)
  if (!form || !attack) return []
  return attackExpr(gamestate.effectRegistry, attackSourceId(gamestate, slot.player) ?? form.sourceId, attack)
}

// Action finished — paused Select is not done; Attack / EndTurn then Checkup
function onComplete(gamestate: GameState, kind: Action, ctx?: InterpretCtx): GameState {
  if (gamestate.actionStack.length > 0) return gamestate
  if (kind === Action.Attack || kind === Action.EndTurn || ctx?.endTurn) return enterCheckup(gamestate)
  if (gamestate.phase === Phase.Checkup) return afterKnockouts(gamestate)
  return gamestate
}

function markEvolvedThisTurn(gamestate: GameState, slotId: SlotId): GameState {
  const next = copy(gamestate, slotId.player)
  getSlot(next, slotId).evolvedThisTurn = true
  return next
}

function clearEvolvedThisTurn(gamestate: GameState, player: 1 | 2): GameState {
  const next = copy(gamestate, player)
  next.players[player].active.evolvedThisTurn = false
  for (const slot of next.players[player].bench) slot.evolvedThisTurn = false
  return next
}
