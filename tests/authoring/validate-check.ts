import authored from "../../../tcg-effect-author/effects/effects.json" with { type: "json" }
import { Op, type Expr } from "../../dsl.js"
import { CATALOG_SEEDS, validateExpr } from "../../validate.js"
import type { EffectRegistry } from "../../types.js"

function fail(message: string): never {
  throw new Error(message)
}

function expect(ok: boolean, message: string) {
  if (!ok) fail(message)
}

{
  const err = validateExpr(
    [{ op: Op.ApplyDamage, amount: 10, slot: "$missing" }],
    []
  )
  expect(err?.includes("$missing") === true, "unread bind is an error")
}

{
  const err = validateExpr(
    [
      { op: Op.FlipCoin, bind: "$coin" },
      { op: Op.If, bind: "$coin", equals: "heads", then: [{ op: Op.ApplyDamage, amount: 10, slot: "$defending" }] },
    ],
    ["$defending"]
  )
  expect(err === null, "written bind may be read")
}

{
  const err = validateExpr(
    [
      {
        op: Op.Select,
        pick: "slots",
        who: "self",
        bind: "$seat",
        filter: { kind: "energy", type: "Fire" },
      },
    ] as unknown as Expr,
    CATALOG_SEEDS
  )
  expect(err?.includes("slot filter") === true, "card filter on slots is an error")
}

{
  const registry = authored as EffectRegistry
  for (const [sourceId, entry] of Object.entries(registry)) {
    for (const [name, expr] of Object.entries(entry.attacks ?? {})) {
      const err = validateExpr(expr)
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
    for (const [name, expr] of Object.entries(entry.abilities ?? {})) {
      const err = validateExpr(expr)
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
    for (const [name, expr] of Object.entries(entry.trainer ?? {})) {
      const err = validateExpr(expr)
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
    for (const [name, spec] of Object.entries(entry.triggers ?? {})) {
      const err = validateExpr(spec.then, ["$self_slot", "$attacker"])
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
  }
}

console.log("validate-check assertions passed")
