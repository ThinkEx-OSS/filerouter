import { Container, getRandom } from "@cloudflare/containers"

const PDF_INSPECTOR_POOL_SIZE = 2
const LITEPARSE_POOL_SIZE = 1

export class PdfInspectorContainer extends Container {
  defaultPort = 8080
  sleepAfter = "10m"
}

export class LiteParseContainer extends Container {
  defaultPort = 8080
  sleepAfter = "10m"
}

type ParserEnv = {
  LITEPARSE_CONTAINERS: DurableObjectNamespace<LiteParseContainer>
  PDF_INSPECTOR_CONTAINERS: DurableObjectNamespace<PdfInspectorContainer>
  SOURCE_ORIGIN: string
}

type ParserPool = {
  binding:
    | DurableObjectNamespace<LiteParseContainer>
    | DurableObjectNamespace<PdfInspectorContainer>
  size: number
}

export default {
  async fetch(request: Request, env: ParserEnv): Promise<Response> {
    const url = new URL(request.url)
    const pool = parserPool(url.pathname, env)
    if (!pool) {
      return jsonError(404, "parser_not_found", "Parser route not found.")
    }
    if (request.method !== "POST") {
      return jsonError(405, "method_not_allowed", "POST is required.", {
        Allow: "POST",
      })
    }

    const parserRequest = await resolveParserRequest(request, env.SOURCE_ORIGIN)
    if (parserRequest instanceof Response) {
      return parserRequest
    }
    const container = await getRandom(pool.binding, pool.size)
    const target = new URL("/parse", request.url)
    return container.fetch(new Request(target, parserRequest))
  },
} satisfies ExportedHandler<ParserEnv>

function parserPool(pathname: string, env: ParserEnv): ParserPool | undefined {
  if (pathname === "/v1/pdf-inspector/parse") {
    return {
      binding: env.PDF_INSPECTOR_CONTAINERS,
      size: PDF_INSPECTOR_POOL_SIZE,
    }
  }
  if (pathname === "/v1/liteparse/parse") {
    return {
      binding: env.LITEPARSE_CONTAINERS,
      size: LITEPARSE_POOL_SIZE,
    }
  }
  return undefined
}

async function resolveParserRequest(
  request: Request,
  sourceOrigin: string
): Promise<Request | Response> {
  const sourceValue = request.headers.get("x-filerouter-source-url")
  if (!sourceValue) {
    return request
  }
  let sourceUrl: URL
  try {
    sourceUrl = new URL(sourceValue)
    const allowedOrigin = new URL(sourceOrigin).origin
    if (
      sourceUrl.origin !== allowedOrigin ||
      !sourceUrl.pathname.startsWith("/api/v1/sources/") ||
      !sourceUrl.searchParams.has("expires") ||
      !sourceUrl.searchParams.has("token")
    ) {
      throw new Error("not a FileRouter source URL")
    }
  } catch {
    return jsonError(400, "invalid_source_url", "Parser source URL is invalid.")
  }

  const source = await fetch(sourceUrl, { redirect: "manual" })
  if (!source.ok || !source.body) {
    return jsonError(400, "source_unavailable", "Parser source is unavailable.")
  }
  const headers = new Headers(request.headers)
  headers.delete("x-filerouter-source-url")
  const fileName = sourceUrl.pathname.split("/").at(-1)
  if (fileName) {
    headers.set("x-filerouter-file-name", fileName)
  }
  headers.set(
    "Content-Type",
    source.headers.get("Content-Type") ?? "application/octet-stream"
  )
  const length = source.headers.get("Content-Length")
  if (length) {
    headers.set("Content-Length", length)
  } else {
    headers.delete("Content-Length")
  }
  return new Request(request.url, {
    body: source.body,
    headers,
    method: "POST",
  })
}

function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit
): Response {
  return Response.json(
    { error: { code, message } },
    { ...(headers && { headers }), status }
  )
}
