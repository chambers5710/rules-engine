import type { CardFieldOverrides, CardInstance, CardInstanceId, GameState } from "./types.js"

export function isStadium(card: { subtypes?: string[] | null } | undefined): boolean {
  return (card?.subtypes ?? []).includes("Stadium")
}

// Printed card plus `fieldOverrides`. Seat modifiers (Energy Burn) still fold on top in survey.
export function foldedCard(gamestate: GameState, cardId: CardInstanceId): CardInstance | undefined {
  const printed = gamestate.cardRegistry[cardId]
  if (!printed) return
  const overrides = printed.fieldOverrides
  if (!overrides || Object.keys(overrides).length === 0) return printed
  return {
    ...printed,
    ...overrides,
    instanceId: printed.instanceId,
    sourceId: printed.sourceId,
    images: printed.images,
    fieldOverrides: printed.fieldOverrides,
  }
}

// Merge onto the instance map. Printed fields stay; `foldedCard` is the read.
export function applyFieldOverrides(
  gamestate: GameState,
  cardId: CardInstanceId,
  overrides: CardFieldOverrides
): GameState {
  const printed = gamestate.cardRegistry[cardId]
  if (!printed) return gamestate
  return {
    ...gamestate,
    cardRegistry: {
      ...gamestate.cardRegistry,
      [cardId]: {
        ...printed,
        fieldOverrides: { ...printed.fieldOverrides, ...overrides },
      },
    },
  }
}

// Zones are printed identity. Slot-to-slot (Buzzap attach) does not call this.
export function clearFieldOverrides(gamestate: GameState, cardId: CardInstanceId): GameState {
  const printed = gamestate.cardRegistry[cardId]
  if (!printed || Object.keys(printed.fieldOverrides).length === 0) return gamestate
  return {
    ...gamestate,
    cardRegistry: {
      ...gamestate.cardRegistry,
      [cardId]: { ...printed, fieldOverrides: {} },
    },
  }
}
