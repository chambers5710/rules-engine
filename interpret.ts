import { Op, type BindingName, type CalcFn, type Primitive, type SlotTarget } from "./dsl.js"
import { applyModifier, readModifier } from "./modifiers.js"
import {
  applyDamage,
  applyStatus,
  flipCoin,
  moveSlotToSlot,
  moveSlotToZone,
  moveZoneToSlot,
  moveZoneToZone,
  removeStatus,
} from "./ops.js"
import { surveyCount, surveyEnergyValue, type SurveyFrom } from "./survey.js"
import type { Attachment, GameState, SlotId, SlotRef, ZoneRef } from "./types.js"

export type InterpretScript = {
  coins?: Array<"heads" | "tails">
}

export type InterpretCtx = {
  bindings: Record<string, unknown>
  script?: InterpretScript
}

// Attack damage pipeline — active attack_damage rewrite; weakness later
export function pipelineAttackDamage(
  gamestate: GameState,
  base: number,
  _from: SlotId,
  to: SlotId
): number {
  return readModifier(gamestate, to, "attack_damage", base)
}

function resolveSlot(target: SlotTarget, ctx: InterpretCtx): SlotId {
  if (typeof target !== "string") return target
  const bound = ctx.bindings[target]
  return bound as SlotId
}

function resolveAmount(amount: number | BindingName, ctx: InterpretCtx): number {
  if (typeof amount === "number") return amount
  return ctx.bindings[amount] as number
}

function resolveSurveyFrom(
  from: ZoneRef | SlotRef | SlotTarget,
  attachment: Attachment | undefined,
  ctx: InterpretCtx
): SurveyFrom {
  const resolved = typeof from === "string" ? resolveSlot(from, ctx) : from
  if ("zone" in resolved || "attachment" in resolved) return resolved
  return { ...resolved, attachment: attachment ?? "energy" }
}

function calcFn(fn: CalcFn, a: number, b: number): number {
  switch (fn) {
    case "add":
      return a + b
    case "sub":
      return a - b
    case "mul":
      return a * b
    case "min":
      return Math.min(a, b)
    case "max":
      return Math.max(a, b)
  }
}

export function interpret(
  gamestate: GameState,
  primitive: Primitive,
  ctx: InterpretCtx = { bindings: {} }
): GameState {
  switch (primitive.op) {
    case Op.MoveZoneToZone:
      return moveZoneToZone(gamestate, primitive.card, primitive.from, primitive.to)

    case Op.MoveZoneToSlot:
      return moveZoneToSlot(gamestate, primitive.card, primitive.from, primitive.to)

    case Op.MoveSlotToZone:
      return moveSlotToZone(gamestate, primitive.card, primitive.from, primitive.to)

    case Op.MoveSlotToSlot:
      return moveSlotToSlot(gamestate, primitive.card, primitive.from, primitive.to)

    case Op.Attack: {
      const from = resolveSlot(primitive.from, ctx)
      const to = resolveSlot(primitive.to, ctx)
      ctx.bindings[primitive.bind] = pipelineAttackDamage(
        gamestate,
        resolveAmount(primitive.base, ctx),
        from,
        to
      )
      return gamestate
    }

    case Op.ApplyDamage:
      return applyDamage(
        gamestate,
        resolveAmount(primitive.amount, ctx),
        resolveSlot(primitive.slot, ctx)
      )

    case Op.ApplyStatus:
      return applyStatus(gamestate, primitive.status, resolveSlot(primitive.slot, ctx))

    case Op.RemoveStatus:
      return removeStatus(gamestate, primitive.status, resolveSlot(primitive.slot, ctx))

    case Op.FlipCoin: {
      const scripted = ctx.script?.coins?.shift()
      const result = scripted ?? flipCoin(1)[0]
      ctx.bindings[primitive.bind] = result
      return gamestate
    }

    case Op.ApplyModifier: {
      const slot = resolveSlot(primitive.slot, ctx)
      const player = primitive.until.who === "owner" ? slot.player : slot.player === 1 ? 2 : 1
      return applyModifier(gamestate, slot, {
        field: primitive.field,
        set: primitive.set,
        until: { beat: primitive.until.beat, player },
      })
    }

    case Op.Count: {
      const from = resolveSurveyFrom(primitive.from, primitive.attachment, ctx)
      ctx.bindings[primitive.bind] =
        primitive.as === "energy_value"
          ? surveyEnergyValue(gamestate, from, primitive.filter)
          : surveyCount(gamestate, from, primitive.filter)
      return gamestate
    }

    case Op.Calc: {
      const a = resolveAmount(primitive.a, ctx)
      const b = resolveAmount(primitive.b, ctx)
      ctx.bindings[primitive.bind] = calcFn(primitive.fn, a, b)
      return gamestate
    }

    case Op.If: {
      if (ctx.bindings[primitive.bind] !== primitive.equals) {
        return gamestate
      }
      for (const step of primitive.then) {
        gamestate = interpret(gamestate, step, ctx)
      }
      return gamestate
    }

    default:
      return gamestate
  }
}
