import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { applyDamage } from "../../ops.js"
import { createSessionFromState } from "../../src/session.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard,
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]
const names = ["horn", "coins", "beam", "bolt", "recover"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "horn"
}

async function stage(
  p1: string,
  energy: string,
  attach: number,
  p2 = "base1-3",
  p2energy = "base1-97",
  p2attach = 2
): GameState {
  const a = printed(set, p1)
  const b = printed(set, p2)
  const e1 = printed(set, energy)
  const e2 = printed(set, p2energy)
  let gamestate = await initBoard(
    [a, a, ...copies(e1, 20)],
    [b, b, ...copies(e2, 16)]
  )
  gamestate = moveToActive(gamestate, 1, p1)
  gamestate = moveToActive(gamestate, 2, p2)
  gamestate = attachEnergy(gamestate, 1, energy, attach)
  gamestate = attachEnergy(gamestate, 2, p2energy, p2attach)
  gamestate = toPrize(gamestate, 1, energy, 6)
  gamestate = toPrize(gamestate, 2, p2energy, 6)
  gamestate = toHand(gamestate, 1, energy, 3)
  return liveTurn(gamestate)
}

async function board(name: Name): GameState {
  if (name === "coins") return await stage("base1-31", "base1-101", 1, "base1-52", "base1-97", 1)
  if (name === "beam") return await stage("base1-18", "base1-97", 4, "base1-36", "base1-98", 2)
  if (name === "bolt") return await stage("base1-16", "base1-100", 4)
  if (name === "recover") {
    return applyDamage(await stage("base1-32", "base1-101", 2), 30, { player: 1, slot: "active" })
  }
  return await stage("base1-55", "base1-99", 1)
}

async function session(name: Name) {
  return createSessionFromState(await board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = startName()
console.log("Stretch — Horn Hazard / Doubleslap / Hyper Beam / Thunderbolt / Recover")
console.log(`board: ${current}`)
console.log("pnpm serve:stretch -- horn  (or coins | beam | bolt | recover). POST /reset cycles.")
listen(await session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
