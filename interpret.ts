import { Op, type BindingName, type CalcFn, type Primitive } from "./dsl.js"
import { applyModifier, readModifier } from "./modifiers.js"
import { currentForm, getSlot, opponent } from "./board.js"
import {
  applyDamage,
  applyStatus,
  flipCoin,
  moveSlotToSlot,
  moveSlotToZone,
  moveZoneToSlot,
  moveZoneToZone,
  removeStatus,
  shuffle,
} from "./ops.js"
import { draw, swapActive } from "./helpers.js"
import { record } from "./history.js"
import { surveyCards, surveyCount, surveyEnergyValue } from "./survey.js"
import type { Attachment, DamageModifier, GameState, SlotId, SlotRef, ZoneName, ZoneRef } from "./types.js"

function isZoneRef(value: unknown): value is ZoneRef {
  return typeof value === "object" && value !== null && "zone" in value && "player" in value
}

function zoneOf(gamestate: GameState, card: string): ZoneRef | undefined {
  for (const player of [1, 2] as const) {
    for (const zone of ["hand", "deck", "discard", "prize"] as const) {
      if (gamestate.players[player][zone].includes(card)) return { player, zone }
    }
  }
}

function resolveReveal(
  gamestate: GameState,
  cards: BindingName | BindingName[],
  ctx: InterpretCtx
): { cards: string[]; from: 1 | 2; zone?: ZoneName } {
  const ids: string[] = []
  let from: 1 | 2 | undefined
  let zone: ZoneName | undefined
  for (const name of [cards].flat()) {
    const bound = ctx.bindings[name]
    if (isZoneRef(bound)) {
      from ??= bound.player
      zone ??= bound.zone
      ids.push(...surveyCards(gamestate, bound))
      continue
    }
    if (typeof bound === "string" && bound) {
      ids.push(bound)
      const at = zoneOf(gamestate, bound)
      if (at) {
        from ??= at.player
        zone ??= at.zone
        if (at.zone !== zone) zone = undefined
      }
    }
  }
  const self = ctx.bindings["$self_slot"] as SlotId | undefined
  return { cards: ids, from: from ?? self?.player ?? 1, zone }
}

export type InterpretScript = {
  coins?: Array<"heads" | "tails">
}

export type InterpretCtx = {
  bindings: Record<string, unknown>
  script?: InterpretScript
}

// Attack damage — attack_damage rewrite, then Weakness, then Resistance.
// W/R only on the Defending Pokémon (opponent's Active). Attacker types are
// the current form, not attached energy and not attack cost. Each printed
// line whose type is among those types applies; damage floors at 0.
export function pipelineAttackDamage(
  gamestate: GameState,
  base: number,
  attacker: SlotId,
  defender: SlotId
): { damage: number; weakness: boolean; resistance: boolean } {
  let damage = readModifier(gamestate, defender, "attack_damage", base)
  let weakness = false
  let resistance = false
  if (defender.player !== attacker.player && defender.slot === "active") {
    const types = currentForm(gamestate, getSlot(gamestate, attacker))?.types ?? []
    const defending = currentForm(gamestate, getSlot(gamestate, defender))
    for (const row of defending?.weaknesses ?? []) {
      if (!types.includes(row.type)) continue
      damage = applyDamageModifier(damage, row.modifier)
      weakness = true
    }
    for (const row of defending?.resistances ?? []) {
      if (!types.includes(row.type)) continue
      damage = applyDamageModifier(damage, row.modifier)
      resistance = true
    }
  }
  return { damage: Math.max(0, damage), weakness, resistance }
}

function applyDamageModifier(damage: number, modifier: DamageModifier): number {
  switch (modifier.operation) {
    case "multiply":
      return damage * modifier.value
    case "add":
      return damage + modifier.value
  }
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

function resolveZone(source: ZoneRef | BindingName, ctx: InterpretCtx): ZoneRef {
  if (typeof source !== "string") return source
  return ctx.bindings[source] as ZoneRef
}

function resolveSlotPile(
  source: SlotRef | BindingName,
  ctx: InterpretCtx,
  attachment?: Attachment
): SlotRef {
  const raw = typeof source !== "string" ? source : ctx.bindings[source]
  if (attachment) return { ...(raw as SlotId), attachment }
  return raw as SlotRef
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
      return moveZoneToZone(
        gamestate,
        resolveCard(primitive.card, ctx),
        resolveZone(primitive.source, ctx),
        resolveZone(primitive.dest, ctx),
        primitive.position
      )

    case Op.MoveZoneToSlot:
      return moveZoneToSlot(
        gamestate,
        resolveCard(primitive.card, ctx),
        resolveZone(primitive.source, ctx),
        resolveSlotRef(primitive.dest, primitive.attachment, ctx)
      )

    case Op.MoveSlotToZone:
      return moveSlotToZone(
        gamestate,
        resolveCard(primitive.card, ctx),
        resolveSlotPile(primitive.source, ctx, primitive.attachment),
        resolveZone(primitive.dest, ctx),
        primitive.position
      )

    case Op.MoveSlotToSlot:
      return moveSlotToSlot(gamestate, resolveCard(primitive.card, ctx), primitive.source, primitive.dest)

    case Op.Attack: {
      const attacker = resolveSlot(primitive.attacker, ctx)
      const defender = resolveSlot(primitive.defender, ctx)
      const hit = pipelineAttackDamage(
        gamestate,
        resolveAmount(primitive.base, ctx),
        attacker,
        defender
      )
      ctx.bindings[primitive.bind] = hit.damage
      return record(gamestate, { op: Op.Attack, attacker, defender, ...hit })
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
      return record(gamestate, { op: Op.FlipCoin, result })
    }

    case Op.ApplyModifier: {
      const slot = resolveSlot(primitive.slot, ctx)
      const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
      const until = { beat: primitive.until.beat, player }
      return record(
        applyModifier(gamestate, slot, {
          field: primitive.field,
          set: primitive.set,
          until,
        }),
        { op: Op.ApplyModifier, slot, field: primitive.field, set: primitive.set, until }
      )
    }

    case Op.Count: {
      if (primitive.kind === "damage") {
        ctx.bindings[primitive.bind] = getSlot(gamestate, resolveSlot(primitive.slot, ctx)).damage
        return gamestate
      }
      if (primitive.kind === "first") {
        const zone = resolveZone(primitive.zone, ctx)
        ctx.bindings[primitive.bind] = surveyCards(gamestate, zone, primitive.filter)[0] ?? ""
        return gamestate
      }
      if ("zone" in primitive) {
        ctx.bindings[primitive.bind] = surveyCount(
          gamestate,
          resolveZone(primitive.zone, ctx),
          primitive.filter
        )
        return gamestate
      }
      const source = resolveSlotRef(primitive.slot, primitive.attachment, ctx)
      ctx.bindings[primitive.bind] =
        primitive.kind === "energy_value"
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
      const next = swapActive(gamestate, slot.player, slot.index)
      if (next === gamestate) return gamestate
      return record(next, { op: Op.SwapActive, slot })
    }

    case Op.Draw: {
      const self = resolveSlot("$self_slot", ctx)
      const player = primitive.who === "self" ? self.player : opponent(self.player)
      return draw(gamestate, player, resolveAmount(primitive.count, ctx))
    }

    case Op.Shuffle: {
      const zone = resolveZone(primitive.zone, ctx)
      return record(shuffle(gamestate, zone.player, zone.zone), { op: Op.Shuffle, zone })
    }

    case Op.Reveal: {
      const shown = resolveReveal(gamestate, primitive.cards, ctx)
      return record(gamestate, { op: Op.Reveal, ...shown, to: primitive.to })
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
