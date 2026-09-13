import cards from "../../data/cards/base1.json" with { type: "json" }
import { computeAvailableActions } from "../../compute.js"
import { Action } from "../../dsl.js"
import { initializeGameState } from "../../initialize.js"
import { stateMachine } from "../../machine.js"
import { moveZoneToZone } from "../../ops.js"
import type { Card, GameState, ZoneName } from "../../types.js"
import { copies, liveTurn, moveToActive, printed, toHand } from "../fixture.js"

const set = cards as Card[]

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function playPokedex(gamestate: GameState): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) =>
      row.kind === Action.PlayTrainer && gamestate.cardRegistry[row.card].sourceId === "base1-87"
  )
  if (!action) fail("Pokédex is not listed")
  return stateMachine(gamestate, action)
}

function chooseCard(gamestate: GameState, card: string): GameState {
  const action = computeAvailableActions(gamestate).find(
    (row) => row.kind === Action.Choose && row.pick === "cards" && row.card === card
  )
  if (!action) fail(`no card choice ${card}`)
  return stateMachine(gamestate, action)
}

function stage(top: string[]): GameState {
  const dex = printed(set, "base1-87")
  const extra = top.map((id) => printed(set, id))
  let gamestate = initializeGameState(
    [dex, printed(set, "base1-58"), ...extra, ...copies(printed(set, "base1-98"), 12)],
    [printed(set, "base1-58"), ...copies(printed(set, "base1-97"), 17)]
  )
  gamestate = moveToActive(gamestate, 1, "base1-58")
  gamestate = moveToActive(gamestate, 2, "base1-58")
  gamestate = toHand(gamestate, 1, "base1-87", 1)
  gamestate = liveTurn(gamestate)
  const zones: ZoneName[] = ["deck", "hand", "discard", "prize"]
  const ids = top.map((sourceId) => {
    for (const zone of zones) {
      const card = gamestate.players[1][zone].find((id) => gamestate.cardRegistry[id].sourceId === sourceId)
      if (!card) continue
      if (zone !== "deck") {
        gamestate = moveZoneToZone(
          gamestate,
          card,
          { player: 1, zone },
          { player: 1, zone: "deck" },
          "bottom"
        )
      }
      return card
    }
    fail(`missing ${sourceId}`)
  })
  const rest = gamestate.players[1].deck.filter((id) => !ids.includes(id))
  return {
    ...gamestate,
    players: {
      ...gamestate.players,
      1: { ...gamestate.players[1], deck: [...ids, ...rest] },
    },
  }
}

{
  const top = ["base1-91", "base1-95", "base1-82", "base1-94", "base1-93"]
  let gamestate = stage(top)
  const before = gamestate.players[1].deck.slice(0, 5)
  expect(before.length === 5, "five cards on top")
  gamestate = playPokedex(gamestate)
  const revealed = gamestate.history.filter((entry) => entry.op === "reveal").at(-1)
  expect(revealed?.op === "reveal" && revealed.to === "self", "look is reveal to self")
  expect(
    revealed?.op === "reveal" && revealed.cards.join() === before.join(),
    "reveal is the current top five"
  )
  for (const card of [...before].reverse()) {
    gamestate = chooseCard(gamestate, card)
  }
  expect(gamestate.actionStack.length === 0, "order selects finish")
  expect(
    gamestate.players[1].deck.slice(0, 5).join() === [...before].reverse().join(),
    "top five stay in the deck in the chosen order"
  )
  expect(
    !before.some((id) => gamestate.players[1].hand.includes(id) || gamestate.players[1].discard.includes(id)),
    "looked cards never leave the deck"
  )
}

{
  let gamestate = stage(["base1-91", "base1-95"])
  const before = gamestate.players[1].deck.slice(0, 2)
  const leftovers = gamestate.players[1].deck.slice(2)
  gamestate = {
    ...gamestate,
    players: {
      ...gamestate.players,
      1: {
        ...gamestate.players[1],
        deck: before,
        discard: [...gamestate.players[1].discard, ...leftovers],
      },
    },
  }
  gamestate = playPokedex(gamestate)
  gamestate = chooseCard(gamestate, before[1])
  gamestate = chooseCard(gamestate, before[0])
  expect(
    gamestate.players[1].deck[0] === before[1] && gamestate.players[1].deck[1] === before[0],
    "up to 5 is a short prefix"
  )
}

console.log("pokedex-check assertions passed")
