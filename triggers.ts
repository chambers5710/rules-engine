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

// Standing damage: only the damaged instance. Evolve: any in-play seat whose current form lists `when: evolved`.
export function matchTriggers(gamestate: GameState, event: GameEvent): TriggerJob[] {
  if (event.kind === "damage_applied") {
    if (event.source && event.source.player === event.target.player) return []
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
      return [{ seat: event.target, then: spec.then, attacker: event.source }]
    })
  }
  if (event.kind === "pokemon_knocked_out") {
    return gamestate.subscriptions.flatMap((sub) => {
      if (sub.phase !== "active") return []
      const spec = sub.trigger
      if (spec.when !== "pokemon_knocked_out") return []
      if (event.targetCard !== sub.sourceCard) return []
      if (!spec.via.includes(event.via)) return []
      return [{ seat: event.target, then: spec.then, drop: sub.id, attacker: event.source }]
    })
  }
  if (event.kind !== "evolved") return []
  const jobs: TriggerJob[] = []
  for (const player of [1, 2] as const) {
    for (const seat of pokemonInPlay(gamestate, player)) {
      const slot = getSlot(gamestate, seat)
      const form = currentForm(gamestate, slot)
      const triggers = form ? gamestate.effectRegistry[form.sourceId]?.triggers : undefined
      if (!triggers) continue
      for (const spec of Object.values(triggers)) {
        if (spec.when !== "evolved") continue
        if (spec.blockedByStatus && (!mayUsePokemonPower(slot) || powersSuppressed(gamestate))) continue
        jobs.push({ seat, then: spec.then })
      }
    }
  }
  return jobs
}
