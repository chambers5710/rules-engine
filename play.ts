import { Action, computeAvailableActions } from "./compute.js"
import { initializeGameState } from "./initialize.js"
import { stateMachine } from "./machine.js"
import type { Card, EffectRegistry, GameState, Ruleset, SlotId } from "./types.js"
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
  rewindDepth: number
}

export type PlaySession = {
  frame: () => Frame
  choose: (index: number) => Frame
  rewind: (n?: number) => Frame
  checkpoints: () => GameState[]
}

export function createSession(
  p1Deck: Card[],
  p2Deck: Card[],
  registry: EffectRegistry,
  decks: { p1: string; p2: string },
  ruleset?: Ruleset,
): PlaySession {
  return createSessionFromState(initializeGameState(p1Deck, p2Deck, registry, ruleset), decks)
}

export function createSessionFromState(
  initial: GameState,
  decks: { p1: string; p2: string },
  checkpoints: GameState[] = [],
): PlaySession {
  let gamestate = initial
  let actions = computeAvailableActions(gamestate)
  const past: GameState[] = checkpoints.map((state) => structuredClone(state))

  const frame = (): Frame => ({
    type: "STATE",
    gamestate,
    decks,
    rewindDepth: past.length,
    choices: actions.map((action, index) => ({
      index,
      label: formatAction(gamestate, action),
      player: action.player,
      ...("card" in action && !(action.kind === Action.Choose && action.pick === "cards" && action.hidden)
        ? { card: action.card }
        : {}),
      ...("slot" in action ? { slot: action.slot } : {}),
    })),
  })

  return {
    frame,
    choose(index: number) {
      const action = actions[index]
      if (!action) throw new Error("not a listed choice")
      past.push(structuredClone(gamestate))
      gamestate = stateMachine(gamestate, action)
      actions = computeAvailableActions(gamestate)
      return frame()
    },
    rewind(n = 1) {
      if (!Number.isInteger(n) || n < 1) throw new Error("rewind needs a positive count")
      if (n > past.length) throw new Error("not enough history to rewind")
      let restored: GameState | undefined
      for (let i = 0; i < n; i++) restored = past.pop()
      gamestate = restored!
      actions = computeAvailableActions(gamestate)
      return frame()
    },
    checkpoints() {
      return past
    },
  }
}
