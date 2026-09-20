import type { GameState } from "./types.js"

export const SAVE_KIND = "tcg-save"
export const SAVE_VERSION = 1

const MAX_BYTES = 8_000_000
const MAX_NAME = 80

export type CompactSaveDeck = {
  id: string
  name: string
  types: string[]
  cards: { id: string; name: string; rarity?: string; count: number }[]
}

export type GameSave = {
  kind: typeof SAVE_KIND
  version: typeof SAVE_VERSION
  name: string
  savedAt: string
  decks: { p1: string; p2: string }
  custom?: CompactSaveDeck[]
  gamestate: GameState
}

export function newGameId() {
  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function saveName(value: string) {
  const name = value.trim()
  if (!name || name.length > MAX_NAME) throw new Error("save needs a name")
  return name
}

export function makeSave(input: {
  name: string
  decks: { p1: string; p2: string }
  gamestate: GameState
  custom?: CompactSaveDeck[]
}): GameSave {
  if (!input.decks.p1 || !input.decks.p2) throw new Error("save needs both decks")
  return {
    kind: SAVE_KIND,
    version: SAVE_VERSION,
    name: saveName(input.name),
    savedAt: new Date().toISOString(),
    decks: { p1: input.decks.p1, p2: input.decks.p2 },
    ...(input.custom?.length ? { custom: input.custom } : {}),
    gamestate: input.gamestate,
  }
}

export function parseGameSaveText(text: string): GameSave {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text.length > MAX_BYTES) throw new Error("save file too large")
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error("invalid save JSON")
  }
  return parseGameSave(parsed)
}

export function parseGameSave(value: unknown): GameSave {
  if (Array.isArray(value)) throw new Error("not a save file")
  if (!value || typeof value !== "object") throw new Error("not a save file")
  const row = value as Record<string, unknown>
  if (row.kind !== SAVE_KIND || row.version !== SAVE_VERSION) throw new Error("not a save file")
  const name = saveName(typeof row.name === "string" ? row.name : "")
  const savedAt = typeof row.savedAt === "string" && row.savedAt ? row.savedAt : new Date().toISOString()
  const decks = row.decks
  if (!decks || typeof decks !== "object" || Array.isArray(decks)) throw new Error("save needs decks")
  const pair = decks as Record<string, unknown>
  if (typeof pair.p1 !== "string" || !pair.p1 || typeof pair.p2 !== "string" || !pair.p2) {
    throw new Error("save needs both decks")
  }
  const gamestate = asGameState(row.gamestate)
  const custom = row.custom === undefined ? undefined : asCustom(row.custom)
  return {
    kind: SAVE_KIND,
    version: SAVE_VERSION,
    name,
    savedAt,
    decks: { p1: pair.p1, p2: pair.p2 },
    ...(custom?.length ? { custom } : {}),
    gamestate,
  }
}

export function loadSavedState(save: GameSave): GameState {
  return { ...save.gamestate, id: newGameId() }
}

function asGameState(value: unknown): GameState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("save needs a game")
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || !row.id) throw new Error("save needs a game")
  if (typeof row.phase !== "string" || !row.phase) throw new Error("save needs a game")
  const players = row.players
  if (!players || typeof players !== "object" || Array.isArray(players)) throw new Error("save needs a game")
  const seats = players as Record<string, unknown>
  if (!seats[1] || typeof seats[1] !== "object" || !seats[2] || typeof seats[2] !== "object") {
    throw new Error("save needs a game")
  }
  if (!row.cardRegistry || typeof row.cardRegistry !== "object" || Array.isArray(row.cardRegistry)) {
    throw new Error("save needs a game")
  }
  return row as unknown as GameState
}

function asCustom(value: unknown): CompactSaveDeck[] {
  if (!Array.isArray(value)) throw new Error("save custom must be a list")
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`save custom[${index}]`)
    const deck = row as Record<string, unknown>
    if (typeof deck.id !== "string" || !deck.id) throw new Error(`save custom[${index}].id`)
    if (typeof deck.name !== "string" || !deck.name) throw new Error(`save custom[${index}].name`)
    if (!Array.isArray(deck.cards) || !deck.cards.length) throw new Error(`save custom[${index}].cards`)
    return row as CompactSaveDeck
  })
}
