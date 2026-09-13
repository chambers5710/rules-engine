import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { applyStatus, moveZoneToSlot, moveZoneToZone } from "../../ops.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

const names = [
  "trainers",
  "leek",
  "metronome",
  "recoil",
  "water",
  "thrash",
  "punch",
  "gas",
  "withdraw",
] as const
type Name = (typeof names)[number]

const FIGHTING = "base1-97"
const FIRE = "base1-98"
const GRASS = "base1-99"
const LIGHTNING = "base1-100"
const WATER = "base1-102"
const DUMMY = "base1-58"

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "trainers"
}

function toDiscard(gamestate: GameState, player: 1 | 2, sourceId: string): GameState {
  gamestate = toHand(gamestate, player, sourceId, 1)
  const card = gamestate.players[player].hand.find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
  if (!card) throw new Error(`no ${sourceId} in hand to discard`)
  return moveZoneToZone(gamestate, card, { player, zone: "hand" }, { player, zone: "discard" }, "bottom")
}

function duel(
  p1: string[],
  p2: string[],
  energy: string,
  attach1: number,
  attach2 = 0
): GameState {
  const lead = printed(set, p1[0])
  const extra = p1.slice(1).map((id) => printed(set, id))
  const e = printed(set, energy)
  const theirs = p2.map((id) => printed(set, id))
  let gamestate = initializeGameState(
    [lead, ...extra, ...copies(e, 16)],
    [...theirs, ...copies(e, 16)]
  )
  gamestate = moveToActive(gamestate, 1, p1[0])
  gamestate = moveToActive(gamestate, 2, p2[0])
  if (attach1) gamestate = attachEnergy(gamestate, 1, energy, attach1)
  if (attach2) gamestate = attachEnergy(gamestate, 2, energy, attach2)
  gamestate = toPrize(gamestate, 1, energy, 6)
  gamestate = toPrize(gamestate, 2, energy, 6)
  gamestate = toHand(gamestate, 1, energy, 3)
  return liveTurn(gamestate)
}

function trainers(): GameState {
  const spray = printed(set, "base1-72")
  const breeder = printed(set, "base1-76")
  const scoop = printed(set, "base1-78")
  const flute = printed(set, "base1-86")
  const revive = printed(set, "base1-89")
  const bulb = printed(set, "base1-44")
  const ivy = printed(set, "base1-30")
  const saur = printed(set, "base1-15")
  const bird = printed(set, "base1-57")
  const dummy = printed(set, DUMMY)
  const energy = printed(set, GRASS)

  let gamestate = initializeGameState(
    [spray, breeder, scoop, flute, revive, bulb, bulb, ivy, saur, bird, ...copies(energy, 10)],
    [dummy, bird, ...copies(energy, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-44")
  gamestate = toHand(gamestate, 1, "base1-30", 1)
  const stage1 = gamestate.players[1].hand.find((id) => gamestate.cardRegistry[id].sourceId === "base1-30")
  gamestate = moveZoneToSlot(
    gamestate,
    stage1!,
    { player: 1, zone: "hand" },
    { player: 1, slot: "active", attachment: "evolution" }
  )
  gamestate = moveToBench(gamestate, 1, "base1-44", 0)
  gamestate = moveToActive(gamestate, 2, DUMMY)
  gamestate = toHand(gamestate, 1, "base1-15", 1)
  for (const id of ["base1-72", "base1-76", "base1-78", "base1-86", "base1-89"] as const) {
    gamestate = toHand(gamestate, 1, id, 1)
  }
  gamestate = toDiscard(gamestate, 1, "base1-57")
  gamestate = toDiscard(gamestate, 2, "base1-57")
  gamestate = toPrize(gamestate, 1, GRASS, 6)
  gamestate = toPrize(gamestate, 2, GRASS, 6)
  gamestate = applyStatus(gamestate, "poison", { player: 1, slot: "active" })
  return liveTurn(gamestate)
}

function board(name: Name): GameState {
  if (name === "trainers") return trainers()
  if (name === "leek") return duel(["base1-27"], [DUMMY], LIGHTNING, 1)
  if (name === "metronome") return duel(["base1-5"], ["base1-36"], FIRE, 3, 3)
  if (name === "recoil") return duel(["base1-5"], ["base1-3"], FIGHTING, 3, 4)
  if (name === "water") return duel(["base1-59"], [DUMMY], WATER, 3)
  if (name === "thrash") return duel(["base1-11"], [DUMMY], GRASS, 3)
  if (name === "punch") return duel(["base1-20"], [DUMMY], LIGHTNING, 2)
  if (name === "gas") return duel(["base1-51"], [DUMMY], GRASS, 2)
  return duel(["base1-63"], [DUMMY], WATER, 2)
}

function session(name: Name) {
  return createSessionFromState(board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

const blurb: Record<Name, string> = {
  trainers:
    "Flute / Revive / Scoop Up / Devolution Spray / Breeder. Active is poisoned Ivysaur; bench Bulbasaur; Venusaur in hand; Pidgey in both discards; empty benches.",
  leek: "Farfetch'd — Leek Slap (ban stays after tails; retreat does not unlock it).",
  metronome: "Clefairy vs Magmar — copy Flamethrower; Magmar's discard-to-use must not apply to Clefairy.",
  recoil: "Clefairy vs Chansey — copy Double-edge; 80 recoil must not hit Clefairy.",
  water: "Poliwag — Water Gun with 3 Water (pay 1, +20 from extras, cap 2).",
  thrash: "Nidoking — Thrash (heads 40 / tails 30 + 10 recoil).",
  punch: "Electabuzz — Thunderpunch (same coin-recoil shape).",
  gas: "Koffing — Foul Gas 10, heads Poisoned / tails Confused.",
  withdraw: "Squirtle — Withdraw (Scrunch reprint).",
}

let current: Name = startName()
console.log("Authored coverage — recent holes + reprints")
console.log(`boards: ${names.join(" / ")}`)
console.log(`board: ${current}`)
console.log(blurb[current])
console.log("pnpm serve:authored -- trainers   (or leek | metronome | recoil | water | thrash | punch | gas | withdraw)")
console.log("POST /reset cycles. Or { p1: \"<name>\" }.")
listen(session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  console.log(blurb[current])
  return session(current)
})
