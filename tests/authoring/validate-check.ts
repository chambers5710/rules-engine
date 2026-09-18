import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Op } from "../../dsl.js"
import { useGate } from "../../interpret.js"
import { CATALOG_SEEDS, validateExpr } from "../../validate.js"
import type { EffectRegistry } from "../../types.js"

const dumpsDir = fileURLToPath(new URL("../../../effect-author/effects/", import.meta.url))
const authored = Object.assign(
  {},
  ...readdirSync(dumpsDir)
    .filter((name) => /^effects_.+\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dumpsDir, name), "utf8")) as EffectRegistry)
) as EffectRegistry

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
    for (const [name, spec] of Object.entries(entry.stadium ?? {})) {
      if (spec.kind !== "use") continue
      const err = validateExpr(spec.then)
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
    for (const [name, spec] of Object.entries(entry.triggers ?? {})) {
      const err = validateExpr(spec.then)
      expect(err === null, `${sourceId} ${name}: ${err}`)
    }
  }
}

{
  expect(useGate(authored["base1-29"]?.attacks?.["Dream Eater"] ?? []) != null, "Dream Eater is a use-gate")
  expect(useGate(authored["basep-19"]?.attacks?.["Synchronize"] ?? []) != null, "Synchronize is a gated bind If")
  expect(useGate(authored["base1-22"]?.attacks?.["Mirror Move"] ?? []) == null, "Mirror Move is skip-then")
  expect(useGate(authored["base1-39"]?.attacks?.["Conversion 1"] ?? []) == null, "Conversion 1 is skip-then")
  expect(useGate(authored["base2-62"]?.attacks?.["Mirror Move"] ?? []) == null, "Jungle Mirror Move is skip-then")
}

console.log("validate-check assertions passed")
