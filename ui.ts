import { hasPokemonInPlay } from "./board.js"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Action, type AvailableAction } from "./compute.js"
import type { GameState } from "./types.js"
import { Phase } from "./types.js"

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > width && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function cardName(gamestate: GameState, id: string): string {
  return gamestate.cardRegistry[id]?.name ?? id
}

function grouped(gamestate: GameState, ids: string[]): string {
  const tally = new Map<string, number>()
  for (const id of ids) {
    const name = cardName(gamestate, id)
    tally.set(name, (tally.get(name) ?? 0) + 1)
  }
  return [...tally].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)).join(", ") || "-"
}

function field(key: string, value: string): string {
  return `  ${key.padEnd(8)} ${value}`
}

function slotLine(gamestate: GameState, slot: GameState["players"][1]["active"]): string {
  if (!slot.evolution.length) return "-"
  const form = slot.evolution.map((id) => cardName(gamestate, id)).join(" > ")
  const status = Object.entries(slot.status)
    .filter(([, on]) => on)
    .map(([flag]) => flag)
    .join(",")
  const parts = [form, `dmg ${slot.damage}`]
  if (status) parts.push(status)
  if (slot.energy.length) parts.push(grouped(gamestate, slot.energy))
  if (slot.modifiers.length) {
    parts.push(slot.modifiers.map((m) => `${m.field}=${m.set}:${m.phase}`).join(" "))
  }
  return parts.join("  |  ")
}

function side(gamestate: GameState, player: 1 | 2, face: "away" | "home"): string[] {
  const p = gamestate.players[player]
  const mark = gamestate.activePlayer === player ? ">" : " "
  const piles = [
    field("prize", String(p.prize.length)),
    field("hand", `${p.hand.length}  ${grouped(gamestate, p.hand)}`),
    field("deck", String(p.deck.length)),
    field("discard", `${p.discard.length}${p.discard.length ? `  ${grouped(gamestate, p.discard)}` : ""}`),
  ]
  const board = [
    field("active", slotLine(gamestate, p.active)),
    ...p.bench.map((slot, i) => field(`bench[${i}]`, slotLine(gamestate, slot))),
  ]
  const body = face === "away" ? [...piles, ...board] : [...board, ...piles]
  return [`${mark} p${player}`, ...body]
}
 
function formatEndgame(gamestate: GameState): string {
  for (const player of [1, 2] as const) {
    if (gamestate.players[player].prize.length === 0) {
      return `end: p${player} took all prizes`
    }
    if (!hasPokemonInPlay(gamestate, player)) {
      return `end: p${player} has no Pokémon in play`
    }
  }
  if (gamestate.players[gamestate.activePlayer].deck.length === 0) {
    return `end: p${gamestate.activePlayer} cannot draw`
  }
  return "end: game over"
}

export function formatGamestate(gamestate: GameState): string {
  const meta = [
    `# gamestate`,
    ``,
    "```",
    field("phase", gamestate.phase),
    field("turn", String(gamestate.turnCount)),
    field("first", `p${gamestate.firstPlayer}`),
    field("active", `p${gamestate.activePlayer}`),
    field("mulligan", `p1=${gamestate.mulligans[1]}  p2=${gamestate.mulligans[2]}`),
    field("ready", `p1=${gamestate.setupReady[1]}  p2=${gamestate.setupReady[2]}`),
  ]
  if (gamestate.phase === Phase.Ended) meta.push(field("end", formatEndgame(gamestate)))

  const body = [
    ...meta,
    "",
    ...side(gamestate, 2, "away"),
    "",
    ...side(gamestate, 1, "home"),
    "```",
    "",
  ]

  return body.join("\n")
}

export function formatAction(gamestate: GameState, a: AvailableAction): string {
  if (a.kind === Action.Ready || a.kind === Action.EndTurn) return `${a.kind}`
  if (a.kind === Action.Promote) {
    const id = gamestate.players[a.player].bench[a.index].evolution.at(-1)
    return `${a.kind}  ${id ? cardName(gamestate, id) : `bench[${a.index}]`}`
  }
  if (a.kind === Action.AttachEnergy || a.kind === Action.Evolve) {
    const dest = a.to.slot === "active" ? "Active" : `bench[${a.to.index}]`
    return `${a.kind}  ${cardName(gamestate, a.card)} → ${dest}`
  }
  if (a.kind === Action.Attack) {
    const id = gamestate.players[a.player].active.evolution.at(-1)
    const printed = id
      ? gamestate.cardRegistry[id].attacks?.find((attack) => attack.name === a.name)
      : undefined
    const text = String(printed?.text ?? "").trim()
    if (!text) return `${a.kind}  ${a.name}`
    return [`${a.kind}  ${a.name}`, ...wrapText(text, 52).map((line) => `         ${line}`)].join("\n")
  }
  return `${a.kind}  ${cardName(gamestate, a.card)}`
}

export async function chooseIndex(
  choices: { index: number; label: string; player: 1 | 2 }[]
): Promise<number> {
  const rl = createInterface({ input, output })
  console.log("\nAvailable actions:")
  let lastPlayer: 1 | 2 | undefined
  for (const choice of choices) {
    if (lastPlayer !== undefined && choice.player !== lastPlayer) {
      console.log("\n\n")
    }
    lastPlayer = choice.player
    console.log(`  [${choice.index}] p${choice.player}  ${choice.label}`)
  }
  let chosen: number | undefined
  while (chosen === undefined) {
    const answer = await rl.question("\nChoose action index: ")
    const index = Number(answer.trim())
    if (choices.some((choice) => choice.index === index)) chosen = index
    else console.log("not a listed choice")
  }
  rl.close()
  return chosen
}

export async function chooseAction(
  gamestate: GameState,
  actions: AvailableAction[]
): Promise<AvailableAction> {
  const rl = createInterface({ input, output })
  console.log("\nAvailable actions:")
  let lastPlayer: 1 | 2 | undefined
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (lastPlayer !== undefined && a.player !== lastPlayer) {
      console.log("\n\n")
    }
    lastPlayer = a.player
    console.log(`  [${i}] p${a.player}  ${formatAction(gamestate, a)}`)
  }
  let chosen: AvailableAction | undefined
  while (!chosen) {
    const answer = await rl.question("\nChoose action index: ")
    chosen = actions[Number(answer.trim())]
    if (!chosen) console.log("not a listed choice")
  }
  rl.close()
  return chosen
}
