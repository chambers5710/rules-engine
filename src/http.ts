import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { parseGameSave, type GameSave } from "../save.js"
import { openLoadedSession, type CompactDeck, type Session } from "./session.js"

const PORT = 8788

export type ResetBody = {
  p1?: string
  p2?: string
  compactDecks?: CompactDeck[]
  /** @deprecated same as compactDecks */
  custom?: CompactDeck[]
}

export function listen(
  session: Session,
  reset: (body: ResetBody) => Session | Promise<Session>,
  load: (save: GameSave) => Session = openLoadedSession,
) {
  let current = session

  function cors(res: ServerResponse) {
    res.setHeader("access-control-allow-origin", "*")
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
    res.setHeader("access-control-allow-headers", "content-type")
  }

  function send(res: ServerResponse, status: number, body: unknown) {
    cors(res)
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => chunks.push(chunk))
      req.on("end", () => resolve(Buffer.concat(chunks).toString()))
      req.on("error", reject)
    })
  }

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`)

    if (req.method === "OPTIONS") {
      cors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === "GET" && url.pathname === "/state") {
      send(res, 200, current.frame())
      return
    }

    if (req.method === "POST" && url.pathname === "/choose") {
      try {
        const body = JSON.parse((await readBody(req)) || "{}") as { index?: unknown }
        send(res, 200, current.choose(Number(body.index)))
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : "choose failed" })
      }
      return
    }

    if (req.method === "POST" && url.pathname === "/rewind") {
      try {
        const body = JSON.parse((await readBody(req)) || "{}") as { n?: unknown }
        const n = body.n === undefined ? 1 : Number(body.n)
        send(res, 200, current.rewind(n))
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : "rewind failed" })
      }
      return
    }

    if (req.method === "POST" && url.pathname === "/load") {
      try {
        const body = JSON.parse((await readBody(req)) || "null") as unknown
        current = load(parseGameSave(body))
        send(res, 200, current.frame())
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : "load failed" })
      }
      return
    }

    if (req.method === "POST" && url.pathname === "/reset") {
      try {
        const body = JSON.parse((await readBody(req)) || "{}") as ResetBody
        current = await reset(body)
        send(res, 200, current.frame())
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : "reset failed" })
      }
      return
    }

    send(res, 404, { error: "not found" })
  }).listen(PORT, () => {
    console.log(`session  GET /state  POST /choose  POST /rewind  POST /load  POST /reset  →  http://127.0.0.1:${PORT}`)
  })
}
