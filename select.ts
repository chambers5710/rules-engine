import { opponent, getSlot, currentForm } from "./board.js"
import { Action, Op, type ActionFrame, type CardFilter, type Expr, type Primitive } from "./dsl.js"
import { ifPasses, interpret, resolveSlot, surveySlots, useGate, type InterpretCtx } from "./interpret.js"
import { foldedCard } from "./card.js"
import { cardMatches, cardsAt } from "./survey.js"
import { legalEnergyTypes } from "./reads.js"
import type { Attachment, GameState, SlotId, SlotRef, ZoneRef } from "./types.js"

type SelectChoice =
  | { kind: Action.Choose; player: 1 | 2; pick: "slots"; slot: SlotId; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "cards"; card: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "attacks"; name: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "types"; name: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "names"; name: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "skip"; expr: [] }

function isZoneRef(value: unknown): value is ZoneRef {
  return typeof value === "object" && value !== null && "zone" in value && "player" in value
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === "object" && value !== null && "player" in value && "slot" in value
}

function isSlotRef(value: unknown): value is SlotRef {
  return isSlotId(value) && "attachment" in value
}

function cardSource(raw: unknown, attachment?: Attachment): ZoneRef | SlotRef | undefined {
  if (attachment) {
    if (!isSlotId(raw)) return undefined
    return { ...raw, attachment }
  }
  if (isZoneRef(raw) || isSlotRef(raw)) return raw
  return undefined
}

export function selectFrame(
  step: Extract<Primitive, { op: Op.Select }>,
  ctx: InterpretCtx,
  player: 1 | 2,
  kind: Action,
  remaining: Expr
): ActionFrame | undefined {
  const base = {
    remaining,
    ctx: { ...ctx, bindings: { ...ctx.bindings } },
    player,
    bind: step.bind,
    optional: step.optional,
    kind,
  }
  switch (step.pick) {
    case "slots":
      return {
        ...base,
        pick: "slots",
        who: step.who,
        among: step.among ?? "in_play",
        chooser: step.chooser === "opponent" ? opponent(player) : player,
        filter: step.filter,
      }
    case "cards": {
      const raw = typeof step.source === "string" ? ctx.bindings[step.source] : step.source
      const source = cardSource(raw, step.attachment)
      if (!source) return undefined
      return { ...base, pick: "cards", source, filter: step.filter, hidden: step.hidden }
    }
    case "attacks": {
      const slot = resolveSlot(step.slot, ctx)
      if (!slot) return undefined
      return { ...base, pick: "attacks", slot }
    }
    case "types":
      return { ...base, pick: "types", except: step.except ?? [] }
    case "names":
      return {
        ...base,
        pick: "names",
        names: step.names,
        chooser: step.chooser === "opponent" ? opponent(player) : player,
      }
  }
}

export function selectChoices(gamestate: GameState, frame: ActionFrame): SelectChoice[] {
  switch (frame.pick) {
    case "slots":
      return selectSlots(gamestate, frame)
    case "cards":
      return selectCards(gamestate, frame)
    case "attacks":
      return selectAttacks(gamestate, frame)
    case "types":
      return selectTypes(gamestate, frame)
    case "names":
      return selectNames(gamestate, frame)
  }
}

function selectSlots(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "slots" }>
): SelectChoice[] {
  const filters = [frame.filter ?? []].flat()
  const actions: SelectChoice[] = []
  for (const slotId of surveySlots(
    gamestate,
    frame.player,
    frame.who,
    frame.among,
    filters,
    frame.ctx.bindings
  )) {
    actions.push({ kind: Action.Choose, player: frame.chooser, pick: "slots", slot: slotId, expr: [] })
  }
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.chooser, pick: "skip", expr: [] })
  return actions
}

function cardPasses(
  gamestate: GameState,
  card: string,
  filters: CardFilter[],
  source: Extract<ActionFrame, { pick: "cards" }>["source"],
  bindings: Record<string, unknown>
): boolean {
  for (const filter of filters) {
    if (filter.kind === "pays") continue
    if (filter.kind === "other_than") {
      const bound = bindings[filter.bind]
      if (Array.isArray(bound) ? bound.includes(card) : bound === card) return false
      continue
    }
    if (filter.kind === "among") {
      const bound = bindings[filter.bind]
      if (Array.isArray(bound) ? !bound.includes(card) : bound !== card) return false
      continue
    }
    if (!cardMatches(gamestate, card, filter, source)) return false
  }
  return true
}

function selectCards(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "cards" }>
): SelectChoice[] {
  const filters = [frame.filter ?? []].flat()
  const pays = filters.find((filter) => filter.kind === "pays")
  const need = pays ? frame.ctx.bindings[pays.bind] : undefined
  const cards = cardsAt(gamestate, frame.source).filter((card) =>
    cardPasses(gamestate, card, filters, frame.source, frame.ctx.bindings)
  )
  const values = cards.map((card) => foldedCard(gamestate, card)?.energyValue ?? 0)
  const actions: SelectChoice[] = []
  for (let i = 0; i < cards.length; i++) {
    const value = values[i]
    if (typeof need === "number") {
      if (value <= 0) continue
      const rest = values.filter((_, j) => j !== i)
      if (!canCover(rest, need - value)) continue
    }
    actions.push({
      kind: Action.Choose,
      player: frame.player,
      pick: "cards",
      card: cards[i],
      ...(frame.hidden ? { hidden: true as const, face: `Prize ${i + 1}` } : {}),
      expr: [],
    })
  }
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.player, pick: "skip", expr: [] })
  return actions
}

function selectAttacks(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "attacks" }>
): SelectChoice[] {
  const form = currentForm(gamestate, getSlot(gamestate, frame.slot))
  const actions: SelectChoice[] = (form?.attacks ?? []).map((attack) => ({
    kind: Action.Choose,
    player: frame.player,
    pick: "attacks" as const,
    name: attack.name,
    expr: [] as const,
  }))
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.player, pick: "skip", expr: [] })
  return actions
}

function selectNames(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "names" }>
): SelectChoice[] {
  const actions: SelectChoice[] = []
  for (const option of frame.names) {
    if (option.zone) {
      const bound = frame.ctx.bindings[option.zone]
      if (!isZoneRef(bound) || cardsAt(gamestate, bound).length === 0) continue
    }
    actions.push({
      kind: Action.Choose,
      player: frame.chooser,
      pick: "names",
      name: option.name,
      expr: [],
    })
  }
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.chooser, pick: "skip", expr: [] })
  return actions
}

function selectTypes(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "types" }>
): SelectChoice[] {
  const skip = new Set(frame.except)
  const actions: SelectChoice[] = legalEnergyTypes(gamestate.ruleset)
    .filter((type) => !skip.has(type))
    .map((type) => ({
    kind: Action.Choose,
    player: frame.player,
    pick: "types" as const,
    name: type,
    expr: [] as const,
  }))
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.player, pick: "skip", expr: [] })
  return actions
}

function canCover(values: number[], target: number): boolean {
  if (target <= 0) return true
  return values.reduce((sum, value) => sum + value, 0) >= target
}

function chooseBinding(action: SelectChoice): SlotId | string {
  if (action.pick === "skip") return ""
  if (action.pick === "cards") return action.card
  if (action.pick === "attacks" || action.pick === "types" || action.pick === "names") return action.name
  return action.slot
}

function isMove(step: Primitive): boolean {
  return (
    step.op === Op.MoveZoneToZone ||
    step.op === Op.MoveZoneToSlot ||
    step.op === Op.MoveSlotToZone ||
    step.op === Op.MoveSlotToSlot ||
    step.op === Op.MoveZoneToStadium
  )
}

function laterRequiredSelect(expr: Expr, from: number): boolean {
  for (let i = from; i < expr.length; i++) {
    const step = expr[i]
    if (step.op === Op.Select && !step.optional) return true
  }
  return false
}

function walkPlayable(
  gamestate: GameState,
  expr: Expr,
  ctx: InterpretCtx,
  player: 1 | 2,
  kind: Action,
  index: number
): boolean {
  for (let i = index; i < expr.length; i++) {
    const step = expr[i]
    if (step.op === Op.If || step.op === Op.Loop || step.op === Op.RunEffect) {
      if (step.op === Op.If && useGate(expr) === step) {
        if (!ifPasses(gamestate, step, ctx)) return false
        return walkPlayable(gamestate, step.then, ctx, player, kind, 0)
      }
      continue
    }
    if (step.op === Op.Each) {
      if (step.filter == null) continue
      const self = resolveSlot("$self_slot", ctx)
      if (!self) return false
      const seats = surveySlots(
        gamestate,
        self.player,
        step.who,
        step.among,
        [step.filter].flat(),
        ctx.bindings
      )
      if (seats.length === 0) return false
      continue
    }
    if (step.op === Op.Select) {
      if (step.optional) continue
      const frame = selectFrame(step, ctx, player, kind, expr.slice(i + 1))
      const choices = frame ? selectChoices(gamestate, frame) : []
      const answers = choices.filter((choice) => choice.pick !== "skip")
      if (answers.length === 0) return false
      if (!laterRequiredSelect(expr, i + 1)) return true
      for (const choice of answers) {
        const next: InterpretCtx = {
          ...ctx,
          bindings: { ...ctx.bindings, [step.bind]: chooseBinding(choice) },
        }
        if (walkPlayable(gamestate, expr, next, player, kind, i + 1)) return true
      }
      return false
    }
    if (isMove(step) || step.op === Op.Count || step.op === Op.Calc) {
      gamestate = interpret(gamestate, step, ctx)
    }
  }
  return true
}

export function exprPlayable(
  gamestate: GameState,
  expr: Expr,
  seed: Record<string, unknown> | undefined,
  player: 1 | 2,
  kind: Action
): boolean {
  return walkPlayable(gamestate, expr, { bindings: { ...(seed ?? {}) } }, player, kind, 0)
}

