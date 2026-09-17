import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type Expr } from "../../dsl.js"
import { discardSlot } from "../../helpers.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr } from "../../machine.js"
import { attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"
import type { Card, EffectRegistry, GameState, SlotId } from "../../types.js"
import { validateExpr } from "../../validate.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function attack(name: string): Expr {
  const expr = registry["basep-46"]?.attacks?.[name]
  expect((expr?.length ?? 0) > 0, `basep-46 ${name}: missing dump row`)
  const err = validateExpr(expr!)
  expect(err === null, `basep-46 ${name}: ${err}`)
  return expr!
}

function mark(gamestate: GameState, dest: SlotId): GameState {
  const write = attack("Lightning Rod").filter((step) => step.op !== Op.Select)
  return runExpr(gamestate, write, { bindings: { $to: dest } }, 1, Action.Attack)
}

function bolt(gamestate: GameState): GameState {
  return runExpr(
    gamestate,
    attack("Lightning Bolt"),
    { bindings: { $self_slot: { player: 1, slot: "active" } } },
    1,
    Action.Attack
  )
}

function stage(): GameState {
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(promos, "basep-46"), printed(set, "base1-46"), printed(set, "base1-24"), ...copies(energy, 15)],
    [printed(set, "base1-58"), printed(set, "base1-63"), ...copies(energy, 16)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-46")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = moveToBench(gamestate, 2, "base1-63", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  return liveTurn(gamestate)
}

{
  let gamestate = stage()
  const active = { player: 2, slot: "active" } as const
  gamestate = mark(gamestate, active)
  expect(gamestate.players[2].active.markers.join() === "Lightning Rod", "puts the named marker on the seat")
  const once = gamestate.history.filter((entry) => entry.op === Op.ApplyMarker).length
  gamestate = mark(gamestate, active)
  expect(gamestate.players[2].active.markers.join() === "Lightning Rod", "one of that name per seat")
  expect(
    gamestate.history.filter((entry) => entry.op === Op.ApplyMarker).length === once,
    "a second put of the same name is a no-op"
  )
}

{
  let gamestate = stage()
  gamestate = mark(gamestate, { player: 2, slot: "active" })
  gamestate = mark(gamestate, { player: 2, slot: "bench", index: 0 })
  expect(gamestate.players[2].active.markers.includes("Lightning Rod"), "Active keeps its marker")
  expect(gamestate.players[2].bench[0].markers.includes("Lightning Rod"), "bench can have the same name")
  gamestate = bolt(gamestate)
  expect(gamestate.players[2].active.damage === 20, "Bolt hits a marked Active")
  expect(gamestate.players[2].bench[0].damage === 40, "Bolt applies W/R on a marked bench")
  expect(gamestate.players[1].active.damage === 0, "unmarked attacker is not hit")
}

{
  let gamestate = stage()
  expect(
    computeAvailableActions(gamestate).some((row) => row.kind === Action.Attack && row.name === "Lightning Bolt"),
    "Bolt still lists with no markers"
  )
  gamestate = bolt(gamestate)
  expect(gamestate.players[2].active.damage === 0, "no marker, no hit")
  expect(gamestate.players[2].bench[0].damage === 0, "unmarked bench is not hit")
}

{
  let gamestate = stage()
  gamestate = mark(gamestate, { player: 2, slot: "active" })
  gamestate = discardSlot(gamestate, { player: 2, slot: "active" })
  expect(gamestate.players[2].active.markers.length === 0, "leave play clears markers with the pile")
}

{
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [printed(set, "base1-46"), printed(set, "base1-24"), ...copies(energy, 16)],
    [printed(set, "base1-58"), ...copies(energy, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "base1-46")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-24", 1)
  gamestate = liveTurn(gamestate)
  gamestate = mark(gamestate, { player: 1, slot: "active" })
  const card = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-24")
  if (!card) fail("Charmeleon not in hand")
  gamestate = runExpr(
    gamestate,
    [{
      op: Op.MoveZoneToSlot,
      card,
      source: { player: 1, zone: "hand" },
      dest: { player: 1, slot: "active" },
      attachment: "evolution",
    }],
    { bindings: {} },
    1,
    Action.Evolve
  )
  expect(gamestate.players[1].active.markers.join() === "Lightning Rod", "evolve keeps the seat marker")
}

console.log("marker-check assertions passed")
