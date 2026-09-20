import base from "../../data/cards/base1.json" with { type: "json" }
import promos from "../../data/cards/basep.json" with { type: "json" }
import { listen } from "../../index.js"
import { applyModifier } from "../../modifiers.js"
import { applyDamage, applyStatus } from "../../ops.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState, SlotId } from "../../types.js"
import { Phase } from "../../types.js"
import {
  attachEnergy,
  copies,
  initBoard,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = [...(promos as Card[]), ...(base as Card[])]

const FIGHTING = "base1-97"
const FIRE = "base1-98"
const GRASS = "base1-99"
const LIGHTNING = "base1-100"
const PSYCHIC = "base1-101"

const ALAKAZAM = "base1-1"
const CHANSEY = "base1-3"
const HITMONCHAN = "base1-7"
const NIDOKING = "base1-11"
const RAICHU = "base1-14"
const ELECTABUZZ = "base1-20"
const HAUNTER = "base1-29"
const IVYSAUR = "base1-30"
const JYNX = "base1-31"
const MACHOP = "base1-52"
const SANDSHREW = "base1-62"
const RAPIDASH = "basep-51"

const names = [
  "checkup",
  "poison",
  "burn",
  "asleep",
  "paralyzed",
  "confused",
  "confuse-hit",
  "paralyze-clear",
  "doubleslap",
  "thrash",
  "agility",
  "sand",
  "gated",
  "protect",
  "resist",
  "super",
  "weak",
  "ko",
  "ko-poison",
  "ko-asleep",
  "scrunch",
  "opening",
] as const
type Name = (typeof names)[number]

const blurb: Record<Name, string> = {
  checkup: "PASS. Chansey is Poisoned + Burned + Asleep — purple tick, burn coin, wake coin.",
  poison: "Poisonpowder. Hit, then poison lands, then Checkup tick.",
  burn: "Super Singe. Hit, post-hit burn coin, then Checkup burn if it stuck.",
  asleep: "Hypnosis. Asleep badge hold, then Checkup wake / still-asleep coin.",
  paralyzed: "Thundershock. Hit, post-hit paralyze coin.",
  confused: "Confuse Ray into Hitmonchan. SUPER (Psychic×2), post-hit confuse coin.",
  "confuse-hit": "ATTACK. Electabuzz starts Confused — pre-hit confuse coin, then hit or 30 recoil.",
  "paralyze-clear": "PASS. Chansey starts Paralyzed — Checkup lifts it (PARALYZED relief).",
  doubleslap: "Doubleslap. Two coins on one overlay (H/T record).",
  thrash: "Thrash. Attack coin; tails is hit + recoil.",
  agility: "Agility. Hit, then post-hit prevent coin.",
  sand: "Sand-attack. Applies the next-turn attack gate (see gated).",
  gated: "ATTACK. Sand-attack flip already live — pre-hit gate coin, tails does nothing.",
  protect: "Jab. Defender shield is up — PROTECT, no HP.",
  resist: "Confuse Ray into Chansey. Psychic −30 floors 30 to 0 — PROTECT.",
  super: "Jab into Chansey. Fighting weakness — SUPER EFFECTIVE.",
  weak: "Dream Eater (Chansey is Asleep). 50 − 30 resist — WEAK, then Checkup wake.",
  ko: "Jab. Machop is on 10 HP with a bench — HIT then KNOCK OUT, prize, promote.",
  "ko-poison": "PASS. Machop on 10 HP + Poisoned — purple tick into KO (no wake).",
  "ko-asleep": "Jab. Machop on 10 HP + Asleep — HIT then KO, no wake coin.",
  scrunch: "Scrunch. Coin; heads is prevent-next-turn.",
  opening: "READY on both seats. Leaves init — first-player coin (heads = P1).",
}

function startName(): Name {
  const raw = process.argv.find((arg) => names.includes(arg as Name))
  return (raw as Name) ?? "checkup"
}

function nextName(name: Name): Name {
  return names[(names.indexOf(name) + 1) % names.length]
}

const active = (player: 1 | 2): SlotId => ({ player, slot: "active" })

async function stage(
  p1: string,
  e1: string,
  attach1: number,
  p2 = CHANSEY,
  e2 = FIGHTING,
  attach2 = 2,
  extras?: { bench2?: string; phase?: "init" | "turn" },
): Promise<GameState> {
  const lead = printed(set, p1)
  const foe = printed(set, p2)
  const energy1 = printed(set, e1)
  const energy2 = printed(set, e2)
  const bench = extras?.bench2 ? printed(set, extras.bench2) : undefined
  let gamestate = await initBoard(
    [lead, lead, ...copies(energy1, 20)],
    bench ? [foe, bench, ...copies(energy2, 18)] : [foe, foe, ...copies(energy2, 16)],
  )
  gamestate = moveToActive(gamestate, 1, p1)
  gamestate = moveToActive(gamestate, 2, p2)
  if (bench) gamestate = moveToBench(gamestate, 2, extras!.bench2!, 0)
  if (attach1) gamestate = attachEnergy(gamestate, 1, e1, attach1)
  if (attach2) gamestate = attachEnergy(gamestate, 2, e2, attach2)
  gamestate = toPrize(gamestate, 1, e1, 6)
  gamestate = toPrize(gamestate, 2, e2, 6)
  gamestate = toHand(gamestate, 1, e1, 3)
  if (extras?.phase === "init") {
    return { ...gamestate, phase: Phase.Init, setupReady: { 1: false, 2: false }, turnCount: 0 }
  }
  return liveTurn(gamestate)
}

async function board(name: Name): Promise<GameState> {
  if (name === "checkup") {
    let gamestate = await stage(HITMONCHAN, FIGHTING, 1)
    gamestate = applyStatus(gamestate, "poison", active(2))
    gamestate = applyStatus(gamestate, "burn", active(2))
    return applyStatus(gamestate, "asleep", active(2))
  }
  if (name === "poison") return stage(IVYSAUR, GRASS, 3)
  if (name === "burn") {
    const rapidash = printed(set, RAPIDASH)
    const chansey = printed(set, CHANSEY)
    const fire = printed(set, FIRE)
    const fighting = printed(set, FIGHTING)
    let gamestate = await initBoard(
      [rapidash, rapidash, fire, ...copies(fighting, 18)],
      [chansey, chansey, ...copies(fighting, 16)],
    )
    gamestate = moveToActive(gamestate, 1, RAPIDASH)
    gamestate = moveToActive(gamestate, 2, CHANSEY)
    gamestate = attachEnergy(gamestate, 1, FIRE, 1)
    gamestate = attachEnergy(gamestate, 1, FIGHTING, 2)
    gamestate = attachEnergy(gamestate, 2, FIGHTING, 2)
    gamestate = toPrize(gamestate, 1, FIGHTING, 6)
    gamestate = toPrize(gamestate, 2, FIGHTING, 6)
    gamestate = toHand(gamestate, 1, FIGHTING, 3)
    return liveTurn(gamestate)
  }
  if (name === "asleep") return stage(HAUNTER, PSYCHIC, 2)
  if (name === "paralyzed") return stage(ELECTABUZZ, LIGHTNING, 1)
  if (name === "confused") return stage(ALAKAZAM, PSYCHIC, 3, HITMONCHAN, FIGHTING, 1)
  if (name === "confuse-hit") {
    return applyStatus(await stage(ELECTABUZZ, LIGHTNING, 1), "confused", active(1))
  }
  if (name === "paralyze-clear") {
    return applyStatus(await stage(HITMONCHAN, FIGHTING, 1), "paralyzed", active(2))
  }
  if (name === "doubleslap") return stage(JYNX, PSYCHIC, 1, MACHOP, FIGHTING, 1)
  if (name === "thrash") return stage(NIDOKING, GRASS, 3)
  if (name === "agility") return stage(RAICHU, LIGHTNING, 3)
  if (name === "sand") return stage(SANDSHREW, FIGHTING, 1)
  if (name === "gated") {
    return applyModifier(await stage(ELECTABUZZ, LIGHTNING, 1), active(1), {
      field: "attack_use",
      flip: true,
      until: { beat: "end_of_turn", player: 1 },
    })
  }
  if (name === "protect") {
    return applyModifier(await stage(HITMONCHAN, FIGHTING, 1), active(2), {
      field: "attack_effects",
      prevent: "all",
      until: { beat: "end_of_turn", player: 1 },
    })
  }
  if (name === "resist") return stage(ALAKAZAM, PSYCHIC, 3)
  if (name === "super") return stage(HITMONCHAN, FIGHTING, 1)
  if (name === "weak") {
    return applyStatus(await stage(HAUNTER, PSYCHIC, 2), "asleep", active(2))
  }
  if (name === "ko") {
    return applyDamage(await stage(HITMONCHAN, FIGHTING, 1, MACHOP, FIGHTING, 1, { bench2: CHANSEY }), 40, active(2))
  }
  if (name === "ko-poison") {
    let gamestate = await stage(HITMONCHAN, FIGHTING, 1, MACHOP, FIGHTING, 1, { bench2: CHANSEY })
    gamestate = applyDamage(gamestate, 40, active(2))
    return applyStatus(gamestate, "poison", active(2))
  }
  if (name === "ko-asleep") {
    let gamestate = await stage(HITMONCHAN, FIGHTING, 1, MACHOP, FIGHTING, 1, { bench2: CHANSEY })
    gamestate = applyDamage(gamestate, 40, active(2))
    return applyStatus(gamestate, "asleep", active(2))
  }
  if (name === "scrunch") return stage(CHANSEY, FIGHTING, 2, HITMONCHAN, FIGHTING, 3)
  return stage(HITMONCHAN, FIGHTING, 1, CHANSEY, FIGHTING, 2, { phase: "init" })
}

async function session(name: Name) {
  return createSessionFromState(await board(name))
}

let current: Name = startName()
console.log("Feel — every status / knockout / coin overlay")
console.log(`boards: ${names.join(" / ")}`)
console.log(`board: ${current}`)
console.log(blurb[current])
console.log("LOCAL ENGINE in the UI → this session on :8788")
console.log("pnpm serve:fx -- checkup   (or any board name). POST /reset cycles. { p1: \"<name>\" } jumps.")
listen(await session(current), (body) => {
  const asked = body.p1
  current = names.includes(asked as Name) ? (asked as Name) : nextName(current)
  console.log(`board: ${current}`)
  console.log(blurb[current])
  return session(current)
})
