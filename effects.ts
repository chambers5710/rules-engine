import { Op, type Expr } from "./dsl.js"
import { printedAttackDamage } from "./survey.js"
import { type EffectRegistry, type SourceId } from "./types.js"

// Pokémon maps on a registry entry. Trainer maps live on EffectEntry.trainer.
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

export function cardEffect(
  registry: EffectRegistry,
  sourceId: SourceId,
  effectType: keyof CardEffects,
  name: string
): Expr {
  return registry[sourceId]?.[effectType]?.[name] ?? []
}

export function trainerEffect(
  registry: EffectRegistry,
  sourceId: SourceId
): Expr {
  const named = registry[sourceId]?.trainer
  if (!named) return []
  return Object.values(named)[0] ?? []
}

export function trainerAttaches(
  registry: EffectRegistry,
  sourceId: SourceId
): boolean {
  return trainerEffect(registry, sourceId).some(
    (step) => step.op === Op.MoveZoneToSlot && step.attachment === "tools"
  )
}

// Written effect, or whole-string integer damage with empty extra text.
export function attackExpr(
  registry: EffectRegistry,
  sourceId: SourceId,
  attack: { name: string; damage?: string | number | null; text?: string | null }
): Expr {
  const written = cardEffect(registry, sourceId, "attacks", attack.name)
  if (written.length > 0) return written
  const base = printedAttackDamage(attack.damage)
  if (base <= 0) return []
  if (String(attack.text ?? "").trim() !== "") return []
  return [
    { op: Op.Attack, base, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
  ]
}
