import { Op, type Expr } from "./dsl.js"

// Card effects — printed card id → named exprs (attacks, abilities, …)
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

export const effects: Record<string, CardEffects> = {
  // Chansey — first Basic Pokémon in base1
  "base1-1": {
    attacks: {
      "Confuse Ray": [
        { op: Op.Attack, base: 30, from: "$self_slot", to: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "confused", slot: "$defending" }
          ]
        },
      ]
    }
  },
  "base1-2": {
    attacks: {
      "Hydro Pump": [
        { op: Op.Count, from: "$self_slot", attachment: "energy", filter: { kind: "energy_type", type: "Water" }, as: "energy_value", bind: "$water" },
        { op: Op.Calc, fn: "sub", a: "$water", b: 3, bind: "$extra" },
        { op: Op.Calc, fn: "max", a: "$extra", b: 0, bind: "$extra" },
        { op: Op.Calc, fn: "min", a: "$extra", b: 2, bind: "$extra" },
        { op: Op.Calc, fn: "mul", a: "$extra", b: 10, bind: "$bonus" },
        { op: Op.Calc, fn: "add", a: 40, b: "$bonus", bind: "$base" },
        { op: Op.Attack, base: "$base", from: "$self_slot", to: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
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
        { op: Op.Attack, base: 80, from: "$self_slot", to: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyDamage, amount: 80, slot: "$self_slot" },
      ],
    },
  },
  "base1-5": {
    attacks: {
      "Sing": [
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "sleep", slot: "$defending" }
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
