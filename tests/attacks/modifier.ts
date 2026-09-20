import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../src/session.js"
import type { Card, GameState } from "../../types.js"
import {
  initBoard,
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
const names = ["onix", "raichu", "mewtwo"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "onix"
}

async function stage(p1: string, energy: string, attach: number, p2 = "base1-7", p2energy = "base1-97"): GameState {
  const a = printed(set, p1)
  const b = printed(set, p2)
  const e1 = printed(set, energy)
  const e2 = printed(set, p2energy)

  let gamestate = await initBoard(
    [a, a, ...copies(e1, 16)],
    [b, b, ...copies(e2, 16)]
  )
  gamestate = moveToActive(gamestate, 1, p1)
  gamestate = moveToBench(gamestate, 1, p1, 0)
  gamestate = moveToActive(gamestate, 2, p2)
  gamestate = moveToBench(gamestate, 2, p2, 0)
  gamestate = attachEnergy(gamestate, 1, energy, attach)
  gamestate = attachEnergy(gamestate, 2, p2energy, 3)
  gamestate = toHand(gamestate, 1, energy, 3)
  gamestate = toHand(gamestate, 2, p2energy, 3)
  gamestate = toPrize(gamestate, 1, energy, 6)
  gamestate = toPrize(gamestate, 2, p2energy, 6)
  return liveTurn(gamestate)
}

async function board(name: Name): GameState {
  if (name === "raichu") return await stage("base1-14", "base1-100", 3)
  if (name === "mewtwo") return await stage("base1-10", "base1-101", 3)
  return await stage("base1-56", "base1-97", 2)
}

async function session(name: Name) {
  return createSessionFromState(await board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = startName()
console.log("Modifier algebra — Onix Harden / Raichu Agility / Mewtwo Barrier")
console.log(`board: ${current}`)
console.log("pnpm serve:modifier -- onix   (or raichu | mewtwo). POST /reset cycles.")
listen(await session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
