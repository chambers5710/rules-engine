import { computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card, EffectRegistry, GameState, SlotId } from "./types.js"
import { formatAction } from "./ui.js"

export type Choice = {
  index: number
  label: string
  player: 1 | 2
  card?: string
  slot?: SlotId
}

export type Frame = {
  type: "STATE"
  gamestate: GameState
  choices: Choice[]
  decks: { p1: string; p2: string }
}

export type PlaySession = {
  frame: () => Frame
  choose: (index: number) => Frame
}

export function createSession(
  p1Deck: Card[],
  p2Deck: Card[],
  registry: EffectRegistry,
  decks: { p1: string; p2: string },
): PlaySession {
  return createSessionFromState(initializeGameState(p1Deck, p2Deck, registry), decks)
}

export function createSessionFromState(
  initial: GameState,
  decks: { p1: string; p2: string },
): PlaySession {
  let gamestate = initial
  let actions = computeAvailableActions(gamestate)

  const frame = (): Frame => ({
    type: "STATE",
    gamestate,
    decks,
    choices: actions.map((action, index) => ({
      index,
      label: formatAction(gamestate, action),
      player: action.player,
      ...("card" in action ? { card: action.card } : {}),
      ...("slot" in action ? { slot: action.slot } : {}),
    })),
  })

  return {
    frame,
    choose(index: number) {
      const action = actions[index]
      if (!action) throw new Error("not a listed choice")
      gamestate = stateMachine(gamestate, action)
      actions = computeAvailableActions(gamestate)
      return frame()
    },
  }
}
