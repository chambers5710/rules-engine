import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { applyDamage, moveSlotToSlot } from "../../ops.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import { DAMAGE_COUNTER } from "../../types.js"
import {
  initBoard,
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toDeck,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

const names = ["search", "maintenance", "oak", "impostor", "lass", "trader", "center"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "search"
}

async function stage(p1: string[], energy: string, p2extra: string[] = []): GameState {
  const lead = printed(set, p1[0])
  const extra = p1.slice(1).map((id) => printed(set, id))
  const e = printed(set, energy)
  const chansey = printed(set, "base1-3")
  const theirs = p2extra.map((id) => printed(set, id))

  let gamestate = await initBoard(
    [lead, lead, ...extra, ...copies(e, 16)],
    [chansey, chansey, ...theirs, ...copies(e, 16)]
  )
  gamestate = moveToActive(gamestate, 1, p1[0])
  gamestate = moveToBench(gamestate, 1, p1[0], 0)
  gamestate = moveToActive(gamestate, 2, "base1-3")
  gamestate = attachEnergy(gamestate, 1, energy, 1)
  gamestate = attachEnergy(gamestate, 2, energy, 2)
  gamestate = toPrize(gamestate, 1, energy, 6)
  gamestate = toPrize(gamestate, 2, energy, 6)
  return liveTurn(gamestate)
}

async function board(name: Name): GameState {
  if (name === "search") {
    let gamestate = await stage(["base1-5", "base1-35", "base1-71"], "base1-97")
    gamestate = toHand(gamestate, 1, "base1-71", 1)
    gamestate = toHand(gamestate, 1, "base1-97", 3)
    return gamestate
  }
  if (name === "maintenance") {
    let gamestate = await stage(["base1-5", "base1-83"], "base1-97")
    gamestate = toHand(gamestate, 1, "base1-83", 1)
    gamestate = toHand(gamestate, 1, "base1-97", 2)
    return gamestate
  }
  if (name === "oak") {
    let gamestate = await stage(["base1-5", "base1-88"], "base1-97")
    gamestate = toHand(gamestate, 1, "base1-88", 1)
    gamestate = toHand(gamestate, 1, "base1-97", 4)
    return gamestate
  }
  if (name === "impostor") {
    let gamestate = await stage(["base1-5", "base1-73"], "base1-97")
    gamestate = toHand(gamestate, 1, "base1-73", 1)
    gamestate = toHand(gamestate, 2, "base1-97", 5)
    return gamestate
  }
  if (name === "lass") {
    let gamestate = await stage(["base1-5", "base1-75", "base1-91", "base1-94"], "base1-97", ["base1-91"])
    gamestate = toHand(gamestate, 1, "base1-75", 1)
    gamestate = toHand(gamestate, 1, "base1-91", 1)
    gamestate = toHand(gamestate, 1, "base1-94", 1)
    gamestate = toHand(gamestate, 1, "base1-97", 2)
    gamestate = toHand(gamestate, 2, "base1-91", 1)
    gamestate = toHand(gamestate, 2, "base1-97", 3)
    return gamestate
  }
  if (name === "center") {
    let gamestate = await stage(["base1-5", "base1-85"], "base1-97")
    gamestate = toHand(gamestate, 1, "base1-85", 1)
    gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
    const energy = gamestate.players[1].active.energy[0]
    gamestate = moveSlotToSlot(
      gamestate,
      energy,
      { player: 1, slot: "active", attachment: "energy" },
      { player: 1, slot: "bench", index: 0, attachment: "energy" }
    )
    gamestate = applyDamage(gamestate, 2 * DAMAGE_COUNTER, { player: 1, slot: "active" })
    gamestate = applyDamage(gamestate, DAMAGE_COUNTER, { player: 1, slot: "bench", index: 0 })
    return gamestate
  }
  let gamestate = await stage(["base1-5", "base1-77", "base1-35", "base1-31"], "base1-97")
  gamestate = toHand(gamestate, 1, "base1-77", 1)
  gamestate = toHand(gamestate, 1, "base1-35", 1)
  gamestate = toDeck(gamestate, 1, "base1-31", 1)
  return gamestate
}

async function session(name: Name) {
  return createSessionFromState(await board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

let current: Name = startName()
console.log(`Deck trainers — ${names.join(" / ")}`)
console.log(`board: ${current}`)
console.log("pnpm serve:deck -- lass   (or search | maintenance | oak | impostor | trader | center)")
console.log("POST /reset cycles. Or { p1: \"<name>\" }.")
listen(await session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : next(current)
  console.log(`board: ${current}`)
  return session(current)
})
