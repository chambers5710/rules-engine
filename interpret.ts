import { Op, type BindingName, type CalcFn, type CardFieldOverrideSet, type InterpretCtx, type Primitive, type SeatAmong, type SeatWho, type SlotFilter } from "./dsl.js"
import { applyFieldOverrides } from "./card.js"
import { applyModifier, effectsPrevented, foldAdds, foldDamage, foldedMatchupType, rewriteOf, useRewriteOf } from "./modifiers.js"
import { benchSeats, currentForm, getSlot, isKnockedOut, occupiedBench, opponent, pokemonInPlay, sameSlot } from "./board.js"
import {
  applyDamage,
  applyStatus,
  copy,
  devolve,
  flipCoin,
  moveSlotToSlot,
  moveSlotToZone,
  moveZoneToSlot,
  moveZoneToZone,
  removeStatus,
  shuffle,
} from "./ops.js"
import { discardSlot, draw, swapActive } from "./helpers.js"
import { record } from "./history.js"
import { stage2BasicName } from "./lineage.js"
import { isBasicPokemon, printedAttackDamage, surveyCards, surveyCount, surveyEnergyValue } from "./survey.js"
import { applyDamageVia } from "./triggers.js"
import { DAMAGE_COUNTER, type Attachment, type CardFieldOverrides, type DamageModifier, type EnergyType, type GameEvent, type GameState, type SlotId, type SlotRef, type ZoneName, type ZoneRef } from "./types.js"

export type { InterpretCtx, InterpretScript } from "./dsl.js"

function isZoneRef(value: unknown): value is ZoneRef {
  return typeof value === "object" && value !== null && "zone" in value && "player" in value
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === "object" && value !== null && "player" in value && "slot" in value
}

function isSlotRef(value: unknown): value is SlotRef {
  return isSlotId(value) && "attachment" in value
}

function attackBlocked(gamestate: GameState, slot: SlotId | undefined, ctx: InterpretCtx): boolean {
  return ctx.via === "attack" && !!slot && effectsPrevented(gamestate, slot)
}

function emitDamage(
  ctx: InterpretCtx,
  gamestate: GameState,
  source: SlotId | undefined,
  target: SlotId,
  applied: number,
  via: GameEvent["via"]
) {
  const targetCard = currentForm(gamestate, getSlot(gamestate, target))?.instanceId
  if (!targetCard) return
  ctx.events ??= []
  ctx.events.push({
    kind: "damage_applied",
    targetCard,
    target,
    applied,
    via,
    ...(source
      ? {
          source,
          sourceCard: currentForm(gamestate, getSlot(gamestate, source))?.instanceId,
        }
      : {}),
  })
}

function emitKo(
  ctx: InterpretCtx,
  before: GameState,
  after: GameState,
  source: SlotId | undefined,
  target: SlotId,
  via: GameEvent["via"]
) {
  if (isKnockedOut(before, getSlot(before, target))) return
  if (!isKnockedOut(after, getSlot(after, target))) return
  const targetCard = currentForm(after, getSlot(after, target))?.instanceId
  if (!targetCard) return
  ctx.events ??= []
  ctx.events.push({
    kind: "pokemon_knocked_out",
    targetCard,
    target,
    via,
    ...(source
      ? {
          source,
          sourceCard: currentForm(after, getSlot(after, source))?.instanceId,
        }
      : {}),
  })
}

function stampLastHit(
  gamestate: GameState,
  attacker: SlotId,
  defender: SlotId,
  applied: number
): GameState {
  const targetCard = currentForm(gamestate, getSlot(gamestate, defender))?.instanceId
  const sourceCard = currentForm(gamestate, getSlot(gamestate, attacker))?.instanceId
  if (!targetCard || !sourceCard) return gamestate
  return {
    ...gamestate,
    lastHit: {
      ...gamestate.lastHit,
      [targetCard]: { turn: gamestate.turnCount, sourceCard, applied },
    },
  }
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

// Attack damage — attack_damage rewrite, then Weakness, then Resistance.
// W/R only on the Defending Pokémon (opponent's Active). Attacker types are
// the current form, not attached energy and not attack cost. Each printed
// line whose type is among those types applies; damage floors at 0.
export function pipelineAttackDamage(
  gamestate: GameState,
  base: number,
  attacker: SlotId,
  defender: SlotId
): { damage: number; raw: number; weakness: boolean; resistance: boolean; prevented: boolean } {
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
  const raw = Math.max(0, damage)
  damage = foldDamage(gamestate, defender, raw)
  return {
    damage,
    raw,
    weakness,
    resistance,
    prevented: raw > 0 && damage === 0,
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

function resolveOverrideSet(set: CardFieldOverrideSet, ctx: InterpretCtx): CardFieldOverrides | undefined {
  const out: CardFieldOverrides = {}
  for (const [key, value] of Object.entries(set)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const bound = ctx.bindings[value]
      if (typeof bound !== "string" || bound === "") return
      Object.assign(out, { [key]: bound })
      continue
    }
    Object.assign(out, { [key]: value })
  }
  return out
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
    case "half_down_10":
      if (a <= 0) return 0
      return Math.floor(a / 2 / (b || 10)) * (b || 10)
  }
}

export function slotMatches(
  gamestate: GameState,
  slotId: SlotId,
  filters: SlotFilter[],
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
      case "empty":
        if (slot.evolution.length > 0) return false
        break
      case "evolved":
        if (slot.evolution.length < 2) return false
        break
      case "breeder": {
        const evo = bindings[filter.bind]
        if (typeof evo !== "string" || slot.evolvedThisTurn) return false
        const basic = stage2BasicName(gamestate, evo)
        const form = currentForm(gamestate, slot)
        if (!basic || !form || form.name !== basic) return false
        if (!isBasicPokemon(gamestate, form.instanceId)) return false
        break
      }
    }
  }
  return true
}

export function surveySlots(
  gamestate: GameState,
  acting: 1 | 2,
  who: SeatWho,
  among: SeatAmong,
  filters: SlotFilter[] = [],
  bindings: Record<string, unknown> = {}
): SlotId[] {
  const players: Array<1 | 2> =
    who === "self" ? [acting] : who === "opponent" ? [opponent(acting)] : [acting, opponent(acting)]
  const seats: SlotId[] = []
  for (const player of players) {
    const includeEmpty = filters.some((filter) => filter.kind === "empty")
    const ids =
      among === "bench"
        ? includeEmpty
          ? benchSeats(player)
          : occupiedBench(gamestate, player).map((index) => ({ player, slot: "bench" as const, index }))
        : includeEmpty
          ? [{ player, slot: "active" as const }, ...benchSeats(player)]
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
      if (attackBlocked(gamestate, source, ctx)) return gamestate
      return moveSlotToZone(gamestate, card, source, dest, primitive.position)
    }

    case Op.MoveSlotToSlot: {
      const source = resolveSlotAttachment(
        primitive.source,
        ctx,
        primitive.sourceAttachment ?? primitive.attachment
      )
      const dest = resolveSlotAttachment(primitive.dest, ctx, primitive.attachment)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      if (attackBlocked(gamestate, source, ctx)) return gamestate
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
      const blocked = effectsPrevented(gamestate, defender)
      const damage = blocked ? 0 : hit.damage
      const prevented = blocked || hit.prevented
      ctx.bindings[primitive.bind] = damage
      ctx.bindings.$raw = hit.raw
      let next = gamestate
      if (damage > 0) {
        next = copy(gamestate, defender.player)
        getSlot(next, defender).damage = Math.max(0, getSlot(next, defender).damage + damage)
      }
      next = record(next, {
        op: Op.Attack,
        attacker,
        defender,
        damage,
        raw: hit.raw,
        weakness: hit.weakness,
        resistance: hit.resistance,
        prevented,
      })
      if (!blocked) {
        emitDamage(ctx, next, attacker, defender, damage, "attack")
        emitKo(ctx, gamestate, next, attacker, defender, "attack")
        next = stampLastHit(next, attacker, defender, damage)
      }
      return next
    }

    case Op.ApplyDamage: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot || attackBlocked(gamestate, slot, ctx)) return gamestate
      const amount = resolveAmount(primitive.amount, ctx)
      const source = resolveSlot("$self_slot", ctx)
      const via = applyDamageVia(ctx, slot, primitive.source)
      const next = applyDamage(gamestate, amount, slot, primitive.source)
      emitDamage(ctx, next, source, slot, amount, via)
      emitKo(ctx, gamestate, next, source, slot, via)
      return next
    }

    case Op.ApplyStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot || attackBlocked(gamestate, slot, ctx)) return gamestate
      return applyStatus(gamestate, primitive.status, slot, primitive.counters)
    }

    case Op.RemoveStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot || attackBlocked(gamestate, slot, ctx)) return gamestate
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
      if (!slot || attackBlocked(gamestate, slot, ctx)) return gamestate
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
          const until =
            primitive.until.beat === "leave_play"
              ? { beat: "leave_play" as const }
              : {
                  beat: "end_of_turn" as const,
                  player: primitive.until.who === "owner" ? slot.player : opponent(slot.player),
                }
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
        case "attack_effects": {
          const player = primitive.until.who === "owner" ? slot.player : opponent(slot.player)
          const until = { beat: "end_of_turn" as const, player }
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "attack_effects", prevent: "all", until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "attack_effects", prevent: "all", until },
          )
        }
        default:
          return gamestate
      }
    }

    case Op.ApplyFieldOverrides: {
      const card = resolveCard(primitive.card, ctx)
      const set = resolveOverrideSet(primitive.set, ctx)
      if (!card || !gamestate.cardRegistry[card] || !set) return gamestate
      return record(applyFieldOverrides(gamestate, card, set), {
        op: Op.ApplyFieldOverrides,
        card,
        set,
      })
    }

    case Op.Arm: {
      const slot = resolveSlot("$self_slot", ctx)
      const form = slot ? currentForm(gamestate, getSlot(gamestate, slot)) : undefined
      if (!slot || !form) return gamestate
      const player = primitive.who === "owner" ? slot.player : opponent(slot.player)
      const next = { ...gamestate }
      next.subscriptions = [
        ...next.subscriptions.filter((sub) => sub.sourceCard !== form.instanceId),
        {
          id: form.instanceId,
          sourceCard: form.instanceId,
          trigger: {
            when: primitive.when,
            via: primitive.via,
            blockedByStatus: primitive.blockedByStatus,
            then: primitive.then,
          },
          until: { beat: "end_of_turn", player },
          phase: player === gamestate.activePlayer ? "active" : "pending",
        },
      ]
      return next
    }

    case Op.Count: {
      if (primitive.kind === "last_attacked" || primitive.kind === "last_hit") {
        const slot = resolveSlot(primitive.slot, ctx)
        const id = slot ? currentForm(gamestate, getSlot(gamestate, slot))?.instanceId : undefined
        const hit = id ? gamestate.lastHit[id] : undefined
        const lastTurn = hit && hit.turn === gamestate.turnCount - 1
        ctx.bindings[primitive.bind] =
          primitive.kind === "last_attacked" ? (lastTurn ? 1 : 0) : lastTurn ? hit.applied : 0
        return gamestate
      }
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
      if (primitive.kind === "first" || primitive.kind === "last") {
        const source =
          "zone" in primitive
            ? resolveZone(primitive.zone, ctx)
            : resolveSlotRef(primitive.slot, primitive.attachment, ctx)
        const cards = source ? surveyCards(gamestate, source, primitive.filter) : []
        ctx.bindings[primitive.bind] =
          primitive.kind === "last" ? cards.at(-1) ?? "" : cards[0] ?? ""
        return gamestate
      }
      if (primitive.kind !== "cards" && primitive.kind !== "energy_value") return gamestate
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
      if (attackBlocked(gamestate, { player: slot.player, slot: "active" }, ctx)) return gamestate
      const next = swapActive(gamestate, slot.player, slot.index)
      if (next === gamestate) return gamestate
      return record(next, { op: Op.SwapActive, slot })
    }

    case Op.DiscardSlot: {
      const slot = resolveSlot(primitive.slot, ctx)
      if (!slot) return gamestate
      return discardSlot(gamestate, slot)
    }

    case Op.Devolve: {
      const slot = resolveSlot(primitive.slot, ctx)
      const from = resolveCard(primitive.from, ctx)
      if (!slot || !from) return gamestate
      return devolve(gamestate, slot, from)
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

    default:
      return gamestate
  }
}
