import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateExpr } from "../../validate.js"
import type { Expr } from "../../dsl.js"

type DumpCard = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
  trainer?: Record<string, Expr>
  triggers?: Record<string, { when?: string; then?: Expr }>
  powers?: Record<string, { kind?: string }>
  energy?: { paysAny?: true; onAttach?: Expr }
}
type Dump = Record<string, DumpCard>

const dump = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../effect-author/effects/effects_base5.json", import.meta.url)), "utf8")
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

function trigger(id: string, name: string, when: string) {
  const spec = card(id).triggers?.[name]
  expect(spec?.when === when, `${id} ${name}: want when ${when}`)
  const err = validateExpr(spec!.then ?? [])
  expect(err === null, `${id} ${name}: ${err}`)
}

function power(id: string, name: string, kind: string) {
  const spec = card(id).powers?.[name]
  expect(spec?.kind === kind, `${id} ${name}: want ${kind}, got ${spec?.kind ?? "missing"}`)
}

function ability(id: string, name: string) {
  const expr = card(id).abilities?.[name]
  expect((expr?.length ?? 0) > 0, `${id} ${name}: missing ability`)
  const err = validateExpr(expr!)
  expect(err === null, `${id} ${name}: ${err}`)
}

function trainer(id: string, name: string) {
  const expr = card(id).trainer?.[name]
  expect((expr?.length ?? 0) > 0, `${id} ${name}: missing trainer`)
  const err = validateExpr(expr!)
  expect(err === null, `${id} ${name}: ${err}`)
}

function energy(id: string, paysAny?: true) {
  const spec = card(id).energy
  expect(spec != null, `${id}: missing energy spec`)
  if (paysAny) expect(spec!.paysAny === true, `${id}: paysAny`)
  if (spec!.onAttach) {
    const err = validateExpr(spec!.onAttach)
    expect(err === null, `${id} onAttach: ${err}`)
  }
}

trigger("base5-5", "Summon Minions", "played")
trigger("base5-22", "Summon Minions", "played")
trigger("base5-7", "Sneak Attack", "played")
trigger("base5-24", "Sneak Attack", "played")
trigger("base5-12", "Reel In", "played")
trigger("base5-29", "Reel In", "played")
trigger("base5-6", "Sinkhole", "retreated")
trigger("base5-23", "Sinkhole", "retreated")
trigger("base5-8", "Final Beam", "pokemon_knocked_out")
trigger("base5-25", "Final Beam", "pokemon_knocked_out")
power("base5-13", "Hay Fever", "block_trainers")
power("base5-30", "Hay Fever", "block_trainers")
power("base5-41", "Sticky Goo", "tax_retreat")
power("base5-43", "Frenzy", "confused_damage")
ability("base5-33", "Evolutionary Light")
trainer("base5-15", "Here Comes Team Rocket!")
trainer("base5-71", "Here Comes Team Rocket!")
trainer("base5-73", "The Boss's Way")
trainer("base5-74", "Challenge!")
trainer("base5-77", "Nightly Garbage Run")
energy("base5-17", true)
energy("base5-80", true)
energy("base5-81")
energy("base5-82")
expect((card("base5-46").attacks?.["Mirror Shell"]?.length ?? 0) > 0, "Mirror Shell")
expect(validateExpr(card("base5-46").attacks!["Mirror Shell"]!) === null, "Mirror Shell expr")
