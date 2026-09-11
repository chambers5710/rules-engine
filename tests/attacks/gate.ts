import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import {
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]
const names = ["sand", "amnesia"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "sand"
}

function board(name: Name): GameState {
  if (name === "amnesia") {
    const whirl = printed(set, "base1-38")
    const chansey = printed(set, "base1-3")
    const water = printed(set, "base1-102")
    const colorless = printed(set, "base1-97")
    let gamestate = initializeGameState(
      [whirl, whirl, ...copies(water, 20)],
      [chansey, chansey, ...copies(colorless, 16)]
    )
    gamestate = moveToActive(gamestate, 1, "base1-38")
    gamestate = moveToActive(gamestate, 2, "base1-3")
    gamestate = attachEnergy(gamestate, 1, "base1-102", 2)
    gamestate = attachEnergy(gamestate, 2, "base1-97", 4)
    gamestate = toPrize(gamestate, 1, "base1-102", 6)
    gamestate = toPrize(gamestate, 2, "base1-97", 6)
    gamestate = toHand(gamestate, 1, "base1-102", 3)
    return liveTurn(gamestate)
  }
  const shrew = printed(set, "base1-62")
  const chansey = printed(set, "base1-3")
  const fighting = printed(set, "base1-97")
  let gamestate = initializeGameState(
    [shrew, shrew, ...copies(fighting, 20)],
    [chansey, chansey, ...copies(fighting, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-62")
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 4)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  return liveTurn(gamestate)
}

function session(name: Name) {
  return createSessionFromState(board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = startName()
console.log("Attack use — Sand-attack / Amnesia")
console.log(`board: ${current}`)
console.log("sand: 10 then P2 coin or attack fails. amnesia: pick a Chansey attack; that name is gone next turn.")
console.log("pnpm serve:gate -- sand  (or amnesia). POST /reset cycles.")
listen(session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
