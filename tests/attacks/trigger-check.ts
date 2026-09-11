import { createSessionFromState } from "../../session.js"
import { board } from "./trigger.js"

function play(labelPart: string, start = board("strikes")) {
  const session = createSessionFromState(start)
  const i = session.frame().choices.findIndex((c) => c.label.includes(labelPart))
  if (i < 0) throw new Error(`no ${labelPart}: ${session.frame().choices.map((c) => c.label).join(" | ")}`)
  return session.choose(i)
}

{
  const next = play("Low Kick", board("strikes")).gamestate
  const champ = next.players[2].active.damage
  const machop = next.players[1].active.damage
  if (champ !== 20) throw new Error(`strikes Machamp ${champ}`)
  if (machop !== 10) throw new Error(`strikes Machop ${machop}`)
  console.log("strikes ok", { champ, machop })
}

{
  const next = play("Mirror Move", board("mirror")).gamestate
  const onMachop = next.players[2].active.damage
  if (onMachop !== 20) throw new Error(`mirror ${onMachop}`)
  console.log("mirror ok", { onMachop })
}

{
  const session = createSessionFromState(board("bond"))
  const bond = session.frame().choices.findIndex((c) => c.label.includes("Destiny Bond"))
  if (bond < 0) throw new Error("no Destiny Bond")
  let frame = session.choose(bond)
  const payI = frame.choices.findIndex((c) => c.label.startsWith("select  "))
  if (payI < 0) throw new Error(`no pay: ${frame.choices.map((c) => c.label).join(" | ")}`)
  frame = session.choose(payI)
  if (frame.gamestate.activePlayer !== 2) throw new Error(`expected P2 turn, ${frame.gamestate.activePlayer}`)
  const punch = frame.choices.findIndex((c) => c.label.includes("Special Punch"))
  if (punch < 0) throw new Error(`no punch: ${frame.choices.map((c) => c.label).join(" | ")}`)
  frame = session.choose(punch)
  const p1 = frame.gamestate.players[1].active.evolution.length
  const p2 = frame.gamestate.players[2].active.evolution.length
  if (p1 !== 0) throw new Error("Gastly should be KO")
  if (p2 !== 0) throw new Error("Hitmonchan should be KO")
  console.log("bond ok", { p1empty: p1 === 0, p2empty: p2 === 0 })
}

console.log("ok")
