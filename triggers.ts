import { currentForm, getSlot, sameSlot } from "./board.js"
import { clockActivates, clockExpires } from "./clock.js"
import type { Expr, InterpretCtx } from "./dsl.js"
import { mayUsePokemonPower, powersSuppressed } from "./reads.js"
import type { GameEvent, GameState, SlotId } from "./types.js"

export type TriggerJob = {
  seat: SlotId
  then: Expr
  drop?: string
}

export function applyDamageVia(
  ctx: InterpretCtx,
  slot: SlotId,
  source?: "poison" | "burn"
): GameEvent["via"] {
  if (source === "poison" || source === "burn") return source
  if (ctx.via === "trigger") return "trigger"
  if (ctx.via === "attack") {
    const self = ctx.bindings.$self_slot as SlotId | undefined
    return self && sameSlot(self, slot) ? "recoil" : "splash"
  }
  return "effect"
}

export function tickSubscriptionsEnter(gamestate: GameState, activePlayer: 1 | 2): GameState {
  return {
    ...gamestate,
    subscriptions: gamestate.subscriptions.map((sub) =>
      clockActivates(sub, activePlayer) ? { ...sub, phase: "active" as const } : sub
    ),
  }
}

export function tickSubscriptionsEnd(gamestate: GameState, endingPlayer: 1 | 2): GameState {
  return {
    ...gamestate,
    subscriptions: gamestate.subscriptions.filter((sub) => !clockExpires(sub, endingPlayer)),
  }
}

// Standing: only the damaged instance. Temporary: only an active bond on that instance.
export function matchTriggers(gamestate: GameState, event: GameEvent): TriggerJob[] {
  if (event.source && event.source.player === event.target.player) return []
  if (event.kind === "damage_applied") {
    const slot = getSlot(gamestate, event.target)
    const form = currentForm(gamestate, slot)
    const triggers = form && form.instanceId === event.targetCard
      ? gamestate.effectRegistry[form.sourceId]?.triggers
      : undefined
    if (!triggers) return []
    return Object.values(triggers).flatMap((spec) => {
      if (spec.when !== "damage_applied") return []
      if (!spec.via.includes(event.via)) return []
      if ((event.applied ?? 0) < (spec.minApplied ?? 0)) return []
      if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) return []
      return [{ seat: event.target, then: spec.then }]
    })
  }
  if (event.kind !== "pokemon_knocked_out") return []
  return gamestate.subscriptions.flatMap((sub) => {
    if (sub.phase !== "active") return []
    const spec = sub.trigger
    if (spec.when !== "pokemon_knocked_out") return []
    if (event.targetCard !== sub.sourceCard) return []
    if (!spec.via.includes(event.via)) return []
    return [{ seat: event.target, then: spec.then, drop: sub.id }]
  })
}
