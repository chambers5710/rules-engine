import { getSlot } from "./board.js"
import { copy, moveSlotToZone } from "./ops.js"
import type { AttackDamageRewrite, AttackUseRewrite, GameState, Modifier, Slot, SlotId } from "./types.js"

const PLAYERS = [1, 2] as const
const BENCH = [0, 1, 2, 3, 4] as const

function walkSlots(gamestate: GameState, visit: (slot: Slot) => void) {
  for (const player of PLAYERS) {
    const p = gamestate.players[player]
    visit(p.active)
    for (const slot of p.bench) visit(slot)
  }
}

function eachSeat(visit: (id: SlotId) => void) {
  for (const player of PLAYERS) {
    visit({ player, slot: "active" })
    for (const index of BENCH) visit({ player, slot: "bench", index })
  }
}

export function rewriteOf(modifier: AttackDamageRewrite): AttackDamageRewrite {
  if ("set" in modifier) return { set: modifier.set }
  if ("add" in modifier) return { add: modifier.add }
  if ("sub" in modifier) return { sub: modifier.sub }
  return { prevent: modifier.prevent }
}

export function applyModifier(
  gamestate: GameState,
  slot: SlotId,
  modifier: Omit<Modifier, "phase">
): GameState {
  const next = copy(gamestate)
  const phase = modifier.until.player === gamestate.activePlayer ? "active" : "pending"
  getSlot(next, slot).modifiers.push({ ...modifier, phase })
  return next
}

export function foldDamage(gamestate: GameState, slot: SlotId, base: number): number {
  const mods = getSlot(gamestate, slot).modifiers.filter(
    (m) => m.field === "attack_damage" && m.phase === "active"
  )
  let damage = base
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("add" in rewrite) damage += rewrite.add
    if ("sub" in rewrite) damage = Math.max(0, damage - rewrite.sub)
  }
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("prevent" in rewrite && rewrite.prevent !== "all" && damage <= rewrite.prevent) {
      damage = 0
    }
  }
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("set" in rewrite) damage = rewrite.set
    if ("prevent" in rewrite && rewrite.prevent === "all") damage = 0
  }
  return Math.max(0, damage)
}

export function foldAdds(gamestate: GameState, slot: SlotId, base: number): number {
  let damage = base
  for (const m of getSlot(gamestate, slot).modifiers) {
    if (m.field !== "attack_damage" || m.phase !== "active" || !("add" in m)) continue
    damage += m.add
  }
  return Math.max(0, damage)
}

function activeUse(slot: Slot): Extract<Modifier, { field: "attack_use" }>[] {
  return slot.modifiers.filter((m): m is Extract<Modifier, { field: "attack_use" }> =>
    m.field === "attack_use" && m.phase === "active"
  )
}

export function attackBanned(slot: Slot, name: string): boolean {
  return activeUse(slot).some((m) => "ban" in m && m.ban === name)
}

export function attackFlipGated(slot: Slot): boolean {
  return activeUse(slot).some((m) => "flip" in m)
}

export function useRewriteOf(modifier: { flip: true } | { ban: string | `$${string}` }, bind?: (name: string) => string): AttackUseRewrite {
  if ("flip" in modifier) return { flip: true }
  const raw = modifier.ban
  if (raw.startsWith("$")) return { ban: bind ? bind(raw) : raw }
  return { ban: raw }
}

export function tickModifiersEnter(gamestate: GameState, activePlayer: 1 | 2): GameState {
  const next = copy(gamestate)
  walkSlots(next, (slot) => {
    for (const m of slot.modifiers) {
      if (m.phase === "pending" && m.until.player === activePlayer) m.phase = "active"
    }
  })
  return next
}

export function tickModifiersEnd(gamestate: GameState, endingPlayer: 1 | 2): GameState {
  let next = copy(gamestate)
  const expired: { slot: SlotId; card: string }[] = []
  eachSeat((id) => {
    const slot = getSlot(next, id)
    slot.modifiers = slot.modifiers.filter((m) => {
      if (m.phase === "active" && m.until.player === endingPlayer) {
        if (m.card) expired.push({ slot: id, card: m.card })
        return false
      }
      return true
    })
  })
  for (const { slot, card } of expired) {
    next = moveSlotToZone(
      next,
      card,
      { ...slot, attachment: "tools" },
      { player: slot.player, zone: "discard" },
      "bottom"
    )
  }
  return next
}
