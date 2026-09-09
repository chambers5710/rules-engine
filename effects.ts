import { Op, type Expr } from "./dsl.js"
import { DAMAGE_COUNTER } from "./types.js"

// Card effects — printed card id → named exprs (attacks, abilities, …)
// Later: optional evenIf / require next to the expr so compute can override defaults (e.g. usable while Asleep).
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

export const effects: Record<string, CardEffects> = {
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
        { op: Op.Count, slot: "$self_slot", attachment: "energy", filter: { kind: "energy", type: "Water" }, as: "energy_value", bind: "$water" },
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
}

export function cardEffect(
  sourceId: string,
  bucket: keyof CardEffects,
  name: string
): Expr {
  return effects[sourceId]?.[bucket]?.[name] ?? []
}
