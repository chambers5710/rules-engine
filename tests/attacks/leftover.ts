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
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]
const names = ["fang", "toxic", "whirlwind"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "fang"
}

async function board(name: Name): GameState {
  if (name === "toxic") {
    const king = printed(set, "base1-11")
    const chansey = printed(set, "base1-3")
    const grass = printed(set, "base1-99")
    const fighting = printed(set, "base1-97")
    let gamestate = await initBoard(
      [king, king, ...copies(grass, 20)],
      [chansey, chansey, ...copies(fighting, 16)]
    )
    gamestate = moveToActive(gamestate, 1, "base1-11")
    gamestate = moveToActive(gamestate, 2, "base1-3")
    gamestate = attachEnergy(gamestate, 1, "base1-99", 3)
    gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
    gamestate = toPrize(gamestate, 1, "base1-99", 6)
    gamestate = toPrize(gamestate, 2, "base1-97", 6)
    gamestate = toHand(gamestate, 1, "base1-99", 3)
    return liveTurn(gamestate)
  }
  if (name === "whirlwind") {
    const pidgey = printed(set, "base1-57")
    const chansey = printed(set, "base1-3")
    const hitmon = printed(set, "base1-7")
    const magmar = printed(set, "base1-36")
    const colorless = printed(set, "base1-97")
    let gamestate = await initBoard(
      [pidgey, pidgey, ...copies(colorless, 20)],
      [chansey, hitmon, magmar, ...copies(colorless, 20)]
    )
    gamestate = moveToActive(gamestate, 1, "base1-57")
    gamestate = moveToActive(gamestate, 2, "base1-3")
    gamestate = moveToBench(gamestate, 2, "base1-7", 0)
    gamestate = moveToBench(gamestate, 2, "base1-36", 1)
    gamestate = attachEnergy(gamestate, 1, "base1-97", 2)
    gamestate = toPrize(gamestate, 1, "base1-97", 6)
    gamestate = toPrize(gamestate, 2, "base1-97", 6)
    gamestate = toHand(gamestate, 1, "base1-97", 3)
    return liveTurn(gamestate)
  }
  const rat = printed(set, "base1-40")
  const chansey = printed(set, "base1-3")
  const energy = printed(set, "base1-97")
  let gamestate = await initBoard(
    [rat, rat, ...copies(energy, 20)],
    [chansey, chansey, ...copies(energy, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-40")
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, "base1-97", 3)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
  gamestate = toPrize(gamestate, 1, "base1-97", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-97", 3)
  // Chansey 120 − 20 = 100 remaining → Super Fang 50
  return applyDamage(liveTurn(gamestate), 20, { player: 2, slot: "active" })
}

async function session(name: Name) {
  return createSessionFromState(await board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = startName()
console.log("Leftovers — Super Fang / Toxic / Whirlwind")
console.log(`board: ${current}`)
console.log("fang: Chansey 20 dmg → Fang 50. toxic: 20 then 20 poison. whirlwind: P2 picks a bench.")
console.log("pnpm serve:leftover -- fang  (or toxic | whirlwind). POST /reset cycles.")
listen(await session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
