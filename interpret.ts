import { Op, type BindingName, type CalcFn, type Primitive } from "./dsl.js"
import { applyModifier, readModifier } from "./modifiers.js"
import { opponent } from "./board.js"
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
import { swapActive } from "./helpers.js"
import { surveyCount, surveyEnergyValue } from "./survey.js"
import type { GameState, SlotId, SlotRef } from "./types.js"

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
  _attacker: SlotId,
  defender: SlotId
): number {
  return readModifier(gamestate, defender, "attack_damage", base)
}

export function resolveSlot(target: SlotId | BindingName, ctx: InterpretCtx): SlotId {
  if (typeof target !== "string") return target
  return ctx.bindings[target] as SlotId
}

function resolveAmount(amount: number | BindingName, ctx: InterpretCtx): number {
  if (typeof amount === "number") return amount
  return ctx.bindings[amount] as number
}

function resolveCard(card: string, ctx: InterpretCtx): string {
  if (card.startsWith("$")) return ctx.bindings[card] as string
  return card
}

function resolveSlotRef(
  slot: SlotId | BindingName,
  attachment: SlotRef["attachment"],
  ctx: InterpretCtx
): SlotRef {
  return { ...resolveSlot(slot, ctx), attachment }
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
      return moveZoneToZone(gamestate, resolveCard(primitive.card, ctx), primitive.source, primitive.dest, primitive.position)

    case Op.MoveZoneToSlot:
      return moveZoneToSlot(gamestate, resolveCard(primitive.card, ctx), primitive.source, primitive.dest)

    case Op.MoveSlotToZone:
      return moveSlotToZone(gamestate, resolveCard(primitive.card, ctx), primitive.source, primitive.dest, primitive.position)

    case Op.MoveSlotToSlot:
      return moveSlotToSlot(gamestate, resolveCard(primitive.card, ctx), primitive.source, primitive.dest)

    case Op.Attack: {
      const attacker = resolveSlot(primitive.attacker, ctx)
      const defender = resolveSlot(primitive.defender, ctx)
      ctx.bindings[primitive.bind] = pipelineAttackDamage(
        gamestate,
        resolveAmount(primitive.base, ctx),
        attacker,
        defender
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
      const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
      return applyModifier(gamestate, slot, {
        field: primitive.field,
        set: primitive.set,
        until: { beat: primitive.until.beat, player },
      })
    }

    case Op.Count: {
      const source = resolveSlotRef(primitive.slot, primitive.attachment, ctx)
      ctx.bindings[primitive.bind] =
        primitive.as === "energy_value"
          ? surveyEnergyValue(gamestate, source, primitive.filter)
          : surveyCount(gamestate, source, primitive.filter)
      return gamestate
    }

    case Op.Calc: {
      const a = resolveAmount(primitive.a, ctx)
      const b = resolveAmount(primitive.b, ctx)
      ctx.bindings[primitive.bind] = calcFn(primitive.fn, a, b)
      return gamestate
    }

    case Op.SwapActive: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (slot.slot !== "bench") return gamestate
      return swapActive(gamestate, slot.player, slot.index)
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
