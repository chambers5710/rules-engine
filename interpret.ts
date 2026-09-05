import { Op, type BindingName, type Primitive, type SlotTarget } from "./dsl.js"
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
import type { GameState, SlotId } from "./types.js"

export type InterpretScript = {
  coins?: Array<"heads" | "tails">
}

export type InterpretCtx = {
  bindings: Record<string, unknown>
  script?: InterpretScript
}

// Attack damage pipeline — stub: returns base; weakness / resistance / other modifiers later
export function pipelineAttackDamage(
  _gamestate: GameState,
  base: number,
  _from: SlotId,
  _to: SlotId
): number {
  return base
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
      ctx.bindings[primitive.bind] = pipelineAttackDamage(gamestate, primitive.base, from, to)
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
