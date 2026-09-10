import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { initializeGameState } from "../../initialize.js"
import { applyDamage } from "../../ops.js"
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

const names = ["flail", "meditate", "karate"] as const
type Name = (typeof names)[number]

function stage(
  p1: string,
  p2: string,
  energy1: string,
  energy2: string,
  attach1: number,
  attach2: number
): GameState {
  const a = printed(set, p1)
  const b = printed(set, p2)
  const e1 = printed(set, energy1)
  const e2 = printed(set, energy2)

  let gamestate = initializeGameState(
    [a, a, ...copies(e1, 16)],
    [b, b, ...copies(e2, 16)]
  )
  gamestate = moveToActive(gamestate, 1, p1)
  gamestate = moveToBench(gamestate, 1, p1, 0)
  gamestate = moveToActive(gamestate, 2, p2)
  gamestate = moveToBench(gamestate, 2, p2, 0)
  gamestate = attachEnergy(gamestate, 1, energy1, attach1)
  gamestate = attachEnergy(gamestate, 2, energy2, attach2)
  gamestate = toHand(gamestate, 1, energy1, 3)
  gamestate = toHand(gamestate, 2, energy2, 3)
  gamestate = toPrize(gamestate, 1, energy1, 6)
  gamestate = toPrize(gamestate, 2, energy2, 6)
  return liveTurn(gamestate)
}

function board(name: Name): GameState {
  if (name === "flail") {
    // Magikarp 20 damage → Flail 20. Chansey: no Water W/R.
    return applyDamage(stage("base1-35", "base1-3", "base1-102", "base1-97", 1, 2), 20, {
      player: 1,
      slot: "active",
    })
  }
  if (name === "meditate") {
    // Chansey 30 damage → Meditate 20+30. Colorless: no Psychic W/R.
    return applyDamage(stage("base1-31", "base1-3", "base1-101", "base1-97", 3, 2), 30, {
      player: 2,
      slot: "active",
    })
  }
  // Machoke 20 damage → Karate Chop 50-20. Blastoise: no Fighting W/R.
  return applyDamage(stage("base1-34", "base1-2", "base1-97", "base1-102", 3, 3), 20, {
    player: 1,
    slot: "active",
  })
}

function session(name: Name) {
  return createSessionFromState(board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = "flail"
console.log("Count damage — Flail / Meditate / Karate Chop")
console.log("Flail: 20 on Magikarp → 20. Meditate: 30 on Chansey → 50. Karate Chop: 20 on Machoke → 30.")
console.log("POST /reset cycles. Or { p1: \"flail\" | \"meditate\" | \"karate\" }.")
listen(session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
