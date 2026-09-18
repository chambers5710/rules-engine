import { currentForm, getSlot } from "./board.js"
import { halveAttackDamage, preventsAttackDamage, preventsAttackEffects } from "./reads.js"
import { clockActivates, clockExpires } from "./clock.js"
import { copy, moveSlotToZone } from "./ops.js"
import type { AttackDamageRewrite, AttackUseRewrite, EnergyType, GameState, Modifier, Slot, SlotId } from "./types.js"

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
  if ("mul" in modifier) return { mul: modifier.mul }
  return { prevent: modifier.prevent }
}

type ModifierWrite = {
  [F in Modifier["field"]]: Omit<Extract<Modifier, { field: F }>, "phase">
}[Modifier["field"]]

export function applyModifier(
  gamestate: GameState,
  slot: SlotId,
  modifier: ModifierWrite
): GameState {
  const next = copy(gamestate, slot.player)
  const phase =
    modifier.until.beat === "leave_play" || modifier.until.beat === "leave_active"
      ? "active"
      : modifier.until.next
        ? "pending"
        : modifier.until.player === gamestate.activePlayer
          ? "active"
          : "pending"
  const seat = getSlot(next, slot)
  if (modifier.field === "weakness_type" || modifier.field === "resistance_type") {
    seat.modifiers = seat.modifiers.filter((m) => m.field !== modifier.field)
  }
  seat.modifiers.push({ ...modifier, phase } as Modifier)
  return next
}

function attackDamageMods(
  gamestate: GameState,
  slot: SlotId,
  attacker?: SlotId
): Extract<Modifier, { field: "attack_damage" }>[] {
  const attackerId = attacker
    ? currentForm(gamestate, getSlot(gamestate, attacker))?.instanceId
    : undefined
  return getSlot(gamestate, slot).modifiers.filter(
    (m): m is Extract<Modifier, { field: "attack_damage" }> =>
      m.field === "attack_damage" &&
      m.phase === "active" &&
      !m.attack &&
      (!m.from || m.from === attackerId)
  )
}

/** Defender add/sub before Weakness / Resistance (Togepi Snivel). */
export function foldBeforeMatchup(
  gamestate: GameState,
  slot: SlotId,
  base: number,
  attacker?: SlotId
): number {
  let damage = base
  for (const m of attackDamageMods(gamestate, slot, attacker)) {
    if (m.before !== "matchup") continue
    const rewrite = rewriteOf(m)
    if ("add" in rewrite) damage += rewrite.add
    if ("sub" in rewrite) damage = Math.max(0, damage - rewrite.sub)
  }
  return Math.max(0, damage)
}

export function foldDamage(gamestate: GameState, slot: SlotId, base: number, attacker?: SlotId): number {
  const mods = attackDamageMods(gamestate, slot, attacker).filter((m) => m.before !== "matchup")
  let damage = base
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("add" in rewrite) damage += rewrite.add
    if ("sub" in rewrite) damage = Math.max(0, damage - rewrite.sub)
  }
  damage = Math.max(0, damage)
  damage = halveAttackDamage(gamestate, getSlot(gamestate, slot), damage)
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("prevent" in rewrite && damage <= rewrite.prevent) {
      damage = 0
    }
  }
  for (const m of mods) {
    const rewrite = rewriteOf(m)
    if ("set" in rewrite) damage = rewrite.set
  }
  damage = Math.max(0, damage)
  return preventsAttackDamage(gamestate, getSlot(gamestate, slot), damage) ? 0 : damage
}

export function foldAdds(gamestate: GameState, slot: SlotId, base: number): number {
  let damage = base
  for (const m of getSlot(gamestate, slot).modifiers) {
    if (m.field !== "attack_damage" || m.phase !== "active" || m.attack || !("add" in m)) continue
    damage += m.add
  }
  return Math.max(0, damage)
}

/** Name-scoped `set` on the attacker — base, before W/R (Swords Dance). */
export function foldAttackBase(
  gamestate: GameState,
  slot: SlotId,
  base: number,
  attack?: string
): number {
  if (!attack) return base
  let damage = base
  for (const m of getSlot(gamestate, slot).modifiers) {
    if (m.field !== "attack_damage" || m.phase !== "active" || m.attack !== attack) continue
    if ("set" in m) damage = m.set
  }
  return Math.max(0, damage)
}

function activeUse(slot: Slot): Extract<Modifier, { field: "attack_use" }>[] {
  return slot.modifiers.filter((m): m is Extract<Modifier, { field: "attack_use" }> =>
    m.field === "attack_use" && m.phase === "active"
  )
}

function activeAbilityUse(slot: Slot): Extract<Modifier, { field: "ability_use" }>[] {
  return slot.modifiers.filter((m): m is Extract<Modifier, { field: "ability_use" }> =>
    m.field === "ability_use" && m.phase === "active"
  )
}

export function effectsPrevented(gamestate: GameState, slot: SlotId, from?: Slot): boolean {
  if (preventsAttackEffects(gamestate, slot, from)) return true
  return getSlot(gamestate, slot).modifiers.some(
    (m) => m.field === "attack_effects" && m.phase === "active" && m.prevent === "all"
  )
}

export function attackBanned(slot: Slot, name: string): boolean {
  return activeUse(slot).some((m) => "ban" in m && m.ban === name)
}

export function abilityBanned(slot: Slot, name: string): boolean {
  return activeAbilityUse(slot).some((m) => m.ban === name)
}

/** Texture Magic / Slashing Strike: benching that Pokémon drops `leave_active` clocks. Mutates a copied seat. */
export function stripLeaveActive(slot: Slot): void {
  slot.modifiers = slot.modifiers.filter((m) => {
    if (m.until.beat === "leave_active") return false
    if (m.until.beat === "end_of_turn" && m.until.leave_active) return false
    return true
  })
}

/** Tail Wag / Snivel: benching or discarding Active drops target-scoped locks. Mutates a copied state. */
export function stripPairLocks(gamestate: GameState, leftActive: readonly string[]): void {
  if (leftActive.length === 0) return
  const gone = new Set(leftActive)
  walkSlots(gamestate, (slot) => {
    const seatLeft = slot.evolution.some((id) => gone.has(id))
    slot.modifiers = slot.modifiers.filter((m) => {
      if (m.field === "can_attack") {
        if (seatLeft || gone.has(m.forbid)) return false
      }
      if (m.field === "attack_damage" && m.from) {
        if (seatLeft || gone.has(m.from)) return false
      }
      return true
    })
  })
}

export function attackFlipGated(slot: Slot): boolean {
  return activeUse(slot).some((m) => "flip" in m)
}

export function foldedMatchupType(
  gamestate: GameState,
  slot: SlotId,
  field: "weakness_type" | "resistance_type"
): EnergyType | undefined {
  for (const m of getSlot(gamestate, slot).modifiers) {
    if (m.field === field && m.phase === "active") return m.set
  }
}

export function foldedEnergyType(gamestate: GameState, slot: SlotId): EnergyType | undefined {
  for (const m of getSlot(gamestate, slot).modifiers) {
    if (m.field === "energy_type" && m.phase === "active") return m.set
  }
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
      if (clockActivates(m, activePlayer)) m.phase = "active"
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
      if (clockExpires(m, endingPlayer)) {
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
