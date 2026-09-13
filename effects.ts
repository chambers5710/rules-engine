import { Op, type Expr, type Primitive } from "./dsl.js"
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
  ]
}

function isSelfEnergySelect(step: Primitive): boolean {
  return step.op === Op.Select && step.pick === "cards" && step.source === "$energy"
}

function isSelfEnergyDiscard(step: Primitive): boolean {
  return step.op === Op.MoveSlotToZone && step.source === "$energy"
}

function isSelfEnergyCount(step: Primitive): boolean {
  return (
    step.op === Op.Count &&
    step.kind === "cards" &&
    "slot" in step &&
    step.slot === "$self_slot" &&
    step.attachment === "energy"
  )
}

function isStripEnergyLoop(step: Primitive): boolean {
  return step.op === Op.Loop && step.then.some(isSelfEnergyDiscard)
}

/** Metronome honesty: drop leading self-Energy pay and literal self recoil. */
export function honestCopy(expr: Expr): Expr {
  let i = 0
  while (i < expr.length) {
    if (isSelfEnergySelect(expr[i]) && expr[i + 1] && isSelfEnergyDiscard(expr[i + 1])) {
      i += 2
      continue
    }
    if (isSelfEnergyCount(expr[i]) && expr[i + 1] && isStripEnergyLoop(expr[i + 1])) {
      i += 2
      continue
    }
    break
  }
  return expr.slice(i).filter((step) => {
    if (step.op !== Op.ApplyDamage) return true
    if (step.slot !== "$self_slot") return true
    return typeof step.amount !== "number" || step.amount <= 0
  })
}
