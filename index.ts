import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { pathToFileURL } from "node:url"
import {
  lastDecks,
  openDefaultSession,
  openLoadedSession,
  openSession,
  type CompactDeck,
  type Session,
} from "./session.js"
import { parseGameSave } from "./save.js"

const PORT = 8788

export type ResetBody = { p1?: string; p2?: string; custom?: CompactDeck[] }

export function listen(
  session: Session,
  reset: (body: ResetBody) => Session | Promise<Session>
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
        current = openLoadedSession(parseGameSave(body))
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

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (main) {
  console.log("Initializing...")
  listen(await openDefaultSession(), (body) => {
    const last = lastDecks()
    const p1 = String(body.p1 || last.p1)
    const p2 = String(body.p2 || last.p2)
    if (!p1 || !p2) throw new Error("p1 and p2 deck ids required")
    return openSession(p1, p2, Array.isArray(body.custom) ? body.custom : [])
  })
}
