import { currentForm, getSlot, opponent, pokemonInPlay, sameSlot } from "./board.js"
import { clockActivates, clockExpires } from "./clock.js"
import type { Expr, InterpretCtx } from "./dsl.js"
import { mayUsePokemonPower, powersSuppressed } from "./reads.js"
import type { DamageVia, GameEvent, GameState, SlotId } from "./types.js"

export type TriggerJob = {
  seat: SlotId
  then: Expr
  drop?: string
  attacker?: SlotId
  applied?: number
  retreated?: SlotId
}

export function triggerCtx(job: TriggerJob): InterpretCtx {
  const player = job.seat.player
  return {
    via: "trigger",
    bindings: {
      $self_slot: job.seat,
      $defending: { player: opponent(player), slot: "active" },
      $hand: { player, zone: "hand" },
      $deck: { player, zone: "deck" },
      $discard: { player, zone: "discard" },
      $prize: { player, zone: "prize" },
      $opp_hand: { player: opponent(player), zone: "hand" },
      $opp_deck: { player: opponent(player), zone: "deck" },
      $opp_discard: { player: opponent(player), zone: "discard" },
      $opp_prize: { player: opponent(player), zone: "prize" },
      ...(job.attacker ? { $attacker: job.attacker } : {}),
      ...(job.applied != null ? { $applied: job.applied } : {}),
      ...(job.retreated ? { $retreated: job.retreated } : {}),
    },
  }
}

export function applyDamageVia(
  ctx: InterpretCtx,
  slot: SlotId,
  source?: "poison" | "burn"
): DamageVia {
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

// Standing damage: only the damaged instance. Play: only the played seat. Evolve / retreat: in-play listeners.
export function matchTriggers(gamestate: GameState, event: GameEvent): TriggerJob[] {
  if (event.kind === "damage_applied") {
    if (event.source && event.source.player === event.target.player) return []
    const jobs: TriggerJob[] = []
    const slot = getSlot(gamestate, event.target)
    const form = currentForm(gamestate, slot)
    const triggers = form && form.instanceId === event.targetCard
      ? gamestate.effectRegistry[form.sourceId]?.triggers
      : undefined
    if (triggers) {
      for (const spec of Object.values(triggers)) {
        if (spec.when !== "damage_applied") continue
        if (!spec.via.includes(event.via)) continue
        if ((event.applied ?? 0) < (spec.minApplied ?? 0)) continue
        if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
        jobs.push({ seat: event.target, then: spec.then, attacker: event.source, applied: event.applied })
      }
    }
    for (const sub of gamestate.subscriptions) {
      if (sub.phase !== "active") continue
      const spec = sub.trigger
      if (spec.when !== "damage_applied") continue
      if (event.targetCard !== sub.sourceCard) continue
      if (!spec.via.includes(event.via)) continue
      if ((event.applied ?? 0) < (spec.minApplied ?? 0)) continue
      if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
      jobs.push({
        seat: event.target,
        then: spec.then,
        attacker: event.source,
        applied: event.applied,
      })
    }
    return jobs
  }
  if (event.kind === "pokemon_knocked_out") {
    const jobs: TriggerJob[] = []
    const slot = getSlot(gamestate, event.target)
    const form = currentForm(gamestate, slot)
    const standing = form && form.instanceId === event.targetCard
      ? gamestate.effectRegistry[form.sourceId]?.triggers
      : undefined
    if (standing) {
      for (const spec of Object.values(standing)) {
        if (spec.when !== "pokemon_knocked_out") continue
        if (!spec.via.includes(event.via)) continue
        if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
        jobs.push({ seat: event.target, then: spec.then, attacker: event.source })
      }
    }
    for (const sub of gamestate.subscriptions) {
      if (sub.phase !== "active") continue
      const spec = sub.trigger
      if (spec.when !== "pokemon_knocked_out") continue
      if (event.targetCard !== sub.sourceCard) continue
      if (!spec.via.includes(event.via)) continue
      jobs.push({ seat: event.target, then: spec.then, drop: sub.id, attacker: event.source })
    }
    return jobs
  }
  if (event.kind === "played") {
    const slot = getSlot(gamestate, event.target)
    const form = currentForm(gamestate, slot)
    const triggers = form && form.instanceId === event.targetCard
      ? gamestate.effectRegistry[form.sourceId]?.triggers
      : undefined
    if (!triggers) return []
    return Object.values(triggers).flatMap((spec) => {
      if (spec.when !== "played") return []
      if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) return []
      return [{ seat: event.target, then: spec.then }]
    })
  }
  if (event.kind !== "evolved" && event.kind !== "retreated") return []
  const jobs: TriggerJob[] = []
  for (const player of [1, 2] as const) {
    for (const seat of pokemonInPlay(gamestate, player)) {
      const slot = getSlot(gamestate, seat)
      const form = currentForm(gamestate, slot)
      const triggers = form ? gamestate.effectRegistry[form.sourceId]?.triggers : undefined
      if (!triggers) continue
      for (const spec of Object.values(triggers)) {
        if (spec.when !== event.kind) continue
        if (event.kind === "retreated" && seat.player === event.target.player) continue
        if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
        jobs.push({
          seat,
          then: spec.then,
          ...(event.kind === "retreated" ? { retreated: event.target } : {}),
        })
      }
    }
  }
  return jobs
}
