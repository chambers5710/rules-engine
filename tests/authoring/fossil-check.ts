import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateExpr } from "../../validate.js"
import type { Expr } from "../../dsl.js"

type DumpCard = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}
type Dump = Record<string, DumpCard>

const dump = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../effect-author/effects/effects_base3.json", import.meta.url)), "utf8")
) as Dump

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

function card(id: string): DumpCard {
  const row = dump[id]
  expect(row != null, `${id}: missing dump row`)
  return row
}

function attack(id: string, name: string) {
  const expr = card(id).attacks?.[name]
  expect((expr?.length ?? 0) > 0, `${id} ${name}: missing attack`)
  const err = validateExpr(expr!)
  expect(err === null, `${id} ${name}: ${err}`)
}

function ability(id: string, name: string) {
  const expr = card(id).abilities?.[name]
  expect((expr?.length ?? 0) > 0, `${id} ${name}: missing ability`)
  const err = validateExpr(expr!)
  expect(err === null, `${id} ${name}: ${err}`)
}

attack("base3-53", "Headache")
attack("base3-53", "Fury Swipes")
attack("base3-55", "Spacing Out")
attack("base3-55", "Scavenge")
ability("base3-4", "Step In")
ability("base3-19", "Step In")
ability("base3-5", "Curse")
ability("base3-20", "Curse")
ability("base3-43", "Strange Behavior")
ability("base3-56", "Cowardice")

console.log("fossil-check assertions passed")
