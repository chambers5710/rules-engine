import { Op, type BindingName, type CalcFn, type CardFieldOverrideSet, type EndOfTurnWho, type Expr, type InterpretCtx, type Primitive, type SeatAmong, type SeatWho, type SlotFilter } from "./dsl.js"
import { applyFieldOverrides } from "./card.js"
import { applyModifier, effectsPrevented, foldAdds, foldAttackBase, foldBeforeMatchup, foldDamage, foldedMatchupType, rewriteOf, useRewriteOf } from "./modifiers.js"
import { benchSeats, currentForm, getSlot, isKnockedOut, occupiedBench, opponent, physicalForm, pokemonInPlay, sameSlot } from "./board.js"
import {
  applyDamage,
  applyStatus,
  copy,
  devolve,
  flipCoin,
  moveSlotToSlot,
  moveSlotToZone,
  moveZoneToSlot,
  moveZoneToStadium,
  moveZoneToZone,
  removeStatus,
  reorderZone,
  shuffle,
} from "./ops.js"
import { discardSlot, draw, swapActive } from "./helpers.js"
import { extraDamageIfConfused, coinPreventsAttack, halveAttackDamage, mayEvolve, preventsAttackDamage } from "./reads.js"
import { record } from "./history.js"
import { stage2BasicName } from "./lineage.js"
import { cardsAt, isBasicPokemon, printedAttackDamage, surveyCards, surveyCount, surveyEnergyValue } from "./survey.js"
import { applyDamageVia } from "./triggers.js"
import { DAMAGE_COUNTER, type Attachment, type CardFieldOverrides, type DamageModifier, type DamageVia, type EnergyType, type GameState, type SlotId, type SlotRef, type ZoneName, type ZoneRef } from "./types.js"

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

function withAttackShield(
  gamestate: GameState,
  slot: SlotId | undefined,
  ctx: InterpretCtx
): { gamestate: GameState; blocked: boolean } {
  if (ctx.via !== "attack" || !slot) return { gamestate, blocked: false }
  const attacker = resolveSlot("$self_slot", ctx)
  const from = attacker ? getSlot(gamestate, attacker) : undefined
  if (effectsPrevented(gamestate, slot, from)) return { gamestate, blocked: true }
  const seat = getSlot(gamestate, slot)
  if (!coinPreventsAttack(gamestate, seat)) return { gamestate, blocked: false }
  const id = physicalForm(gamestate, seat)?.instanceId
  if (!id) return { gamestate, blocked: false }
  ctx.attackShield ??= {}
  if (id in ctx.attackShield) return { gamestate, blocked: ctx.attackShield[id] }
  const scripted = ctx.script?.coins?.shift()
  const result = scripted ?? flipCoin(1)[0]
  ctx.attackShield[id] = result === "heads"
  return {
    gamestate: record(gamestate, { op: Op.FlipCoin, result }),
    blocked: ctx.attackShield[id],
  }
}

function emitDamage(
  ctx: InterpretCtx,
  gamestate: GameState,
  source: SlotId | undefined,
  target: SlotId,
  applied: number,
  via: DamageVia
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
  via: DamageVia
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

function emitEvolved(ctx: InterpretCtx, gamestate: GameState, dest: SlotRef) {
  const target = dest.slot === "bench"
    ? { player: dest.player, slot: "bench" as const, index: dest.index }
    : { player: dest.player, slot: "active" as const }
  const targetCard = currentForm(gamestate, getSlot(gamestate, target))?.instanceId
  if (!targetCard) return
  ctx.events ??= []
  ctx.events.push({ kind: "evolved", targetCard, target })
}

function emitPlayed(ctx: InterpretCtx, gamestate: GameState, dest: SlotRef) {
  const target = dest.slot === "bench"
    ? { player: dest.player, slot: "bench" as const, index: dest.index }
    : { player: dest.player, slot: "active" as const }
  const targetCard = currentForm(gamestate, getSlot(gamestate, target))?.instanceId
  if (!targetCard) return
  ctx.events ??= []
  ctx.events.push({ kind: "played", targetCard, target })
}

function emitRetreated(ctx: InterpretCtx, target: SlotId, targetCard: string) {
  ctx.events ??= []
  ctx.events.push({ kind: "retreated", targetCard, target })
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
    const listed = Array.isArray(bound) ? bound : typeof bound === "string" && bound ? [bound] : []
    for (const id of listed) {
      if (typeof id !== "string" || !id) continue
      ids.push(id)
      const at = zoneOf(gamestate, id)
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

function endOfTurnUntil(slot: SlotId, until: EndOfTurnWho): {
  beat: "end_of_turn"
  player: 1 | 2
  next?: true
  leave_active?: true
  leave_play?: true
} {
  return {
    beat: "end_of_turn",
    player: until.who === "owner" ? slot.player : opponent(slot.player),
    ...(until.next ? { next: true as const } : {}),
    ...(until.leave_active ? { leave_active: true as const } : {}),
    ...(until.leave_play ? { leave_play: true as const } : {}),
  }
}

// Named base, then before-matchup defender sub, then Weakness / Resistance,
// then attacker adds, then defender folds. W/R on the opponent defender this
// Attack names, unless the primitive sets matchup: false (Sonicboom / Telekinesis).
// Attacker types are the current form, not attached energy and not attack cost.
// Each printed line whose type is among those types applies; damage floors at 0.
// foldAdds / foldDamage still run after that skip — printed “other effects after
// W/R still happen.”
export function pipelineAttackDamage(
  gamestate: GameState,
  base: number,
  attacker: SlotId,
  defender: SlotId,
  attack?: string,
  matchup = true
): { damage: number; raw: number; weakness: boolean; resistance: boolean; prevented: boolean } {
  let damage = foldAttackBase(gamestate, attacker, base, attack)
  damage += extraDamageIfConfused(gamestate, getSlot(gamestate, attacker))
  damage = foldBeforeMatchup(gamestate, defender, damage, attacker)
  let weakness = false
  let resistance = false
  if (matchup && defender.player !== attacker.player) {
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
  damage = foldDamage(gamestate, defender, raw, attacker)
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

function resolveInstance(
  gamestate: GameState,
  value: SlotId | BindingName,
  ctx: InterpretCtx
): string | undefined {
  if (typeof value !== "string") {
    return currentForm(gamestate, getSlot(gamestate, value))?.instanceId
  }
  if (!value.startsWith("$")) return value
  const bound = ctx.bindings[value]
  if (typeof bound === "string" && bound !== "") return bound
  if (isSlotId(bound)) return currentForm(gamestate, getSlot(gamestate, bound))?.instanceId
}

function resolveOverrideSet(set: CardFieldOverrideSet, ctx: InterpretCtx): CardFieldOverrides | undefined {
  const out: CardFieldOverrides = {}
  for (const [key, value] of Object.entries(set)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const bound = ctx.bindings[value]
      if (typeof bound !== "string" || bound === "") return
      Object.assign(out, { [key]: key === "types" ? [bound] : bound })
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
      case "name": {
        if (currentForm(gamestate, slot)?.name !== filter.name) return false
        break
      }
      case "has_type": {
        const types = currentForm(gamestate, slot)?.types ?? []
        const want =
          typeof filter.type === "string" && filter.type.startsWith("$")
            ? bindings[filter.type]
            : filter.type
        let hit = false
        if (typeof want === "string") hit = types.includes(want as EnergyType)
        else if (isSlotId(want)) {
          const other = currentForm(gamestate, getSlot(gamestate, want))?.types ?? []
          hit = types.some((type) => other.includes(type))
        }
        if (filter.not ? hit : !hit) return false
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
      case "benched":
        if (slotId.slot !== "bench") return false
        break
      case "evolved_this_turn": {
        const hit = slot.evolvedThisTurn
        if (filter.not ? hit : !hit) return false
        break
      }
      case "breeder": {
        const evo = bindings[filter.bind]
        if (typeof evo !== "string" || !mayEvolve(gamestate, slotId.player, slot)) return false
        const basic = stage2BasicName(gamestate, evo)
        const form = currentForm(gamestate, slot)
        if (!basic || !form || form.name !== basic) return false
        if (!isBasicPokemon(gamestate, form.instanceId)) return false
        break
      }
      case "marker":
        if (!slot.markers.includes(filter.name)) return false
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
  if ("filter" in primitive) {
    const slot = resolveSlot(primitive.slot, ctx)
    if (!slot) return false
    return slotMatches(gamestate, slot, [primitive.filter].flat(), ctx.bindings)
  }
  if ("status" in primitive) {
    const slot = resolveSlot(primitive.slot, ctx)
    if (!slot) return false
    return getSlot(gamestate, slot).status[primitive.status]
  }
  const hit = ctx.bindings[primitive.bind] === primitive.equals
  return primitive.not ? !hit : hit
}

/** Trailing status / filter If, or a bind If with `gate: true` — "can't use unless". Count/Calc may precede. Mirror Move / Conversion 1 omit `gate` (skip-then). */
export function useGate(expr: Expr): Extract<Primitive, { op: Op.If }> | undefined {
  let i = 0
  while (i < expr.length && (expr[i]!.op === Op.Count || expr[i]!.op === Op.Calc)) i++
  if (i !== expr.length - 1) return undefined
  const step = expr[i]
  if (!step || step.op !== Op.If) return undefined
  if ("status" in step || "filter" in step) return step
  if ("gate" in step && step.gate) return step
  return undefined
}

/** Listing / fail-close: dry-run leading Count/Calc so a bind If can see `$diff`. */
export function gatePasses(
  gamestate: GameState,
  expr: Expr,
  seed: Record<string, unknown> | undefined
): boolean {
  const gate = useGate(expr)
  if (!gate) return true
  const ctx: InterpretCtx = { bindings: { ...(seed ?? {}) } }
  for (const step of expr) {
    if (step.op !== Op.Count && step.op !== Op.Calc) break
    gamestate = interpret(gamestate, step, ctx)
  }
  return ifPasses(gamestate, gate, ctx)
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
      const evolving = dest.attachment === "evolution" && getSlot(gamestate, dest).evolution.length > 0
      const next = moveZoneToSlot(gamestate, card, source, dest)
      if (next !== gamestate && dest.attachment === "evolution" && source.zone === "hand") {
        emitPlayed(ctx, next, dest)
      }
      if (evolving && next !== gamestate) emitEvolved(ctx, next, dest)
      return next
    }

    case Op.MoveZoneToStadium: {
      const source = resolveZone(primitive.source, ctx)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !card) return gamestate
      return moveZoneToStadium(gamestate, card, source)
    }

    case Op.MoveSlotToZone: {
      const source = resolveSlotAttachment(primitive.source, ctx, primitive.attachment)
      const dest = resolveZone(primitive.dest, ctx)
      const card = resolveCard(primitive.card, ctx)
      if (!source || !dest || !card) return gamestate
      const shield = withAttackShield(gamestate, source, ctx)
      if (shield.blocked) return shield.gamestate
      return moveSlotToZone(shield.gamestate, card, source, dest, primitive.position)
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
      const shield = withAttackShield(gamestate, source, ctx)
      if (shield.blocked) return shield.gamestate
      const evolving = dest.attachment === "evolution" && getSlot(shield.gamestate, dest).evolution.length > 0
      const next = moveSlotToSlot(shield.gamestate, card, source, dest)
      if (evolving && next !== shield.gamestate) emitEvolved(ctx, next, dest)
      return next
    }

    case Op.Attack: {
      const attacker = resolveSlot(primitive.attacker, ctx)
      const defender = resolveSlot(primitive.defender, ctx)
      if (!attacker || !defender) return gamestate
      const shield = withAttackShield(gamestate, defender, ctx)
      gamestate = shield.gamestate
      const hit = pipelineAttackDamage(
        gamestate,
        resolveAmount(primitive.base, ctx),
        attacker,
        defender,
        ctx.attack,
        primitive.matchup !== false
      )
      const blocked = shield.blocked
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
      const shield = withAttackShield(gamestate, slot, ctx)
      if (!slot || shield.blocked) return shield.gamestate
      gamestate = shield.gamestate
      let amount = resolveAmount(primitive.amount, ctx)
      const source = resolveSlot("$self_slot", ctx)
      const via = applyDamageVia(ctx, slot, primitive.source)
      if (source && amount > 0 && primitive.source !== "poison" && primitive.source !== "burn") {
        amount += extraDamageIfConfused(gamestate, getSlot(gamestate, source))
      }
      if (via === "attack" || via === "splash") {
        const seat = getSlot(gamestate, slot)
        amount = halveAttackDamage(gamestate, seat, amount)
        if (preventsAttackDamage(gamestate, seat, amount)) amount = 0
      }
      const next = applyDamage(gamestate, amount, slot, primitive.source)
      emitDamage(ctx, next, source, slot, amount, via)
      emitKo(ctx, gamestate, next, source, slot, via)
      return next
    }

    case Op.ApplyStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      const shield = withAttackShield(gamestate, slot, ctx)
      if (!slot || shield.blocked) return shield.gamestate
      return applyStatus(shield.gamestate, primitive.status, slot, primitive.counters)
    }

    case Op.ApplyMarker: {
      const dest = resolveSlot(primitive.slot, ctx)
      if (!dest) return gamestate
      const slot = getSlot(gamestate, dest)
      if (slot.markers.includes(primitive.name)) return gamestate
      const next = copy(gamestate, dest.player)
      getSlot(next, dest).markers = [...slot.markers, primitive.name]
      return record(next, { op: Op.ApplyMarker, slot: dest, name: primitive.name })
    }

    case Op.RemoveStatus: {
      const slot = resolveSlot(primitive.slot, ctx)
      const shield = withAttackShield(gamestate, slot, ctx)
      if (!slot || shield.blocked) return shield.gamestate
      return removeStatus(shield.gamestate, primitive.status, slot)
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
      const shield = withAttackShield(gamestate, slot, ctx)
      if (!slot || shield.blocked) return shield.gamestate
      gamestate = shield.gamestate
      switch (primitive.field) {
        case "weakness_type":
        case "resistance_type": {
          const raw = primitive.set
          const set = (raw.startsWith("$") ? String(ctx.bindings[raw] ?? "") : raw) as EnergyType
          if (!set) return gamestate
          const until =
            primitive.until.beat === "leave_active"
              ? { beat: "leave_active" as const }
              : { beat: "leave_play" as const }
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
              : endOfTurnUntil(slot, primitive.until)
          const rewrite = useRewriteOf(primitive, (name) => String(ctx.bindings[name] ?? ""))
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "attack_use", ...rewrite, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "attack_use", ...rewrite, until },
          )
        }
        case "ability_use": {
          const until = endOfTurnUntil(slot, primitive.until)
          const rewrite = useRewriteOf({ ban: primitive.ban }, (name) => String(ctx.bindings[name] ?? ""))
          if (!("ban" in rewrite)) return gamestate
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "ability_use", ban: rewrite.ban, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "ability_use", ban: rewrite.ban, until },
          )
        }
        case "energy_type": {
          const until = endOfTurnUntil(slot, primitive.until)
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "energy_type", set: primitive.set, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "energy_type", set: primitive.set, until },
          )
        }
        case "attack_damage": {
          const until = endOfTurnUntil(slot, primitive.until)
          const rewrite = rewriteOf(primitive)
          const from = primitive.from ? resolveInstance(gamestate, primitive.from, ctx) : undefined
          if (primitive.from && !from) return gamestate
          const attack = primitive.attack ? resolveCard(primitive.attack, ctx) : undefined
          if (primitive.attack && !attack) return gamestate
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          const scope = {
            ...(from ? { from } : {}),
            ...(attack ? { attack } : {}),
            ...(primitive.before ? { before: primitive.before } : {}),
          }
          return record(
            applyModifier(gamestate, slot, {
              field: "attack_damage",
              ...rewrite,
              until,
              ...scope,
              ...(card ? { card } : {}),
            }),
            { op: Op.ApplyModifier, slot, field: "attack_damage", ...rewrite, until, ...scope },
          )
        }
        case "cannot_retreat": {
          const until = endOfTurnUntil(slot, primitive.until)
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "cannot_retreat", until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "cannot_retreat", until },
          )
        }
        case "trainer_use": {
          const until = endOfTurnUntil(slot, primitive.until)
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "trainer_use", until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "trainer_use", until },
          )
        }
        case "can_attack": {
          const forbid = resolveInstance(gamestate, primitive.forbid, ctx)
          if (!forbid) return gamestate
          const until = endOfTurnUntil(slot, primitive.until)
          const card = primitive.card ? resolveCard(primitive.card, ctx) : undefined
          return record(
            applyModifier(gamestate, slot, { field: "can_attack", forbid, until, ...(card ? { card } : {}) }),
            { op: Op.ApplyModifier, slot, field: "can_attack", forbid, until },
          )
        }
        case "attack_effects": {
          const until = endOfTurnUntil(slot, primitive.until)
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
          trigger: primitive.when === "damage_applied"
            ? {
                when: "damage_applied",
                via: primitive.via,
                ...(primitive.minApplied != null ? { minApplied: primitive.minApplied } : {}),
                blockedByStatus: primitive.blockedByStatus,
                then: primitive.then,
              }
            : {
                when: "pokemon_knocked_out",
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
      if (primitive.kind === "knocked_out") {
        const slot = resolveSlot(primitive.slot, ctx)
        ctx.bindings[primitive.bind] = slot && isKnockedOut(gamestate, getSlot(gamestate, slot)) ? 1 : 0
        return gamestate
      }
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
      if (primitive.kind === "type") {
        const slot = resolveSlot(primitive.slot, ctx)
        ctx.bindings[primitive.bind] = slot
          ? currentForm(gamestate, getSlot(gamestate, slot))?.types?.[0] ?? ""
          : ""
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
      if (primitive.kind === "prefix") {
        const zone = resolveZone(primitive.zone, ctx)
        const n = Math.max(0, resolveAmount(primitive.n, ctx))
        ctx.bindings[primitive.bind] = zone ? cardsAt(gamestate, zone).slice(0, n) : []
        return gamestate
      }
      if (primitive.kind === "first" || primitive.kind === "last" || primitive.kind === "random") {
        const source =
          "zone" in primitive
            ? resolveZone(primitive.zone, ctx)
            : resolveSlotRef(primitive.slot, primitive.attachment, ctx)
        const cards = source ? surveyCards(gamestate, source, primitive.filter) : []
        ctx.bindings[primitive.bind] =
          primitive.kind === "last"
            ? cards.at(-1) ?? ""
            : primitive.kind === "random"
              ? cards.length
                ? cards[Math.floor(Math.random() * cards.length)] ?? ""
                : ""
              : cards[0] ?? ""
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
      const shield = withAttackShield(gamestate, { player: slot.player, slot: "active" }, ctx)
      if (shield.blocked) return shield.gamestate
      const leaving = currentForm(shield.gamestate, getSlot(shield.gamestate, { player: slot.player, slot: "active" }))
        ?.instanceId
      const next = swapActive(shield.gamestate, slot.player, slot.index)
      if (next === shield.gamestate) return shield.gamestate
      if (ctx.bindings.$retreating && leaving) emitRetreated(ctx, slot, leaving)
      return record(next, { op: Op.SwapActive, slot })
    }

    case Op.DiscardSlot: {
      const slot = resolveSlot(primitive.slot, ctx)
      const shield = withAttackShield(gamestate, slot, ctx)
      if (!slot || shield.blocked) return shield.gamestate
      return discardSlot(shield.gamestate, slot, primitive.dest ?? "discard")
    }

    case Op.Devolve: {
      const slot = resolveSlot(primitive.slot, ctx)
      const from = resolveCard(primitive.from, ctx)
      if (!slot || !from) return gamestate
      return devolve(gamestate, slot, from, primitive.dest ?? "discard")
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

    case Op.EndTurn:
      ctx.endTurn = true
      return record(gamestate, { op: Op.EndTurn })

    case Op.Reveal: {
      const shown = resolveReveal(gamestate, primitive.cards, ctx)
      if (shown.cards.length === 0) return gamestate
      const next = shown.zone === "prize" && primitive.to === "both"
        ? { ...gamestate, prizesPublic: true }
        : gamestate
      return record(next, { op: Op.Reveal, ...shown, to: primitive.to })
    }

    case Op.Push: {
      const item = resolveCard(primitive.value, ctx)
      const bound = ctx.bindings[primitive.bind]
      const list = Array.isArray(bound) ? bound.filter((id): id is string => typeof id === "string") : []
      ctx.bindings[primitive.bind] = item ? [...list, item] : list
      return gamestate
    }

    case Op.Reorder: {
      const zone = resolveZone(primitive.zone, ctx)
      const bound = ctx.bindings[primitive.cards]
      const cards = Array.isArray(bound)
        ? bound.filter((id): id is string => typeof id === "string" && id !== "")
        : []
      if (!zone || cards.length === 0) return gamestate
      return reorderZone(gamestate, zone, cards)
    }

    default:
      return gamestate
  }
}
