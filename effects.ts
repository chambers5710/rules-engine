import { Op, type Expr } from "./dsl.js"

// Card effects — printed card id → named exprs (attacks, abilities, …)
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

export const effects: Record<string, CardEffects> = {
  // Chansey — first Basic Pokémon in base1
  "base1-3": {
    attacks: {
      // Scrunch — prevent-all-damage next turn is not an op yet
      "Scrunch": [{ op: Op.FlipCoin, bind: "$coin" }],
      "Double-edge": [
        { op: Op.Attack, base: 80, from: "$self_slot", to: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyDamage, amount: 80, slot: "$self_slot" },
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
