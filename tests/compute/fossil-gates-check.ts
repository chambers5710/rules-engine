import cards1 from "../../data/cards/base1.json" with { type: "json" }
import cards3 from "../../data/cards/base3.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op, type Expr } from "../../dsl.js"
import { runExpr } from "../../machine.js"
import { abilityBanned, tickModifiersEnter, tickModifiersEnd } from "../../modifiers.js"
import { swapActive } from "../../helpers.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard, attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"

const base1 = cards1 as Card[]
const base3 = cards3 as Card[]
const attacker = { player: 1, slot: "active" } as const
const defending = { player: 2, slot: "active" } as const

const headache: Expr = [
  {
    op: Op.ApplyModifier,
    slot: "$defending",
    field: "trainer_use",
    until: { beat: "end_of_turn", who: "owner" },
  },
]

const spacingOut: Expr = [
  {
    op: Op.If,
    slot: "$self_slot",
    filter: { kind: "has_counters", counters: 1 },
    then: [
      { op: Op.FlipCoin, bind: "$coin" },
      {
        op: Op.If,
        bind: "$coin",
        equals: "heads",
        then: [{ op: Op.ApplyDamage, amount: -10, slot: "$self_slot" }],
      },
    ],
  },
]

const stepIn: Expr = [
  {
    op: Op.If,
    slot: "$self_slot",
    filter: { kind: "benched" },
    then: [
      {
        op: Op.ApplyModifier,
        slot: "$self_slot",
        field: "ability_use",
        ban: "Step In",
        until: { beat: "end_of_turn", who: "owner" },
      },
      { op: Op.SwapActive, slot: "$self_slot" },
    ],
  },
]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function lists(gamestate: GameState, kind: Action, name?: string, player: 1 | 2 = 1) {
  return computeAvailableActions(gamestate).some(
    (action) =>
      action.kind === kind &&
      action.player === player &&
      (name === undefined || ("name" in action && action.name === name))
  )
}

async function stage(): Promise<GameState> {
  const duck = printed(base3, "base3-53")
  const slow = printed(base3, "base3-55")
  const dragon = printed(base3, "base3-4")
  const bill = printed(base1, "base1-91")
  const energy = printed(base1, "base1-100")
  let gamestate = await initBoard(
    [duck, slow, dragon, ...copies(energy, 15)],
    [printed(base1, "base1-58"), bill, ...copies(energy, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base3-53")
  gamestate = moveToBench(gamestate, 1, "base3-4", 0)
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1)
  gamestate = toHand(gamestate, 2, "base1-91", 1)
  gamestate = liveTurn(gamestate)
  gamestate = {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      "base3-53": { attacks: { Headache: headache, "Fury Swipes": [] } },
      "base3-55": { attacks: { "Spacing Out": spacingOut } },
      "base3-4": {
        abilities: { "Step In": stepIn },
        attacks: { Slam: [] },
      },
      "base1-91": gamestate.effectRegistry["base1-91"],
    },
  }
  return gamestate
}

{
  let gamestate = await stage()
  gamestate = runExpr(gamestate, headache, { bindings: { $self_slot: attacker, $defending: defending } }, 1, Action.Attack)
  gamestate = { ...gamestate, activePlayer: 2 }
  gamestate = tickModifiersEnter(gamestate, 2)
  expect(!lists(gamestate, Action.PlayTrainer, undefined, 2), "Headache hides opponent Trainers")
}

{
  let gamestate = await stage()
  gamestate = moveToBench(gamestate, 1, "base3-55", 1)
  gamestate = swapActive(gamestate, 1, 1)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1)
  expect(!lists(gamestate, Action.Attack, "Spacing Out"), "Spacing Out omitted with no damage")
  gamestate.players[1].active.damage = 10
  expect(lists(gamestate, Action.Attack, "Spacing Out"), "Spacing Out lists with a counter")
}

{
  let gamestate = await stage()
  gamestate = swapActive(gamestate, 1, 0)
  expect(!lists(gamestate, Action.Ability, "Step In"), "Step In omitted while Active")
}

{
  const gamestate = await stage()
  expect(lists(gamestate, Action.Ability, "Step In"), "Step In lists from the Bench")
}

{
  let gamestate = await stage()
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Ability && row.name === "Step In"
  )
  expect(!!action, "have Step In to run")
  gamestate = runExpr(gamestate, stepIn, { bindings: action!.seed ?? {} }, 1, Action.Ability)
  expect(abilityBanned(gamestate.players[1].active, "Step In"), "Step In bans itself after use")
}

{
  let gamestate = await stage()
  const goop: Expr = [
    {
      op: Op.Each,
      who: "both",
      among: "in_play",
      bind: "$seat",
      then: [
        {
          op: Op.ApplyModifier,
          slot: "$seat",
          field: "ability_use",
          ban: "all",
          until: { beat: "end_of_turn", who: "opponent" },
        },
      ],
    },
  ]
  gamestate = { ...gamestate, activePlayer: 2 }
  gamestate = runExpr(
    gamestate,
    goop,
    { bindings: { $self_slot: { player: 2, slot: "active" } } },
    2,
    Action.PlayTrainer,
  )
  expect(abilityBanned(gamestate.players[1].active, "Step In"), "Goop Gas bans both sides")
  expect(abilityBanned(gamestate.players[2].active, "Step In"), "Goop Gas bans the trainer's seats")
  gamestate = tickModifiersEnd(gamestate, 2)
  gamestate = { ...gamestate, activePlayer: 1 }
  expect(abilityBanned(gamestate.players[1].active, "Step In"), "Goop Gas lasts through your turn")
  expect(abilityBanned(gamestate.players[2].active, "Step In"), "Goop Gas still marks the opponent")
}

{
  let gamestate = await stage()
  gamestate = {
    ...gamestate,
    effectRegistry: {
      ...gamestate.effectRegistry,
      "base1-58": { powers: { "Toxic Gas": { kind: "ignore_powers" } } },
    },
  }
  expect(!lists(gamestate, Action.Ability, "Step In"), "Toxic Gas hides other Powers")
}

console.log("fossil-gates-check assertions passed")
