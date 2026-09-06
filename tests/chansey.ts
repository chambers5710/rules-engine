import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Action, computeAvailableActions, type AvailableAction } from "../compute.js"
import cards from "../data/cards/base1.json" with { type: "json" }
import { initializeGameState } from "../initialize.js"
import { stateMachine } from "../machine.js"
import { moveZoneToZone } from "../ops.js"
import { surveyCards } from "../survey.js"
import type { Card, GameState } from "../types.js"
import { Phase } from "../types.js"
import { chooseAction, formatGamestate } from "../ui.js"

const AUTO = false

function printedCard(id: string): Card {
  const card = (cards as Card[]).find((row) => row.id === id)
  if (!card) throw new Error(`missing card ${id}`)
  return card
}

function copies(card: Card, n: number): Card[] {
  return Array.from({ length: n }, () => card)
}

function seedHandEnergy(gamestate: GameState, player: 1 | 2, n: number): GameState {
  let energy = surveyCards(gamestate, { player, zone: "hand" }, { kind: "energy" })
  while (energy.length < n) {
    const card = surveyCards(gamestate, { player, zone: "deck" }, { kind: "energy" })[0]
    if (!card) break
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player, zone: "deck" },
      { player, zone: "hand", position: "bottom" }
    )
    energy = surveyCards(gamestate, { player, zone: "hand" }, { kind: "energy" })
  }
  while (energy.length > n) {
    const card = energy[energy.length - 1]
    gamestate = moveZoneToZone(
      gamestate,
      card,
      { player, zone: "hand" },
      { player, zone: "deck", position: "bottom" }
    )
    energy = surveyCards(gamestate, { player, zone: "hand" }, { kind: "energy" })
  }
  return gamestate
}

function pick(actions: AvailableAction[]): AvailableAction {
  return (
    actions.find((a) => a.kind === Action.Attack && a.name === "Double-edge") ??
    actions.find((a) => a.kind === Action.AttachEnergy) ??
    actions.find((a) => a.kind === Action.EndTurn) ??
    actions[0]
  )
}

function activeName(gamestate: GameState, player: 1 | 2): string {
  const id = gamestate.players[player].active.evolution.at(-1)
  return id ? gamestate.cardRegistry[id].name : ""
}

type Case = { name: string; expected: unknown; realized: unknown; pass: boolean }
const cases: Case[] = []

function check(name: string, expected: unknown, realized: unknown) {
  cases.push({
    name,
    expected,
    realized,
    pass: JSON.stringify(expected) === JSON.stringify(realized),
  })
}

const energy = printedCard("base1-97")
const pad = copies(energy, 30)

let gamestate = initializeGameState(
  [printedCard("base1-3"), ...pad],
  [printedCard("base1-5"), ...pad]
)
gamestate = { ...gamestate, firstPlayer: 1, activePlayer: 1 }
gamestate = seedHandEnergy(gamestate, 1, 3)
gamestate = seedHandEnergy(gamestate, 2, 3)

const out = join(dirname(fileURLToPath(import.meta.url)), "chansey-report.txt")
const frame = (next: typeof gamestate) => writeFileSync(out, formatGamestate(next))

const log: string[] = []
frame(gamestate)
while (gamestate.phase !== Phase.Ended) {
  const actions = computeAvailableActions(gamestate)
  if (actions.length === 0) break
  const action = AUTO ? pick(actions) : await chooseAction(gamestate, actions)
  const label =
    action.kind === Action.Attack
      ? `${action.kind}  ${action.name}`
      : action.kind === Action.AttachEnergy
        ? `${action.kind}  ${gamestate.cardRegistry[action.card]?.name ?? action.card}`
        : action.kind
  log.push(`p${action.player}: ${label}`)
  gamestate = stateMachine(gamestate, action)
  frame(gamestate)
  if (action.kind === Action.Attack && action.name === "Double-edge") break
}

check("p1 active", "Chansey", activeName(gamestate, 1))
check("p1 self damage", 80, gamestate.players[1].active.damage)
check("p1 energy attached", 4, gamestate.players[1].active.energy.length)
check("p2 active empty", true, gamestate.players[2].active.evolution.length === 0)
check("phase ended", Phase.Ended, gamestate.phase)
check("attacked Double-edge", true, log.some((line) => line.includes("Double-edge")))

const failed = cases.filter((c) => !c.pass)
console.log(`Wrote ${out} (${cases.filter((c) => c.pass).length}/${cases.length} passed, ${failed.length} failed)`)
