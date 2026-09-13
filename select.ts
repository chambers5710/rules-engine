import { pokemonInPlay, opponent, getSlot, currentForm } from "./board.js"
import { Action, Op, type ActionFrame, type CardFilter, type Expr, type Primitive } from "./dsl.js"
import { interpret, resolveSlot, slotMatches, surveySlots, type InterpretCtx } from "./interpret.js"
import { cardMatches, cardsAt } from "./survey.js"
import { EnergyTypes, type Attachment, type GameState, type SlotId, type SlotRef, type ZoneRef } from "./types.js"

type SelectChoice =
  | { kind: Action.Choose; player: 1 | 2; pick: "slots"; slot: SlotId; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "cards"; card: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "attacks"; name: string; expr: [] }
  | { kind: Action.Choose; player: 1 | 2; pick: "types"; name: string; expr: [] }
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
        chooser: step.chooser === "opponent" ? opponent(player) : player,
        filter: step.filter,
      }
    case "cards": {
      const raw = typeof step.source === "string" ? ctx.bindings[step.source] : step.source
      const source = cardSource(raw, step.attachment)
      if (!source) return undefined
      return { ...base, pick: "cards", source, filter: step.filter }
    }
    case "attacks": {
      const slot = resolveSlot(step.slot, ctx)
      if (!slot) return undefined
      return { ...base, pick: "attacks", slot }
    }
    case "types":
      return { ...base, pick: "types", except: step.except ?? [] }
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
      return selectTypes(frame)
  }
}

function selectSlots(
  gamestate: GameState,
  frame: Extract<ActionFrame, { pick: "slots" }>
): SelectChoice[] {
  const player = frame.who === "self" ? frame.player : opponent(frame.player)
  const filters = [frame.filter ?? []].flat()
  const actions: SelectChoice[] = []
  for (const slotId of pokemonInPlay(gamestate, player)) {
    if (!slotMatches(gamestate, slotId, filters, frame.ctx.bindings)) continue
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
      if (bindings[filter.bind] === card) return false
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
  const values = cards.map((card) => gamestate.cardRegistry[card]?.energyValue ?? 0)
  const actions: SelectChoice[] = []
  for (let i = 0; i < cards.length; i++) {
    const value = values[i]
    if (typeof need === "number") {
      if (value <= 0 || value > need) continue
      const rest = values.filter((_, j) => j !== i)
      if (!canSum(rest, need - value)) continue
    }
    actions.push({ kind: Action.Choose, player: frame.player, pick: "cards", card: cards[i], expr: [] })
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

function selectTypes(frame: Extract<ActionFrame, { pick: "types" }>): SelectChoice[] {
  const skip = new Set(frame.except)
  const actions: SelectChoice[] = EnergyTypes.filter((type) => !skip.has(type)).map((type) => ({
    kind: Action.Choose,
    player: frame.player,
    pick: "types" as const,
    name: type,
    expr: [] as const,
  }))
  if (frame.optional) actions.push({ kind: Action.Choose, player: frame.player, pick: "skip", expr: [] })
  return actions
}

function canSum(values: number[], target: number): boolean {
  if (target === 0) return true
  const ok = new Set([0])
  for (const value of values) {
    for (const sum of [...ok]) {
      if (sum + value === target) return true
      if (sum + value < target) ok.add(sum + value)
    }
  }
  return ok.has(target)
}

function chooseBinding(action: SelectChoice): SlotId | string {
  if (action.pick === "skip") return ""
  if (action.pick === "cards") return action.card
  if (action.pick === "attacks" || action.pick === "types") return action.name
  return action.slot
}

function isMove(step: Primitive): boolean {
  return (
    step.op === Op.MoveZoneToZone ||
    step.op === Op.MoveZoneToSlot ||
    step.op === Op.MoveSlotToZone ||
    step.op === Op.MoveSlotToSlot
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
    if (isMove(step)) {
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

