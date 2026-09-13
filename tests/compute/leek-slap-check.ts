import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type Expr, type InterpretCtx } from "../../dsl.js"
import { discardSlot, swapActive } from "../../helpers.js"
import { initializeGameState } from "../../initialize.js"
import { runExpr } from "../../machine.js"
import { attackBanned, tickModifiersEnd } from "../../modifiers.js"
import { moveZoneToSlot } from "../../ops.js"
import type { Card, GameState } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const set = cards as Card[]
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

const leekSlap: Expr = [
  { op: Op.FlipCoin, bind: "$coin" },
  {
    op: Op.ApplyModifier,
    slot: "$self_slot",
    field: "attack_use",
    ban: "Leek Slap",
    until: { beat: "leave_play" },
  },
  {
    op: Op.If,
    bind: "$coin",
    equals: "heads",
    then: [
      { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    ],
  },
]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function stage(): GameState {
  const fetch = printed(set, "base1-27")
  const bench = printed(set, "base1-60")
  const extra = printed(set, "base1-57")
  const energy = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [fetch, bench, extra, ...copies(energy, 15)],
    [printed(set, "base1-58"), ...copies(energy, 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-27")
  gamestate = moveToBench(gamestate, 1, "base1-60", 0)
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1)
  gamestate = liveTurn(gamestate)
  gamestate = {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      "base1-27": { attacks: { "Leek Slap": leekSlap } },
    },
  }
  return gamestate
}

function play(gamestate: GameState, coin: "heads" | "tails"): GameState {
  const ctx: InterpretCtx = {
    via: "attack",
    script: { coins: [coin] },
    bindings: { $self_slot: attacker, $defending: defending },
  }
  return runExpr(gamestate, leekSlap, ctx, 1, Action.Attack)
}

function listsLeekSlap(gamestate: GameState): boolean {
  return computeAvailableActions(gamestate).some(
    (action) => action.kind === Action.Attack && action.name === "Leek Slap"
  )
}

{
  const gamestate = play(stage(), "heads")
  expect(gamestate.players[2].active.damage === 30, "heads deals 30")
  expect(attackBanned(gamestate.players[1].active, "Leek Slap"), "heads bans Leek Slap")
  expect(!listsLeekSlap(liveTurn(gamestate)), "compute hides Leek Slap after heads")
}

{
  const gamestate = play(stage(), "tails")
  expect(gamestate.players[2].active.damage === 0, "tails deals nothing")
  expect(attackBanned(gamestate.players[1].active, "Leek Slap"), "tails still bans Leek Slap")
  expect(!listsLeekSlap(liveTurn(gamestate)), "compute hides Leek Slap after tails")
}

{
  let gamestate = play(stage(), "heads")
  gamestate = tickModifiersEnd(gamestate, 1)
  gamestate = tickModifiersEnd(gamestate, 2)
  expect(attackBanned(gamestate.players[1].active, "Leek Slap"), "end of turn does not lift the ban")
}

{
  let gamestate = play(stage(), "heads")
  gamestate = swapActive(gamestate, 1, 0)
  expect(attackBanned(gamestate.players[1].bench[0], "Leek Slap"), "ban survives the bench")
  expect(!attackBanned(gamestate.players[1].active, "Leek Slap"), "the other seat is not banned")
}

{
  let gamestate = play(stage(), "heads")
  gamestate = toHand(gamestate, 1, "base1-57", 1)
  const evo = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-57")
  expect(!!evo, "have a Pokémon in hand to land on the seat")
  gamestate = moveZoneToSlot(
    gamestate,
    evo!,
    { player: 1, zone: "hand" },
    { player: 1, slot: "active", attachment: "evolution" }
  )
  expect(
    !gamestate.players[1].active.modifiers.some((m) => m.field === "attack_use"),
    "evolve clears leave_play ban"
  )
}

{
  let gamestate = play(stage(), "heads")
  gamestate = discardSlot(gamestate, attacker)
  expect(gamestate.players[1].active.modifiers.length === 0, "leave play clears the ban")
}

console.log("leek-slap-check assertions passed")
