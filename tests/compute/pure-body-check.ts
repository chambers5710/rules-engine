import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import fossil from "../../data/cards/base3.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import fossilDump from "../../../effect-author/effects/effects_base3.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { stateMachine } from "../../machine.js"
import { applyStatus } from "../../ops.js"
import { sameSlot } from "../../board.js"
import type { Card, EffectRegistry, GameState, SlotId } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const set = base as Card[]
const promos = promo as Card[]
const fossils = fossil as Card[]
const registry = { ...dump, "base3-13": fossilDump["base3-13"] } as EffectRegistry

const suicune: SlotId = { player: 1, slot: "active" }
const bench: SlotId = { player: 1, slot: "bench", index: 0 }

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function attachAction(gamestate: GameState, sourceId: string, slot: SlotId) {
  return computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.AttachEnergy &&
      gamestate.cardRegistry[row.card].sourceId === sourceId &&
      sameSlot(row.slot, slot)
  )
}

function listsAttach(gamestate: GameState, sourceId: string, slot: SlotId): boolean {
  return attachAction(gamestate, sourceId, slot) != null
}

function stage(): GameState {
  const water = printed(set, "base1-102")
  const lightning = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [
      printed(promos, "basep-53"),
      printed(set, "base1-58"),
      ...copies(water, 10),
      ...copies(lightning, 6),
    ],
    [printed(set, "base1-58"), ...copies(lightning, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-53")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = toHand(gamestate, 1, "base1-102", 2)
  gamestate = toHand(gamestate, 1, "base1-100", 1)
  return liveTurn(gamestate)
}

{
  const spec = registry["basep-53"]?.powers?.["Pure Body"]
  expect(spec?.kind === "attach_energy", "Pure Body is attach_energy")
  expect(spec?.kind === "attach_energy" && spec.type === "Water", "Pure Body taxes Water")
}

{
  const gamestate = stage()
  expect(!listsAttach(gamestate, "base1-102", suicune), "no Water onto empty Suicune")
  expect(listsAttach(gamestate, "base1-102", bench), "Water onto another seat is free")
  expect(listsAttach(gamestate, "base1-100", suicune), "Lightning onto Suicune is free")
  const lightning = attachAction(gamestate, "base1-100", suicune)
  expect(lightning != null && lightning.expr.length === 1, "untaxed attach has no discard Select")
}

{
  let gamestate = stage()
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1, suicune)
  gamestate = { ...gamestate, energyAttachedThisTurn: false }
  expect(listsAttach(gamestate, "base1-102", suicune), "Water lists once Suicune has Energy")
  const before = gamestate.players[1].active.energy.length
  const action = attachAction(gamestate, "base1-102", suicune)
  if (!action) fail("no taxed Water attach")
  gamestate = stateMachine(gamestate, action)
  expect(gamestate.actionStack.length === 1, "discard Select pauses after the attach")
  expect(gamestate.players[1].active.energy.length === before + 1, "Water landed before the discard")
  const pick = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "cards"
  )
  if (!pick) fail("no energy to discard")
  gamestate = stateMachine(gamestate, pick)
  expect(gamestate.actionStack.length === 0, "tax does not deadlock")
  expect(gamestate.players[1].active.energy.length === before, "discard one after attach")
  expect(gamestate.energyAttachedThisTurn, "once-per-turn attach still spent")
}

{
  let gamestate = stage()
  const water = computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.AttachEnergy &&
      gamestate.cardRegistry[row.card].sourceId === "base1-102" &&
      sameSlot(row.slot, suicune)
  )
  expect(water == null, "compute omits empty-Suicune Water")
  const hand = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-102")
  if (!hand) fail("no Water in hand")
  const forged = {
    kind: Action.AttachEnergy,
    player: 1 as const,
    card: hand,
    slot: suicune,
    expr: [
      {
        op: Op.MoveZoneToSlot,
        card: hand,
        source: { player: 1 as const, zone: "hand" as const },
        dest: suicune,
        attachment: "energy" as const,
      },
    ],
  }
  const next = stateMachine(gamestate, forged)
  expect(next.players[1].active.energy.length === 0, "machine fail-closes empty-Suicune Water")
  expect(!next.energyAttachedThisTurn, "fail-close does not spend the attach")
}

{
  let gamestate = stage()
  gamestate = applyStatus(gamestate, "asleep", suicune)
  const action = attachAction(gamestate, "base1-102", suicune)
  expect(action != null && action.expr.length === 1, "Asleep turns the tax off")
}

{
  let gamestate = initializeGameState(
    [
      printed(promos, "basep-53"),
      ...copies(printed(set, "base1-102"), 16),
    ],
    [printed(fossils, "base3-13"), ...copies(printed(set, "base1-100"), 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-53")
  gamestate = moveToActive(gamestate, 2, "base3-13")
  gamestate = toHand(gamestate, 1, "base1-102", 1)
  gamestate = liveTurn(gamestate)
  const action = attachAction(gamestate, "base1-102", suicune)
  expect(action != null && action.expr.length === 1, "Toxic Gas turns the tax off")
}

console.log("pure-body-check assertions passed")
