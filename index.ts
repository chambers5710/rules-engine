import { pathToFileURL } from "node:url"
import { listen, type ResetBody } from "./src/http.js"
import { openLoadedSession, openSession, type CompactDeck, type Session } from "./src/session.js"

export type { ResetBody, Session }
export { listen }

const DEFAULTS = { p1: "d-base1-1", p2: "d-base1-2" }
let last = { ...DEFAULTS }
let compactDecks: CompactDeck[] = []

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (main) {
  console.log("Initializing...")
  listen(
    await openSession(last.p1, last.p2),
    (body) => {
      last = {
        p1: String(body.p1 || last.p1),
        p2: String(body.p2 || last.p2),
      }
      if (!last.p1 || !last.p2) throw new Error("p1 and p2 deck ids required")
      const incoming = Array.isArray(body.compactDecks)
        ? body.compactDecks
        : Array.isArray(body.custom)
          ? body.custom
          : undefined
      if (incoming?.length) compactDecks = incoming
      return openSession(last.p1, last.p2, compactDecks)
    },
    (save) => {
      last = save.decks
      if (save.custom?.length) compactDecks = save.custom
      return openLoadedSession(save)
    },
  )
}
