import cards from "../../data/cards/base1.json" with { type: "json" }
import { Op } from "../../dsl.js"
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
const names = ["strikes", "mirror", "bond"] as const
type Name = (typeof names)[number]

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "strikes"
}

function prizes(gamestate: GameState, energy: string): GameState {
  gamestate = toPrize(gamestate, 1, energy, 6)
  gamestate = toPrize(gamestate, 2, energy, 6)
  return toHand(gamestate, 1, energy, 3)
}

export function board(name: Name): GameState {
  if (name === "mirror") {
    const pidge = printed(set, "base1-22")
    const machop = printed(set, "base1-52")
    const energy = printed(set, "base1-97")
    let gamestate = initializeGameState(
      [pidge, pidge, ...copies(energy, 20)],
      [machop, machop, ...copies(energy, 16)]
    )
    gamestate = moveToActive(gamestate, 1, "base1-22")
    gamestate = moveToActive(gamestate, 2, "base1-52")
    gamestate = attachEnergy(gamestate, 1, "base1-97", 3)
    gamestate = attachEnergy(gamestate, 2, "base1-97", 1)
    gamestate = prizes(gamestate, "base1-97")
    gamestate = liveTurn(gamestate)
    const pidgeotto = gamestate.players[1].active.evolution.at(-1) ?? ""
    return {
      ...gamestate,
      turnCount: 2,
      history: [
        {
          op: Op.Attack,
          attacker: { player: 2, slot: "active" },
          defender: { player: 1, slot: "active" },
          defenderCard: pidgeotto,
          turn: 1,
          damage: 20,
          weakness: false,
          resistance: false,
          prevented: false,
        },
      ],
    }
  }
  if (name === "bond") {
    const gastly = printed(set, "base1-50")
    const hitmon = printed(set, "base1-7")
    const psychic = printed(set, "base1-101")
    const fighting = printed(set, "base1-97")
    let gamestate = initializeGameState(
      [gastly, gastly, ...copies(psychic, 10), ...copies(fighting, 10)],
      [hitmon, hitmon, ...copies(fighting, 16)]
    )
    gamestate = moveToActive(gamestate, 1, "base1-50")
    gamestate = moveToActive(gamestate, 2, "base1-7")
    gamestate = attachEnergy(gamestate, 1, "base1-101", 1)
    gamestate = attachEnergy(gamestate, 1, "base1-97", 1)
    gamestate = attachEnergy(gamestate, 2, "base1-97", 2)
    gamestate = toPrize(gamestate, 1, "base1-97", 6)
    gamestate = toPrize(gamestate, 2, "base1-97", 6)
    gamestate = toHand(gamestate, 1, "base1-101", 2)
    return liveTurn(gamestate)
  }
  const charizard = printed(set, "base1-4")
  const champ = printed(set, "base1-8")
  const fire = printed(set, "base1-98")
  const fighting = printed(set, "base1-97")
  let gamestate = initializeGameState(
    [charizard, charizard, ...copies(fire, 20)],
    [champ, champ, ...copies(fighting, 16)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-4")
  gamestate = moveToActive(gamestate, 2, "base1-8")
  gamestate = attachEnergy(gamestate, 1, "base1-98", 4)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 4)
  gamestate = toPrize(gamestate, 1, "base1-98", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  gamestate = toHand(gamestate, 1, "base1-98", 3)
  return liveTurn(gamestate)
}

function session(name: Name) {
  return createSessionFromState(board(name))
}

function next(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

if (!process.argv.includes("--check")) {
  let current: Name = startName()
  console.log("Triggers — Strikes Back / Mirror Move / Destiny Bond")
  console.log(`board: ${current}`)
  console.log("strikes: Fire Spin Machamp → 10 back (Charizard 4 Fire). mirror: Pidgeotto was hit 20 last turn. bond: discard Psychic, then P2 KO.")
  console.log("pnpm serve:trigger -- strikes  (or mirror | bond). POST /reset cycles.")
  listen(session(current), (body) => {
    const asked = body.p1
    current = names.includes(asked as Name) ? (asked as Name) : next(current)
    console.log(`board: ${current}`)
    return session(current)
  })
}
