/**
 * The Vercel deployment, stood up locally for the end-to-end run: the static
 * files `bun run build` wrote to dist/, the rewrites in vercel.json, and the
 * functions in api/ answering as Request to Response, all under Node, the
 * runtime they run on there. The registry is whatever HOMEBASE_MAP_REGISTRY
 * names on the chain HOMEBASE_BASE_RPC reaches, a local one in the suite.
 *
 *   node --import ./e2e/luma-stub.ts e2e/vercel.ts
 */
import * as NFs from "node:fs/promises"
import * as NHttp from "node:http"
import * as NPath from "node:path"
import * as NUrl from "node:url"

const Root = NPath.dirname(NPath.dirname(NUrl.fileURLToPath(import.meta.url)))

const Dist = NPath.join(Root, "dist")

const Port = Number(process.env.PORT ?? 3000)

interface Rewrite {
  readonly source: string
  readonly destination: string
}

type Handler = (request: Request) => Promise<Response>

const Types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

const config = JSON.parse(
  await NFs.readFile(NPath.join(Root, "vercel.json"), "utf8"),
) as {
  rewrites: Rewrite[]
}

/** The function a path is rewritten to, by its exact source; the catch-all is static. */
const functions = new Map(
  config
    .rewrites
    .filter((rewrite) => rewrite.destination.startsWith("/api/"))
    .map((rewrite) => [
      rewrite.source,
      rewrite.destination.slice("/api/".length),
    ]),
)

const loaded = new Map<string, Promise<Record<string, Handler>>>()

const fn = (name: string) => {
  let module = loaded.get(name)

  if (!module) {
    module = import(
      NUrl.pathToFileURL(NPath.join(Root, "api", `${name}.ts`)).href
    ) as Promise<Record<string, Handler>>
    loaded.set(name, module)
  }

  return module
}

async function serveStatic(
  pathname: string,
  response: NHttp.ServerResponse,
): Promise<void> {
  const wanted = NPath.normalize(decodeURIComponent(pathname))
  const file = NPath.join(Dist, wanted)
  const exact = file.startsWith(Dist)
    && (await NFs.stat(file).catch(() => null))?.isFile()
  const path = exact ? file : NPath.join(Dist, "index.html")
  const body = await NFs.readFile(path)

  response.writeHead(200, {
    "content-type": Types[NPath.extname(path)] ?? "application/octet-stream",
    "content-length": body.byteLength,
  })
  response.end(body)
}

async function toRequest(incoming: NHttp.IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []

  for await (const chunk of incoming) {
    chunks.push(chunk as Buffer)
  }

  const headers = new Headers()

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") {
      headers.set(name, value)
    }
  }

  headers.set("x-forwarded-for", incoming.socket.remoteAddress ?? "127.0.0.1")

  const body = Buffer.concat(chunks)

  return new Request(`http://${incoming.headers.host}${incoming.url}`, {
    method: incoming.method,
    headers,
    ...(body.byteLength > 0
      ? {
        body,
      }
      : {}),
  })
}

async function send(answer: Response, response: NHttp.ServerResponse) {
  const body = Buffer.from(await answer.arrayBuffer())

  response.writeHead(answer.status, [
    ...answer.headers.entries(),
  ])
  response.end(body)
}

await NFs.access(NPath.join(Dist, "index.html")).catch(() => {
  throw new Error("dist/ is missing: run `bun run build` first.")
})

const server = NHttp.createServer(async (incoming, response) => {
  try {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`)
    const name = functions.get(url.pathname)

    if (!name) {
      return await serveStatic(url.pathname, response)
    }

    const handler = (await fn(name))[incoming.method ?? "GET"]

    if (!handler) {
      response.writeHead(405)
      response.end()

      return
    }

    await send(await handler(await toRequest(incoming)), response)
  } catch (error) {
    console.error(error)
    response.writeHead(500)
    response.end()
  }
})

server.listen(Port, "127.0.0.1", () => {
  console.log(`Listening on http://127.0.0.1:${Port}`)
})

server.on("error", (error) => {
  console.error(`Is port ${Port} in use? ${error}`)
  process.exit(1)
})
