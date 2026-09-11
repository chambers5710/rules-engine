import { currentForm, getSlot, pokemonInPlay } from "./board.js"
import { pokemonPowerBlocked } from "./compute.js"
import { cardTriggers } from "./effects.js"
import { lastDamageFrom } from "./history.js"
import { interpret, type InterpretCtx } from "./interpret.js"
import type { GameState, SlotId } from "./types.js"

const PLAYERS = [1, 2] as const

export function seatKey(id: SlotId) {
  return id.slot === "active" ? `${id.player}-a` : `${id.player}-b-${id.index}`
}

export function snapshotPowerReady(gamestate: GameState): Set<string> {
  const ready = new Set<string>()
  for (const player of PLAYERS) {
    for (const id of pokemonInPlay(gamestate, player)) {
      const slot = getSlot(gamestate, id)
      const form = currentForm(gamestate, slot)
      if (!form) continue
      if (cardTriggers(form.sourceId, "damaged_by_attack").length === 0) continue
      if (pokemonPowerBlocked(slot)) continue
      ready.add(seatKey(id))
    }
  }
  return ready
}

export function fireDamagedByAttack(
  gamestate: GameState,
  slot: SlotId,
  ctx: InterpretCtx
): GameState {
  if (ctx.inTrigger || !ctx.attacker || !ctx.powerReady?.has(seatKey(slot))) return gamestate
  const form = currentForm(gamestate, getSlot(gamestate, slot))
  if (!form) return gamestate
  const nested: InterpretCtx = {
    ...ctx,
    inTrigger: true,
    bindings: { ...ctx.bindings, $self_slot: slot, $attacker: ctx.attacker },
  }
  for (const row of cardTriggers(form.sourceId, "damaged_by_attack")) {
    for (const step of row.then) {
      gamestate = interpret(gamestate, step, nested)
    }
  }
  return gamestate
}

export function fireKnockoutBond(gamestate: GameState, slot: SlotId): GameState {
  const armed = getSlot(gamestate, slot).armed.filter(
    (row) => row.when === "ko" && row.phase === "active"
  )
  if (armed.length === 0) return gamestate
  const source = lastDamageFrom(gamestate, slot)
  if (!source) return gamestate
  const ctx: InterpretCtx = {
    inTrigger: true,
    bindings: { $self_slot: slot, $source: source, $attacker: source },
  }
  for (const row of armed) {
    for (const step of row.then) {
      gamestate = interpret(gamestate, step, ctx)
    }
  }
  return gamestate
}
