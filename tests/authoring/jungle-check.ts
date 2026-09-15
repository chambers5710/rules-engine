import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateExpr } from "../../validate.js"
import type { Expr } from "../../dsl.js"

type DumpCard = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
  powers?: Record<string, { kind?: string }>
}
type Dump = Record<string, DumpCard>

const dump = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../effect-author/effects/effects_base2.json", import.meta.url)), "utf8")
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

function power(id: string, name: string, kind: string) {
  const spec = card(id).powers?.[name] as { kind?: string } | undefined
  expect(spec?.kind === kind, `${id} ${name}: want ${kind}, got ${spec?.kind ?? "missing"}`)
}

const twins = [
  ["base2-2", "base2-18", "Chain Lightning"],
  ["base2-7", "base2-23", "Boyfriends"],
  ["base2-10", "base2-26", "Swords Dance"],
  ["base2-14", "base2-30", "Acid"],
] as const
for (const [holo, print, name] of twins) {
  attack(holo, name)
  attack(print, name)
}

attack("base2-8", "Hurricane")
attack("base2-24", "Hurricane")
attack("base2-39", "Call for Friend")
attack("base2-42", "Pounce")
attack("base2-49", "Call for Family")
attack("base2-50", "Snivel")
attack("base2-51", "Tail Wag")
attack("base2-57", "Call for Family")
attack("base2-58", "Sprout")
attack("base2-61", "Leer")
attack("base2-62", "Mirror Move")
ability("base2-13", "Shift")
ability("base2-29", "Shift")
ability("base2-55", "Peek")
power("base2-6", "Invisible Wall", "prevent_damage")
power("base2-22", "Invisible Wall", "prevent_damage")
power("base2-11", "Thick Skinned", "blocks_status")
power("base2-27", "Thick Skinned", "blocks_status")
power("base2-34", "Retreat Aid", "reduce_retreat")

console.log("jungle-check assertions passed")
