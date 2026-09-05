import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Action, type AvailableAction } from "./compute.js"
import type { GameState } from "./types.js"

function cardName(gamestate: GameState, id: string): string {
  return gamestate.cardRegistry[id]?.name ?? id
}

function names(gamestate: GameState, ids: string[]): string {
  return ids.length ? ids.map((id) => cardName(gamestate, id)).join(", ") : "(empty)"
}

function slotLine(gamestate: GameState, slot: GameState["players"][1]["active"]): string {
  if (!slot.evolution.length) return "(empty)"
  const status = Object.entries(slot.status)
    .filter(([, on]) => on)
    .map(([flag]) => flag)
    .join(",")
  const energy = names(gamestate, slot.energy)
  return `${names(gamestate, slot.evolution)}  dmg=${slot.damage}${status ? `  ${status}` : ""}${slot.energy.length ? `  energy: ${energy}` : ""}`
}

export function formatGamestate(gamestate: GameState): string {
  const lines = [
    `phase: ${gamestate.phase}`,
    `turn: ${gamestate.turnCount}`,
    `first player: ${gamestate.firstPlayer}`,
    `active player: ${gamestate.activePlayer}`,
    `mulligans: p1=${gamestate.mulligans[1]}  p2=${gamestate.mulligans[2]}`,
    `setup ready: p1=${gamestate.setupReady[1]}  p2=${gamestate.setupReady[2]}`,
    "",
  ]

  for (const player of [1, 2] as const) {
    const p = gamestate.players[player]
    lines.push(`player ${player}`)
    lines.push(`  hand (${p.hand.length}): ${names(gamestate, p.hand)}`)
    lines.push(`  deck (${p.deck.length}): ${names(gamestate, p.deck)}`)
    lines.push(`  prize (${p.prize.length}): ${names(gamestate, p.prize)}`)
    lines.push(`  discard (${p.discard.length}): ${names(gamestate, p.discard)}`)
    lines.push(`  active: ${slotLine(gamestate, p.active)}`)
    p.bench.forEach((seat, i) => {
      lines.push(`  bench[${i}]: ${slotLine(gamestate, seat)}`)
    })
    lines.push("")
  }

  return lines.join("\n")
}

function formatAction(gamestate: GameState, a: AvailableAction): string {
  if (a.kind === Action.Ready || a.kind === Action.EndTurn) return `${a.kind}`
  return `${a.kind}  ${cardName(gamestate, a.card)}`
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
