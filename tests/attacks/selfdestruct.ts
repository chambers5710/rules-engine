import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { applyDamage } from "../../ops.js"
import { createSessionFromState } from "../../session.js"
import type { Card, GameState } from "../../types.js"
import { DAMAGE_COUNTER } from "../../types.js"
import {
  initBoard,
  attachEnergy,
  copies,
  liveTurn,
  moveToActive,
  moveToBench,
  printed,
  toHand,
  toPrize,
} from "../fixture.js"

const set = cards as Card[]

function pack(ids: string[]) {
  return ids.map((id) => printed(set, id))
}

function stageSide(
  gamestate: GameState,
  player: 1 | 2,
  active: string,
  bench: [string, string, string]
): GameState {
  gamestate = moveToActive(gamestate, player, active)
  gamestate = moveToBench(gamestate, player, bench[0], 0)
  gamestate = moveToBench(gamestate, player, bench[1], 1)
  gamestate = moveToBench(gamestate, player, bench[2], 2)
  gamestate = applyDamage(gamestate, 2 * DAMAGE_COUNTER, { player, slot: "bench", index: 0 })
  gamestate = applyDamage(gamestate, 2 * DAMAGE_COUNTER, { player, slot: "bench", index: 2 })
  return gamestate
}

async function board() {
  const lightning = printed(set, "base1-100")
  const fighting = printed(set, "base1-97")

  let gamestate = await initBoard(
    [
      ...pack([
        "base1-9", "base1-9", "base1-35", "base1-58", "base1-43", "base1-46", "base1-5",
        "base1-91", "base1-94", "base1-93",
      ]),
      ...copies(lightning, 16),
    ],
    [
      ...pack([
        "base1-7", "base1-7", "base1-35", "base1-63", "base1-43", "base1-28", "base1-20",
        "base1-92", "base1-95", "base1-94",
      ]),
      ...copies(fighting, 16),
    ]
  )

  gamestate = stageSide(gamestate, 1, "base1-9", ["base1-35", "base1-58", "base1-43"])
  gamestate = stageSide(gamestate, 2, "base1-7", ["base1-35", "base1-63", "base1-43"])
  gamestate = attachEnergy(gamestate, 1, "base1-100", 2)
  gamestate = attachEnergy(gamestate, 2, "base1-97", 1)
  gamestate = toHand(gamestate, 1, "base1-46", 1)
  gamestate = toHand(gamestate, 1, "base1-5", 1)
  gamestate = toHand(gamestate, 1, "base1-91", 1)
  gamestate = toHand(gamestate, 1, "base1-94", 1)
  gamestate = toHand(gamestate, 1, "base1-93", 1)
  gamestate = toHand(gamestate, 1, "base1-100", 4)
  gamestate = toHand(gamestate, 2, "base1-28", 1)
  gamestate = toHand(gamestate, 2, "base1-20", 1)
  gamestate = toHand(gamestate, 2, "base1-92", 1)
  gamestate = toHand(gamestate, 2, "base1-95", 1)
  gamestate = toHand(gamestate, 2, "base1-94", 1)
  gamestate = toHand(gamestate, 2, "base1-97", 4)
  gamestate = toPrize(gamestate, 1, "base1-100", 6)
  gamestate = toPrize(gamestate, 2, "base1-97", 6)
  return liveTurn(gamestate)
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Magneton Selfdestruct — trainers in hand: Bill / Potion / Gust; P2 Energy Removal / Switch / Potion")
listen(await session(), () => session())
