import { currentForm, getSlot } from "./board.js"
import { Action, type AvailableAction } from "./compute.js"
import type { GameState } from "./types.js"

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

export function formatAction(gamestate: GameState, a: AvailableAction): string {
  if (a.kind === Action.Ready || a.kind === Action.EndTurn || a.kind === Action.Retreat) return `${a.kind}`
  if (a.kind === Action.Promote) {
    const dest = `bench[${a.index}]`
    const form = currentForm(gamestate, gamestate.players[a.player].bench[a.index])
    return `${a.kind}  ${form ? form.name : dest}  ${dest}`
  }
  if (a.kind === Action.AttachEnergy || a.kind === Action.Evolve) {
    const dest = a.slot.slot === "active" ? "Active" : `bench[${a.slot.index}]`
    return `${a.kind}  ${cardName(gamestate, a.card)} → ${dest}`
  }
  if (a.kind === Action.Attack) {
    const form = currentForm(gamestate, gamestate.players[a.player].active)
    const printed = form?.attacks?.find((attack) => attack.name === a.name)
    const text = String(printed?.text ?? "").trim()
    if (!text) return `${a.kind}  ${a.name}`
    return [`${a.kind}  ${a.name}`, ...wrapText(text, 52).map((line) => `         ${line}`)].join("\n")
  }
  if (a.kind === Action.Ability) {
    const form = currentForm(gamestate, getSlot(gamestate, a.slot))
    const printed = form?.abilities?.find((ability) => ability.name === a.name)
    const dest = a.slot.slot === "active" ? "Active" : `bench[${a.slot.index}]`
    const text = String(printed?.text ?? "").trim()
    const head = `${a.kind}  ${a.name}  ${dest}`
    if (!text) return head
    return [head, ...wrapText(text, 52).map((line) => `         ${line}`)].join("\n")
  }
  if (a.kind === Action.PlayTrainer) {
    const printed = gamestate.cardRegistry[a.card]
    const text = (printed?.rules ?? []).join(" ").trim()
    const head = `${a.kind}  ${printed?.name ?? a.card}`
    if (!text) return head
    return [head, ...wrapText(text, 52).map((line) => `         ${line}`)].join("\n")
  }
  if (a.kind === Action.Choose) {
    if (a.pick === "cards") return `select  ${cardName(gamestate, a.card)}`
    if (a.pick === "attacks") return `select  ${a.name}`
    const form = currentForm(gamestate, getSlot(gamestate, a.slot))
    const dest = a.slot.slot === "active" ? "Active" : `bench[${a.slot.index}]`
    return `select  ${form?.name ?? dest}  ${dest}`
  }
  return `${a.kind}  ${cardName(gamestate, a.card)}`
}
