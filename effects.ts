import { Op, type Expr } from "./dsl.js"
import { DAMAGE_COUNTER } from "./types.js"

// Pokémon: attacks / abilities by name. Trainers: the expr is the entry (id only).
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

export const effects: Record<string, CardEffects | Expr> = {
  // Chansey — first Basic Pokémon in base1
  "base1-1": {
    attacks: {
      "Confuse Ray": [
        { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "confused", slot: "$defending" }
          ]
        },
      ]
    },
    abilities: {
      "Damage Swap": [
        {
          op: Op.Select,
          bind: "$from",
          pick: "slots",
          who: "self",
          filter: { kind: "has_counters", counters: 1 },
        },
        {
          op: Op.Select,
          bind: "$to",
          pick: "slots",
          who: "self",
          filter: [
            { kind: "other_than", bind: "$from" },
            { kind: "survives_counters", counters: 1 },
          ],
        },
        { op: Op.ApplyDamage, amount: -DAMAGE_COUNTER, slot: "$from" },
        { op: Op.ApplyDamage, amount: DAMAGE_COUNTER, slot: "$to" },
      ],
    },
  },
  "base1-2": {
    attacks: {
      "Hydro Pump": [
        { op: Op.Count, kind: "energy_value", slot: "$self_slot", attachment: "energy", filter: { kind: "energy", type: "Water" }, bind: "$water" },
        { op: Op.Calc, fn: "sub", a: "$water", b: 3, bind: "$extra" },
        { op: Op.Calc, fn: "max", a: "$extra", b: 0, bind: "$extra" },
        { op: Op.Calc, fn: "min", a: "$extra", b: 2, bind: "$extra" },
        { op: Op.Calc, fn: "mul", a: "$extra", b: 10, bind: "$bonus" },
        { op: Op.Calc, fn: "add", a: 40, b: "$bonus", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
    abilities: {
      "Rain Dance": [
        {
          op: Op.Select,
          pick: "cards",
          source: "$hand",
          bind: "$energy",
          filter: { kind: "energy", type: "Water" },
        },
        {
          op: Op.Select,
          pick: "slots",
          who: "self",
          bind: "$to",
          filter: { kind: "has_type", type: "Water" },
        },
        {
          op: Op.MoveZoneToSlot,
          card: "$energy",
          source: "$hand",
          dest: "$to",
          attachment: "energy",
        },
      ]
    }
  },
  "base1-3": {
    attacks: {
      "Scrunch": [
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyModifier, slot: "$self_slot", field: "attack_damage", set: 0, until: { beat: "end_of_turn", who: "opponent" } }
          ]
        },
      ],
      "Double-edge": [
        { op: Op.Attack, base: 80, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyDamage, amount: 80, slot: "$self_slot" },
      ],
    },
  },
  "base1-4": {
    attacks: {
      "Fire Spin": [
        {
          op: Op.Select,
          pick: "cards",
          source: "$energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$energy",
          dest: "$discard",
          position: "bottom",
        },
        {
          op: Op.Select,
          pick: "cards",
          source: "$energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$energy",
          dest: "$discard",
          position: "bottom",
        },
        { op: Op.Attack, base: 100, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-13": {
    attacks: {
      "Whirlpool": [
        { op: Op.Attack, base: 40, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        {
          op: Op.Select,
          pick: "cards",
          source: "$defending",
          attachment: "energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$defending",
          attachment: "energy",
          dest: "$opp_discard",
          position: "bottom",
        },
      ],
    },
  },
  "base1-20": {
    attacks: {
      "Thundershock": [
        { op: Op.Attack, base: 10, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "paralyzed", slot: "$defending" }
          ]
        },
      ],
    },
  },
  "base1-29": {
    attacks: {
      "Hypnosis": [
        { op: Op.ApplyStatus, status: "asleep", slot: "$defending" },
      ],
    },
  },
  "base1-30": {
    attacks: {
      "Poisonpowder": [
        { op: Op.Attack, base: 20, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyStatus, status: "poison", slot: "$defending" },
      ],
    },
  },
  "base1-31": {
    attacks: {
      "Meditate": [
        { op: Op.Count, kind: "damage", slot: "$defending", bind: "$slot_damage" },
        { op: Op.Calc, fn: "add", a: 20, b: "$slot_damage", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-34": {
    attacks: {
      "Karate Chop": [
        { op: Op.Count, kind: "damage", slot: "$self_slot", bind: "$slot_damage" },
        { op: Op.Calc, fn: "sub", a: 50, b: "$slot_damage", bind: "$base" },
        { op: Op.Calc, fn: "max", a: "$base", b: 0, bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-35": {
    attacks: {
      "Flail": [
        { op: Op.Count, kind: "damage", slot: "$self_slot", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-5": {
    attacks: {
      "Sing": [
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "asleep", slot: "$defending" }
          ]
        },
      ],
      "Metronome": [
        { op: Op.Select, pick: "attacks", slot: "$defending", bind: "$copy" },
        { op: Op.RunEffect, attack: "$copy", slot: "$defending" },
      ],
    },
  },
  "basep-51": {
    attacks: {
      "Super Singe": [
        { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "burn", slot: "$defending" }
          ]
        },
      ],
    },
  },
  "base1-82": [
    { op: Op.RemoveStatus, status: "asleep", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "confused", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "paralyzed", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "poison", slot: "$self_slot" },
  ],
  "base1-90": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$to" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$to",
      attachment: "energy",
      bind: "$pay",
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: "$to",
      attachment: "energy",
      dest: "$discard",
      position: "bottom",
    },
    { op: Op.ApplyDamage, amount: -4 * DAMAGE_COUNTER, slot: "$to" },
  ],
  "base1-91": [
    { op: Op.Draw, who: "self", count: 2 },
  ],
  "base1-92": [
    { op: Op.Select, pick: "slots", who: "opponent", bind: "$to" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$to",
      attachment: "energy",
      bind: "$pay",
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: "$to",
      attachment: "energy",
      dest: "$opp_discard",
      position: "bottom",
    },
  ],
  "base1-93": [
    {
      op: Op.Select,
      pick: "slots",
      who: "opponent",
      bind: "$to",
      filter: { kind: "other_than", bind: "$defending" },
    },
    { op: Op.SwapActive, slot: "$to" },
  ],
  "base1-94": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$to" },
    { op: Op.ApplyDamage, amount: -2 * DAMAGE_COUNTER, slot: "$to" },
  ],
  "base1-95": [
    {
      op: Op.Select,
      pick: "slots",
      who: "self",
      bind: "$to",
      filter: { kind: "other_than", bind: "$self_slot" },
    },
    { op: Op.SwapActive, slot: "$to" },
  ],
}

export function cardEffect(
  sourceId: string,
  bucket: keyof CardEffects,
  name: string
): Expr {
  const entry = effects[sourceId]
  if (!entry || Array.isArray(entry)) return []
  return entry[bucket]?.[name] ?? []
}

export function trainerEffect(sourceId: string): Expr {
  const entry = effects[sourceId]
  return Array.isArray(entry) ? entry : []
}

// Written effect, or printed numeric damage through the attack pipeline.
export function attackExpr(
  sourceId: string,
  attack: { name: string; damage?: string | number | null }
): Expr {
  const written = cardEffect(sourceId, "attacks", attack.name)
  if (written.length > 0) return written
  const raw = attack.damage == null ? "" : String(attack.damage).trim()
  const base = Number(raw.replace(/[^0-9.-]/g, ""))
  if (!raw || !Number.isFinite(base) || base <= 0) return []
  return [
    { op: Op.Attack, base, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
  ]
}
