import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** WOTC product sets — name → evolvesFrom, first file wins. Not a full-catalog import. */
const SETS = ["base1", "base2", "base3", "base4", "base5", "base6", "basep"]

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const cardsDir = join(root, "data/cards")
const outPath = join(root, "data/lineage.json")

const files = new Set(await readdir(cardsDir))
const table = {}
for (const setId of SETS) {
  const file = `${setId}.json`
  if (!files.has(file)) throw new Error(`missing ${file}`)
  const cards = JSON.parse(await readFile(join(cardsDir, file), "utf8"))
  for (const card of cards) {
    if (card.supertype !== "Pokémon" || !card.name || !card.evolvesFrom) continue
    if (table[card.name] === undefined) table[card.name] = card.evolvesFrom
    else if (table[card.name] !== card.evolvesFrom) {
      throw new Error(`${card.name}: ${table[card.name]} vs ${card.evolvesFrom} (${file})`)
    }
  }
}

const names = Object.keys(table).sort()
const ordered = Object.fromEntries(names.map((name) => [name, table[name]]))
await writeFile(outPath, `${JSON.stringify(ordered, null, 2)}\n`)
console.log(`wrote ${names.length} names to data/lineage.json`)
