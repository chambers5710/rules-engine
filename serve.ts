import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { openDefaultSession, openSession } from "./session.js"

const PORT = 8788

console.log("Initializing...")
let session = await openDefaultSession()

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
    send(res, 200, session.frame())
    return
  }

  if (req.method === "POST" && url.pathname === "/choose") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}") as { index?: unknown }
      send(res, 200, session.choose(Number(body.index)))
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : "choose failed" })
    }
    return
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}") as { p1?: unknown; p2?: unknown }
      const p1 = String(body.p1 ?? "")
      const p2 = String(body.p2 ?? "")
      if (!p1 || !p2) throw new Error("p1 and p2 deck ids required")
      session = await openSession(p1, p2)
      send(res, 200, session.frame())
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : "reset failed" })
    }
    return
  }

  send(res, 404, { error: "not found" })
}).listen(PORT, () => {
  console.log(`session  GET /state  POST /choose  POST /reset  →  http://127.0.0.1:${PORT}`)
})
