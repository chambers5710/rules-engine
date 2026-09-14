import cards from "../../data/cards/base1.json" with { type: "json" }
import { listen } from "../../index.js"
import { createSessionFromState } from "../../session.js"
import type { Card } from "../../types.js"
import {
  initBoard, copies, printed } from "../fixture.js"

const set = cards as Card[]

async function board() {
  const blastoise = printed(set, "base1-2")
  const chansey = printed(set, "base1-3")
  const water = printed(set, "base1-102")
  const fighting = printed(set, "base1-97")

  return await initBoard(
    [blastoise, blastoise, ...copies(water, 16)],
    [chansey, chansey, ...copies(fighting, 16)]
  )
}

async function session() {
  return createSessionFromState(await board())
}

console.log("Init — Play Active (Blastoise vs Chansey)")
listen(await session(), () => session())
