import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const envPath = fileURLToPath(new URL("../.env", import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

/** Card catalog origin (`GET /api/decks`, `/api/cards`, `/api/effects`). */
export function cardApi(): string {
  const url = (process.env.CARD_API ?? "http://127.0.0.1:8787").trim().replace(/\/$/, "")
  if (!url) throw new Error("CARD_API is empty")
  return url
}
