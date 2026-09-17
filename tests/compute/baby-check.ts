import promo from "../../data/cards/basep.json" with { type: "json" }
import base from "../../data/cards/base1.json" with { type: "json" }
import dump from "../../../effect-author/effects/effects_basep.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action, Op } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { gatedAttack, stateMachine } from "../../machine.js"
import { moveZoneToZone } from "../../ops.js"
import { babyCoinOnAnnounce } from "../../reads.js"
import { sameSlot } from "../../board.js"
import type { Card, EffectRegistry, GameState, SlotId } from "../../types.js"
import { attachEnergy, copies, liveTurn, moveToActive, moveToBench, printed, toHand } from "../fixture.js"
import { validateExpr } from "../../validate.js"

const set = base as Card[]
const promos = promo as Card[]
const registry = dump as EffectRegistry
const emptyBench: SlotId = { player: 1, slot: "bench", index: 0 }

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function toDeck(gamestate: GameState, player: 1 | 2, sourceId: string): GameState {
  gamestate = toHand(gamestate, player, sourceId, 1)
  const card = gamestate.players[player].hand.find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
  if (!card) fail(`no ${sourceId} to put in deck`)
  return moveZoneToZone(
    gamestate,
    card,
    { player, zone: "hand" },
    { player, zone: "deck" },
    "bottom"
  )
}

function attackNamed(gamestate: GameState, name: string) {
  return computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Attack && row.name === name
  )
}

{
  const expr = registry["basep-35"]?.attacks?.["Let's Play!"]
  expect((expr?.length ?? 0) > 0, "basep-35 Let's Play!: missing dump row")
  const err = validateExpr(expr!)
  expect(err === null, `basep-35 Let's Play!: ${err}`)
}

{
  const energy = printed(set, "base1-97")
  let gamestate = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), printed(set, "base1-58"), ...copies(energy, 16)],
    registry,
    "wotc-neo"
  )
  gamestate = moveToActive(gamestate, 1, "base1-52")
  gamestate = moveToActive(gamestate, 2, "basep-35")
  gamestate = moveToBench(gamestate, 2, "base1-58", 0)
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
  gamestate = liveTurn(gamestate)
  expect(babyCoinOnAnnounce(gamestate, 1), "Active Baby forces the announce coin")
  const pichu = gamestate.players[2].active
  const basic = gamestate.players[2].bench[0]
  gamestate = {
    ...gamestate,
    players: {
      ...gamestate.players,
      2: { ...gamestate.players[2], active: basic, bench: [pichu, ...gamestate.players[2].bench.slice(1)] },
    },
  }
  expect(!babyCoinOnAnnounce(gamestate, 1), "benched Baby does not")
}

{
  const energy = printed(set, "base1-97")
  let gamestate = initializeGameState(
    [printed(set, "base1-52"), ...copies(energy, 17)],
    [printed(promos, "basep-35"), ...copies(printed(set, "base1-58"), 17)],
    registry,
    "wotc-neo"
  )
  gamestate = moveToActive(gamestate, 1, "base1-52")
  gamestate = moveToActive(gamestate, 2, "basep-35")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
  gamestate = liveTurn(gamestate)
  const action = attackNamed(gamestate, "Low Kick")
  if (!action || action.kind !== Action.Attack) fail("no Low Kick")
  const tails = gatedAttack(gamestate, action, { bindings: {}, script: { coins: ["tails"] } })
  expect(tails.players[2].active.damage === 0, "Baby tails: no attack")
  expect(
    tails.history.some((entry) => entry.op === Op.FlipCoin) &&
      !tails.history.some((entry) => entry.op === Op.Attack),
    "Baby tails: flip only"
  )
  expect(tails.activePlayer === 2, "Baby tails ends the turn")
  const heads = gatedAttack(gamestate, action, { bindings: {}, script: { coins: ["heads"] } })
  expect(heads.players[2].active.damage === 20, "Baby heads: the attack runs")
}

{
  const lightning = printed(set, "base1-100")
  let gamestate = initializeGameState(
    [
      printed(promos, "basep-35"),
      printed(promos, "basep-36"),
      printed(set, "base1-58"),
      ...copies(lightning, 15),
    ],
    [printed(set, "base1-58"), ...copies(lightning, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-35")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1)
  gamestate = toDeck(gamestate, 1, "basep-36")
  gamestate = toDeck(gamestate, 1, "base1-58")
  gamestate = liveTurn(gamestate)
  expect(!babyCoinOnAnnounce(gamestate, 1), "Let's Play does not coin against a Basic")
  const play = attackNamed(gamestate, "Let's Play!")
  if (!play) fail("no Let's Play!")
  gamestate = stateMachine(gamestate, play)
  const seat = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "slots" && sameSlot(row.slot, emptyBench)
  )
  if (!seat) fail("no empty bench")
  gamestate = stateMachine(gamestate, seat)
  const babies = computeAvailableActions(gamestate).filter(
    (row) => row.kind === Action.Choose && row.pick === "cards"
  )
  expect(babies.length === 1, "Let's Play lists only Baby Pokémon")
  const pick = babies[0]
  if (pick.kind !== Action.Choose || pick.pick !== "cards") fail("no Igglybuff")
  expect(gamestate.cardRegistry[pick.card]?.sourceId === "basep-36", "Igglybuff is the only card")
  gamestate = stateMachine(gamestate, pick)
  expect(gamestate.players[1].bench[0].evolution.length === 1, "Baby lands on the bench")
  expect(
    gamestate.cardRegistry[gamestate.players[1].bench[0].evolution[0]]?.sourceId === "basep-36",
    "Igglybuff is the search"
  )
}

{
  const lightning = printed(set, "base1-100")
  const pidgey = printed(set, "base1-58")
  let gamestate = initializeGameState(
    [printed(promos, "basep-35"), ...copies(pidgey, 5), ...copies(lightning, 12)],
    [pidgey, ...copies(lightning, 17)],
    registry
  )
  gamestate = moveToActive(gamestate, 1, "basep-35")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  for (let i = 0; i < 5; i++) gamestate = moveToBench(gamestate, 1, "base1-58", i as 0 | 1 | 2 | 3 | 4)
  gamestate = attachEnergy(gamestate, 1, "base1-100", 1)
  gamestate = liveTurn(gamestate)
  expect(attackNamed(gamestate, "Let's Play!") == null, "full Bench omits Let's Play!")
}

console.log("baby-check assertions passed")
