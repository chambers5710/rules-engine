import { CopyStrips, Op, type BindingName, type CardFilter, type Expr, type Primitive, type SlotFilter } from "./dsl.js"

const SLOT_KINDS = new Set<SlotFilter["kind"]>([
  "has_counters",
  "survives_counters",
  "other_than",
  "name",
  "has_type",
  "has_energy",
  "empty",
  "evolved",
  "benched",
  "evolved_this_turn",
  "breeder",
  "marker",
])

const CARD_KINDS = new Set<CardFilter["kind"]>([
  "energy",
  "basic_energy",
  "basic_pokemon",
  "evolves_from",
  "name",
  "has_type",
  "trainer",
  "pokemon",
  "stage_2",
  "baby",
  "evolution",
  "name_contains",
  "any",
  "other_than",
  "among",
  "pays",
  "breeder",
])

/** Binds compute / trigger drain write before an authored stack runs. */
export const CATALOG_SEEDS: BindingName[] = [
  "$self_slot",
  "$defending",
  "$active",
  "$energy",
  "$discard",
  "$opp_discard",
  "$hand",
  "$deck",
  "$opp_hand",
  "$opp_deck",
  "$prize",
  "$opp_prize",
  "$played",
  "$attacker",
  "$applied",
  "$retreated",
]

function isBind(value: unknown): value is BindingName {
  return typeof value === "string" && value.startsWith("$")
}

function need(have: Set<string>, name: BindingName, at: string): string | null {
  if (have.has(name)) return null
  return `${at}: ${name} is unread`
}

function read(have: Set<string>, value: unknown, at: string): string | null {
  return isBind(value) ? need(have, value, at) : null
}

function asFilters(value: unknown): Array<{ kind?: string; bind?: BindingName; type?: unknown }> {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function filterNeed(
  have: Set<string>,
  at: string,
  filters: Array<{ bind?: BindingName; type?: unknown }>
): string | null {
  for (const filter of filters) {
    if (filter.bind) {
      const err = need(have, filter.bind, at)
      if (err) return err
    }
    const typed = read(have, filter.type, at)
    if (typed) return typed
  }
  return null
}

function walk(expr: Expr, have: Set<string>): string | null {
  for (const step of expr) {
    const err = reads(step, have)
    if (err) return err
    writes(step, have)
    if (step.op === Op.If || step.op === Op.Loop) {
      const inner = new Set(have)
      const nested = walk(step.then, inner)
      if (nested) return nested
      for (const name of inner) have.add(name)
      continue
    }
    if (step.op === Op.Each) {
      have.add(step.bind)
      const nested = walk(step.then, have)
      if (nested) return nested
      continue
    }
    if (step.op === Op.Arm) {
      const inner = new Set(have)
      inner.add("$attacker")
      inner.add("$self_slot")
      inner.add("$applied")
      const nested = walk(step.then, inner)
      if (nested) return nested
    }
  }
  return null
}

function reads(step: Primitive, have: Set<string>): string | null {
  const at = step.op
  switch (step.op) {
    case Op.MoveZoneToZone:
    case Op.MoveZoneToSlot:
    case Op.MoveZoneToStadium:
    case Op.MoveSlotToZone:
    case Op.MoveSlotToSlot:
      return read(have, step.card, at) ?? read(have, step.source, at) ?? ("dest" in step ? read(have, step.dest, at) : null)
    case Op.Attack:
      return read(have, step.base, at) ?? read(have, step.attacker, at) ?? read(have, step.defender, at)
    case Op.ApplyDamage:
      return read(have, step.amount, at) ?? read(have, step.slot, at)
    case Op.ApplyStatus:
    case Op.ApplyMarker:
    case Op.RemoveStatus:
    case Op.SwapActive:
    case Op.DiscardSlot:
      return read(have, step.slot, at)
    case Op.Devolve:
      return read(have, step.slot, at) ?? read(have, step.from, at)
    case Op.Select: {
      if (step.pick === "slots") {
        for (const filter of asFilters(step.filter)) {
          if (filter.kind && !SLOT_KINDS.has(filter.kind as SlotFilter["kind"])) {
            return `select slots: filter ${filter.kind} is not a slot filter`
          }
        }
        return filterNeed(have, at, asFilters(step.filter))
      }
      if (step.pick === "cards") {
        for (const filter of asFilters(step.filter)) {
          if (filter.kind && !CARD_KINDS.has(filter.kind as CardFilter["kind"])) {
            return `select cards: filter ${filter.kind} is not a card filter`
          }
        }
        return filterNeed(have, at, asFilters(step.filter)) ?? read(have, step.source, at)
      }
      if (step.pick === "attacks") {
        if ("filter" in step && step.filter != null) {
          return "select attacks: filters are not allowed"
        }
        return read(have, step.slot, at)
      }
      if (step.pick === "names") {
        for (const option of step.names) {
          const err = option.zone ? read(have, option.zone, at) : null
          if (err) return err
        }
        return null
      }
      return null
    }
    case Op.If:
      if ("filter" in step) {
        for (const filter of asFilters(step.filter)) {
          if (filter.kind && !SLOT_KINDS.has(filter.kind as SlotFilter["kind"])) {
            return `if: filter ${filter.kind} is not a slot filter`
          }
        }
        return read(have, step.slot, at) ?? filterNeed(have, at, asFilters(step.filter))
      }
      if ("status" in step) return read(have, step.slot, at)
      return read(have, step.bind, at)
    case Op.Loop:
      return read(have, step.bind, at) ?? read(have, step.until, at)
    case Op.ApplyFieldOverrides: {
      const fromSet = Object.values(step.set).map((value) => read(have, value, at)).find(Boolean)
      return read(have, step.card, at) ?? fromSet ?? null
    }
    case Op.ApplyModifier: {
      const extra =
        "ban" in step
          ? read(have, step.ban, at)
          : "forbid" in step
            ? read(have, step.forbid, at)
            : "from" in step
              ? read(have, step.from, at)
              : "attack" in step
                ? read(have, step.attack, at)
                : "set" in step
                  ? read(have, step.set, at)
                  : null
      const card = "card" in step ? read(have, step.card, at) : null
      return read(have, step.slot, at) ?? card ?? extra
    }
    case Op.Count:
      if (step.kind === "slots") {
        for (const filter of asFilters(step.filter)) {
          if (filter.kind && !SLOT_KINDS.has(filter.kind as SlotFilter["kind"])) {
            return `count slots: filter ${filter.kind} is not a slot filter`
          }
        }
        return filterNeed(have, at, asFilters(step.filter))
      }
      if (step.kind === "attack_damage") return read(have, step.slot, at) ?? read(have, step.attack, at)
      if ("zone" in step) {
        const n = "n" in step ? read(have, step.n, at) : null
        return read(have, step.zone, at) ?? n
      }
      if ("slot" in step) return read(have, step.slot, at)
      return null
    case Op.Each:
      for (const filter of asFilters(step.filter)) {
        if (filter.kind && !SLOT_KINDS.has(filter.kind as SlotFilter["kind"])) {
          return `each: filter ${filter.kind} is not a slot filter`
        }
      }
      return filterNeed(have, at, asFilters(step.filter))
    case Op.Calc:
      return read(have, step.a, at) ?? read(have, step.b, at)
    case Op.RunEffect: {
      const err = read(have, step.attack, at) ?? read(have, step.slot, at)
      if (err) return err
      for (const kind of step.strip ?? []) {
        if (!(CopyStrips as readonly string[]).includes(kind)) return `run_effect: unknown strip ${kind}`
      }
      return null
    }
    case Op.Draw:
      return read(have, step.count, at)
    case Op.Shuffle:
      return read(have, step.zone, at)
    case Op.EndTurn:
      return null
    case Op.Reorder:
      return read(have, step.zone, at) ?? read(have, step.cards, at)
    case Op.Push:
      return need(have, step.bind, at) ?? read(have, step.value, at)
    case Op.Reveal:
      if (Array.isArray(step.cards)) {
        for (const card of step.cards) {
          const err = read(have, card, at)
          if (err) return err
        }
        return null
      }
      return read(have, step.cards, at)
    case Op.FlipCoin:
    case Op.Arm:
      return null
  }
}

function writes(step: Primitive, have: Set<string>) {
  switch (step.op) {
    case Op.Select:
    case Op.FlipCoin:
    case Op.Count:
    case Op.Calc:
      have.add(step.bind)
      return
    case Op.Attack:
      have.add(step.bind)
      have.add("$raw")
      return
  }
}

export function validateExpr(expr: Expr, known: Iterable<string> = CATALOG_SEEDS): string | null {
  return walk(expr, new Set(known))
}
