import base from "../../data/cards/base1.json" with { type: "json" }
import promo from "../../data/cards/basep.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, type InterpretCtx } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr } from "../../machine.js"
import { attackBanned, tickModifiersEnd, tickModifiersEnter } from "../../modifiers.js"
import { moveZoneToSlot } from "../../ops.js"
import { swapActive } from "../../helpers.js"
import type { Card, EffectRegistry, GameState } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"
import { validateExpr } from "../../validate.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function lists(gamestate: GameState, name: string): boolean {
  return computeAvailableActions(gamestate).some(
    (action) => action.kind === Action.Attack && action.name === name
  )
}

function seed(extra: Record<string, unknown> = {}): InterpretCtx["bindings"] {
  return {
    $self_slot: attacker,
    $defending: defending,
    $energy: { ...attacker, attachment: "energy" },
    $discard: { player: 1, zone: "discard" },
    ...extra,
  }
}

{
  const expr = registry["basep-19"]?.attacks?.["Synchronize"]
  if (!expr) fail("no Synchronize dump")
  const err = validateExpr(expr)
  expect(err === null, `Synchronize validate: ${err}`)
}

{
  const energy = printed(set, "base1-101")
  const same = initializeGameState(
    [printed(promos, "basep-19"), ...copies(energy, 40)],
    [printed(set, "base1-58"), ...copies(energy, 40)],
    registry
  )
  let gamestate = moveToActive(same, 1, "basep-19")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-101", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-101", 2)
  gamestate = liveTurn(gamestate)
  expect(lists(gamestate, "Synchronize"), "Synchronize lists when Energy counts match")

  const differ = initializeGameState(
    [printed(promos, "basep-19"), ...copies(energy, 40)],
    [printed(set, "base1-58"), ...copies(energy, 40)],
    registry
  )
  gamestate = moveToActive(differ, 1, "basep-19")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-101", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-101", 1)
  gamestate = liveTurn(gamestate)
  expect(!lists(gamestate, "Synchronize"), "Synchronize omitted when Energy counts differ")
  expect(lists(gamestate, "Pound"), "Pound still lists")
}

{
  const expr = registry["basep-45"]?.attacks?.["Slashing Strike"]
  if (!expr) fail("no Slashing Strike dump")
  const err = validateExpr(expr)
  expect(err === null, `Slashing Strike validate: ${err}`)
}

function scytherBoard(evoInHand = false): GameState {
  const grass = printed(set, "base1-99")
  let gamestate = initializeGameState(
    [printed(promos, "basep-45"), printed(set, "base1-58"), printed(set, "base1-60"), ...copies(grass, 40)],
    [printed(set, "base1-58"), ...copies(grass, 40)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-45")
  gamestate = moveToBench(gamestate, 1, "base1-58", 0)
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-99", 2)
  if (evoInHand) gamestate = toHand(gamestate, 1, "base1-60", 1)
  return liveTurn(gamestate)
}

function playSlash(gamestate: GameState): GameState {
  const expr = registry["basep-45"]?.attacks?.["Slashing Strike"]
  if (!expr) fail("no Slashing Strike dump")
  return runExpr(
    gamestate,
    expr,
    { via: "attack", attack: "Slashing Strike", bindings: seed() },
    1,
    Action.Attack
  )
}

{
  let gamestate = playSlash(scytherBoard())
  expect(gamestate.players[2].active.damage === 40, "Slashing Strike deals 40")
  const pending = gamestate.players[1].active.modifiers.find((m) => m.field === "attack_use")
  expect(!!pending && pending.phase === "pending", "next-turn ban starts pending")
  gamestate = tickModifiersEnd(gamestate, 1)
  expect(
    gamestate.players[1].active.modifiers.some((m) => m.field === "attack_use" && m.phase === "pending"),
    "own checkup does not lift a pending next-turn ban"
  )
  gamestate = tickModifiersEnter(gamestate, 1)
  expect(attackBanned(gamestate.players[1].active, "Slashing Strike"), "next turn activates the ban")
  expect(!lists(gamestate, "Slashing Strike"), "compute hides Slashing Strike next turn")
  gamestate = tickModifiersEnd(gamestate, 1)
  expect(!attackBanned(gamestate.players[1].active, "Slashing Strike"), "end of next turn lifts the ban")
}

{
  let gamestate = playSlash(scytherBoard())
  gamestate = swapActive(gamestate, 1, 0)
  expect(
    !gamestate.players[1].bench[0].modifiers.some((m) => m.field === "attack_use"),
    "benching ends Slashing Strike"
  )
  gamestate = swapActive(gamestate, 1, 0)
  gamestate = tickModifiersEnter(gamestate, 1)
  expect(lists(gamestate, "Slashing Strike"), "promoted Scyther may Slash again")
}

{
  let gamestate = playSlash(scytherBoard(true))
  const evo = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-60")
  expect(!!evo, "have a Pokémon in hand to land on the seat")
  gamestate = moveZoneToSlot(
    gamestate,
    evo!,
    { player: 1, zone: "hand" },
    { player: 1, slot: "active", attachment: "evolution" }
  )
  expect(
    !gamestate.players[1].active.modifiers.some((m) => m.field === "attack_use"),
    "evolve ends Slashing Strike"
  )
}

console.log("basep-softness-check assertions passed")
