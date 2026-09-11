import { Op, type BindingName, type CalcFn, type Primitive, type SeatAmong, type SeatWho, type SelectFilter } from "./dsl.js"
import { applyModifier, foldAdds, foldDamage, foldedMatchupType, rewriteOf, useRewriteOf } from "./modifiers.js"
import { currentForm, getSlot, occupiedBench, opponent, pokemonInPlay, sameSlot } from "./board.js"
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
import { printedAttackDamage, surveyCards, surveyCount, surveyEnergyValue } from "./survey.js"
import { DAMAGE_COUNTER, type Attachment, type DamageModifier, type EnergyType, type GameState, type SlotId, type SlotRef, type ZoneName, type ZoneRef } from "./types.js"

function isZoneRef(value: unknown): value is ZoneRef {
  return typeof value === "object" && value !== null && "zone" in value && "player" in value
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === "object" && value !== null && "player" in value && "slot" in value
}

function isSlotRef(value: unknown): value is SlotRef {
  return isSlotId(value) && "attachment" in value
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
): { damage: number; weakness: boolean; resistance: boolean; prevented: boolean } {
  let damage = base
  let weakness = false
  let resistance = false
  if (defender.player !== attacker.player && defender.slot === "active") {
    const types = currentForm(gamestate, getSlot(gamestate, attacker))?.types ?? []
    const defending = currentForm(gamestate, getSlot(gamestate, defender))
    const weakTo = foldedMatchupType(gamestate, defender, "weakness_type")
    const resistTo = foldedMatchupType(gamestate, defender, "resistance_type")
    for (const row of defending?.weaknesses ?? []) {
      if (!types.includes(weakTo ?? row.type)) continue
      damage = applyDamageModifier(damage, row.modifier)
      weakness = true
    }
    for (const row of defending?.resistances ?? []) {
      if (!types.includes(resistTo ?? row.type)) continue
      damage = applyDamageModifier(damage, row.modifier)
      resistance = true
    }
  }
  damage = foldAdds(gamestate, attacker, damage)
  const incoming = Math.max(0, damage)
  damage = foldDamage(gamestate, defender, incoming)
  return {
    damage,
    weakness,
    resistance,
    prevented: incoming > 0 && damage === 0,
  }
}

function applyDamageModifier(damage: number, modifier: DamageModifier): number {
  switch (modifier.operation) {
    case "multiply":
      return damage * modifier.value
    case "add":
      return damage + modifier.value
  }
}

export function resolveSlot(target: SlotId | BindingName, ctx: InterpretCtx): SlotId | undefined {
  if (typeof target !== "string") return isSlotId(target) ? target : undefined
  const bound = ctx.bindings[target]
  if (bound === "" || bound == null) return undefined
  return isSlotId(bound) ? bound : undefined
}

function resolveAmount(amount: number | BindingName, ctx: InterpretCtx): number {
  if (typeof amount === "number") return amount
  const bound = ctx.bindings[amount]
  return typeof bound === "number" ? bound : 0
}

function resolveCard(card: string, ctx: InterpretCtx): string {
  if (!card.startsWith("$")) return card
  const bound = ctx.bindings[card]
  return typeof bound === "string" ? bound : ""
}

function resolveZone(source: ZoneRef | BindingName, ctx: InterpretCtx): ZoneRef | undefined {
  if (typeof source !== "string") return source
  const bound = ctx.bindings[source]
  return isZoneRef(bound) ? bound : undefined
}

function resolveSlotAttachment(
  source: SlotRef | BindingName,
  ctx: InterpretCtx,
  attachment?: Attachment
): SlotRef | undefined {
  const raw = typeof source !== "string" ? source : ctx.bindings[source]
  if (attachment) {
    if (!isSlotId(raw)) return undefined
    return { ...raw, attachment }
  }
  return isSlotRef(raw) ? raw : undefined
}

function resolveSlotRef(
  slot: SlotId | BindingName,
  attachment: SlotRef["attachment"],
  ctx: InterpretCtx
): SlotRef | undefined {
  const id = resolveSlot(slot, ctx)
  if (!id) return undefined
  return { ...id, attachment }
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
    case "half_up_10":
      if (a <= 0) return 0
      return Math.ceil(a / 2 / (b || 10)) * (b || 10)
  }
}

export function slotMatches(
  gamestate: GameState,
  slotId: SlotId,
  filters: SelectFilter[],
  bindings: Record<string, unknown>
): boolean {
  const slot = getSlot(gamestate, slotId)
  for (const filter of filters) {
    switch (filter.kind) {
      case "has_counters":
        if (slot.damage < filter.counters * DAMAGE_COUNTER) return false
        break
      case "survives_counters": {
        const hp = Number(currentForm(gamestate, slot)?.hp)
        const extra = filter.counters * DAMAGE_COUNTER
        if (!Number.isFinite(hp) || slot.damage + extra >= hp) return false
        break
      }
      case "other_than": {
        const bound = bindings[filter.bind]
        if (bound && sameSlot(slotId, bound as SlotId)) return false
        break
      }
      case "has_type": {
        const types = currentForm(gamestate, slot)?.types ?? []
        if (!types.includes(filter.type)) return false
        break
      }
      case "has_energy":
        if (
          surveyCount(
            gamestate,
            { ...slotId, attachment: "energy" },
            filter.type ? { kind: "energy", type: filter.type } : undefined
          ) === 0
        ) {
          return false
        }
        break
    }
  }
  return true
}

export function surveySlots(
  gamestate: GameState,
  acting: 1 | 2,
  who: SeatWho,
  among: SeatAmong,
  filters: SelectFilter[] = [],
  bindings: Record<string, unknown> = {}
): SlotId[] {
  const players: Array<1 | 2> =
    who === "self" ? [acting] : who === "opponent" ? [opponent(acting)] : [acting, opponent(acting)]
  const seats: SlotId[] = []
  for (const player of players) {
    const ids =
      among === "bench"
        ? occupiedBench(gamestate, player).map((index) => ({ player, slot: "bench" as const, index }))
        : pokemonInPlay(gamestate, player)
    for (const id of ids) {
      if (slotMatches(gamestate, id, filters, bindings)) seats.push(id)
    }
  }
  return seats
}

export function ifPasses(
  gamestate: GameState,
  primitive: Extract<Primitive, { op: Op.If }>,
  ctx: InterpretCtx
): boolean {
  if ("status" in primitive) {
    const slot = resolveSlot(primitive.slot, ctx)
    if (!slot) return false
    return getSlot(gamestate, slot).status[primitive.status]
  }
  return ctx.bindings[primitive.bind] === primitive.equals
}

export function interpret(
  gamestate: GameState,
  primitive: Primitive,
  ctx: InterpretCtx = { bindings: {} }
): GameState {
  switch (primitive.op) {
    case Op.MoveZoneToZone: {
      const source = resolveZone(primitive.source, ctx)
      const dest = resolveZone(primitive.dest, ctx)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      return moveZoneToZone(gamestate, card, source, dest, primitive.position)
    }

    case Op.MoveZoneToSlot: {
      const source = resolveZone(primitive.source, ctx)
      const dest = resolveSlotRef(primitive.dest, primitive.attachment, ctx)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      return moveZoneToSlot(gamestate, card, source, dest)
    }

    case Op.MoveSlotToZone: {
      const source = resolveSlotAttachment(primitive.source, ctx, primitive.attachment)
      const dest = resolveZone(primitive.dest, ctx)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      return moveSlotToZone(gamestate, card, source, dest, primitive.position)
    }

    case Op.MoveSlotToSlot: {
      const source = resolveSlotAttachment(primitive.source, ctx, primitive.attachment)
      const dest = resolveSlotAttachment(primitive.dest, ctx, primitive.attachment)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      return moveSlotToSlot(gamestate, card, source, dest)
    }

    case Op.Attack: {
      const attacker = resolveSlot(primitive.attacker, ctx)
      const defender = resolveSlot(primitive.defender, ctx)
      if (!attacker || !defender) return gamestate
      const hit = pipelineAttackDamage(
        gamestate,
        resolveAmount(primitive.base, ctx),
        attacker,
        defender
      )
      ctx.bindings[primitive.bind] = hit.damage
      return record(gamestate, { op: Op.Attack, attacker, defender, ...hit })
    }

    case Op.ApplyDamage: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot) return gamestate
      return applyDamage(gamestate, resolveAmount(primitive.amount, ctx), slot, primitive.source)
    }

    case Op.ApplyStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot) return gamestate
      return applyStatus(gamestate, primitive.status, slot, primitive.counters)
    }

    case Op.RemoveStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot) return gamestate
      return removeStatus(gamestate, primitive.status, slot)
    }

    case Op.FlipCoin: {
      const scripted = ctx.script?.coins?.shift()
      const result = scripted ?? flipCoin(1)[0]
      ctx.bindings[primitive.bind] = result
      return record(gamestate, {
        op: Op.FlipCoin,
        result,
        ...(primitive.check ? { check: primitive.check } : {}),
      })
    }

    case Op.ApplyModifier: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot) return gamestate
      switch (primitive.field) {
        case "weakness_type":
        case "resistance_type": {
          const raw = primitive.set
          const set = (raw.startsWith("$") ? String(ctx.bindings[raw] ?? "") : raw) as EnergyType
          if (!set) return gamestate
          const until = { beat: "leave_play" as const }
          if (primitive.field === "weakness_type") {
            return record(
              applyModifier(gamestate, slot, { field: "weakness_type", set, until }),
              { op: Op.ApplyModifier, slot, field: "weakness_type", set, until },
            )
          }
          return record(
            applyModifier(gamestate, slot, { field: "resistance_type", set, until }),
            { op: Op.ApplyModifier, slot, field: "resistance_type", set, until },
          )
        }
        case "attack_use": {
          const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
          const until = { beat: "end_of_turn" as const, player }
          const rewrite = useRewriteOf(primitive, (name) => String(ctx.bindings[name] ?? ""))
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "attack_use", ...rewrite, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "attack_use", ...rewrite, until },
          )
        }
        case "energy_type": {
          const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
          const until = { beat: "end_of_turn" as const, player }
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "energy_type", set: primitive.set, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "energy_type", set: primitive.set, until },
          )
        }
        case "attack_damage": {
          const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
          const until = { beat: "end_of_turn" as const, player }
          const rewrite = rewriteOf(primitive)
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "attack_damage", ...rewrite, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "attack_damage", ...rewrite, until },
          )
        }
      }
    }

    case Op.Count: {
      if (primitive.kind === "damage") {
        const slot = resolveSlot(primitive.slot, ctx)
        ctx.bindings[primitive.bind] = slot ? getSlot(gamestate, slot).damage : 0
        return gamestate
      }
      if (primitive.kind === "weakness") {
        const slot = resolveSlot(primitive.slot, ctx)
        ctx.bindings[primitive.bind] = slot
          ? currentForm(gamestate, getSlot(gamestate, slot))?.weaknesses?.length ?? 0
          : 0
        return gamestate
      }
      if (primitive.kind === "hp") {
        const slot = resolveSlot(primitive.slot, ctx)
        const hp = slot ? Number(currentForm(gamestate, getSlot(gamestate, slot))?.hp) : NaN
        ctx.bindings[primitive.bind] = Number.isFinite(hp) ? hp : 0
        return gamestate
      }
      if (primitive.kind === "attack_damage") {
        const id = resolveSlot(primitive.slot, ctx)
        if (!id) {
          ctx.bindings[primitive.bind] = 0
          return gamestate
        }
        const slot = getSlot(gamestate, id)
        const name = String(ctx.bindings[primitive.attack] ?? "")
        const attack = currentForm(gamestate, slot)?.attacks?.find((row) => row.name === name)
        ctx.bindings[primitive.bind] = printedAttackDamage(attack?.damage)
        return gamestate
      }
      if (primitive.kind === "slots") {
        const self = resolveSlot("$self_slot", ctx)
        ctx.bindings[primitive.bind] = self
          ? surveySlots(
              gamestate,
              self.player,
              primitive.who,
              primitive.among,
              [primitive.filter ?? []].flat(),
              ctx.bindings
            ).length
          : 0
        return gamestate
      }
      if (primitive.kind === "first") {
        const source =
          "zone" in primitive
            ? resolveZone(primitive.zone, ctx)
            : resolveSlotRef(primitive.slot, primitive.attachment, ctx)
        ctx.bindings[primitive.bind] = source
          ? surveyCards(gamestate, source, primitive.filter)[0] ?? ""
          : ""
        return gamestate
      }
      if ("zone" in primitive) {
        const zone = resolveZone(primitive.zone, ctx)
        ctx.bindings[primitive.bind] = zone ? surveyCount(gamestate, zone, primitive.filter) : 0
        return gamestate
      }
      const source = resolveSlotRef(primitive.slot, primitive.attachment, ctx)
      ctx.bindings[primitive.bind] = source
        ? primitive.kind === "energy_value"
          ? surveyEnergyValue(gamestate, source, primitive.filter)
          : surveyCount(gamestate, source, primitive.filter)
        : 0
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
      if (!slot || slot.slot !== "bench") return gamestate
      const next = swapActive(gamestate, slot.player, slot.index)
      if (next === gamestate) return gamestate
      return record(next, { op: Op.SwapActive, slot })
    }

    case Op.Draw: {
      const self = resolveSlot("$self_slot", ctx)
      if (!self) return gamestate
      const player = primitive.who === "self" ? self.player : opponent(self.player)
      return draw(gamestate, player, resolveAmount(primitive.count, ctx))
    }

    case Op.Shuffle: {
      const zone = resolveZone(primitive.zone, ctx)
      if (!zone) return gamestate
      return record(shuffle(gamestate, zone.player, zone.zone), { op: Op.Shuffle, zone })
    }

    case Op.Reveal: {
      const shown = resolveReveal(gamestate, primitive.cards, ctx)
      return record(gamestate, { op: Op.Reveal, ...shown, to: primitive.to })
    }

    case Op.If: {
      if (!ifPasses(gamestate, primitive, ctx)) return gamestate
      for (const step of primitive.then) {
        gamestate = interpret(gamestate, step, ctx)
      }
      return gamestate
    }

    default:
      return gamestate
  }
}
