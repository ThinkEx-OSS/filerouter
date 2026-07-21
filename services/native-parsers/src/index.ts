import { Container, getRandom } from "@cloudflare/containers"

import {
  JOB_ID_HEADER,
  RELEASE_ID_HEADER,
  REQUEST_ID_HEADER,
  emitWideEvent,
  responseWithRequestId,
  serializeError,
} from "./observability"

const PDF_INSPECTOR_POOL_SIZE = 2
const LITEPARSE_POOL_SIZE = 1

export class PdfInspectorContainer extends Container {
  defaultPort = 8080
  sleepAfter = "1m"
}

export class LiteParseContainer extends Container {
  defaultPort = 8080
  sleepAfter = "1m"
}

type ParserPool = {
  binding:
    | DurableObjectNamespace<LiteParseContainer>
    | DurableObjectNamespace<PdfInspectorContainer>
  parser: "liteparse" | "pdf-inspector"
  size: number
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const startedAt = Date.now()
    const url = new URL(request.url)
    const requestId =
      request.headers.get(REQUEST_ID_HEADER)?.trim() || crypto.randomUUID()
    const headers = new Headers(request.headers)
    headers.set(REQUEST_ID_HEADER, requestId)
    headers.set(RELEASE_ID_HEADER, env.WORKER_VERSION.id)
    const routedRequest = new Request(request, { headers })
    const pool = parserPool(url.pathname, env)
    let response: Response | undefined
    let failure: unknown

    try {
      if (!pool) {
        response = jsonError(404, "parser_not_found", "Parser route not found.")
      } else if (request.method !== "POST") {
        response = jsonError(405, "method_not_allowed", "POST is required.", {
          Allow: "POST",
        })
      } else {
        const parserRequest = await resolveParserRequest(
          routedRequest,
          env.SOURCE_ORIGIN
        )
        if (parserRequest instanceof Response) {
          response = parserRequest
        } else {
          const container = await getRandom(pool.binding, pool.size)
          const target = new URL("/parse", routedRequest.url)
          response = await container.fetch(new Request(target, parserRequest))
        }
      }
      return responseWithRequestId(response, requestId)
    } catch (error) {
      failure = error
      throw error
    } finally {
      const status = response?.status ?? 500
      emitWideEvent(env, status >= 500 ? "error" : "info", {
        content_length: numericHeader(request.headers.get("content-length")),
        content_type: request.headers.get("content-type") ?? undefined,
        duration_ms: Date.now() - startedAt,
        event: "native_parser_request_completed",
        job_id: request.headers.get(JOB_ID_HEADER) ?? undefined,
        method: request.method,
        outcome:
          status >= 500 ? "error" : status >= 400 ? "rejected" : "success",
        parser: pool?.parser,
        path: url.pathname,
        request_id: requestId,
        service: "filerouter-native-parsers",
        status_code: status,
        ...(failure ? serializeError(failure) : {}),
      })
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>

function parserPool(
  pathname: string,
  env: Cloudflare.Env
): ParserPool | undefined {
  if (pathname === "/v1/pdf-inspector/parse") {
    return {
      binding: env.PDF_INSPECTOR_CONTAINERS,
      parser: "pdf-inspector",
      size: PDF_INSPECTOR_POOL_SIZE,
    }
  }
  if (pathname === "/v1/liteparse/parse") {
    return {
      binding: env.LITEPARSE_CONTAINERS,
      parser: "liteparse",
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

  const source = await fetch(sourceUrl, {
    headers: correlationHeaders(request.headers),
    redirect: "manual",
  })
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

function correlationHeaders(source: Headers): Headers {
  const headers = new Headers()
  for (const name of [JOB_ID_HEADER, REQUEST_ID_HEADER]) {
    const value = source.get(name)
    if (value) {
      headers.set(name, value)
    }
  }
  return headers
}

function numericHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
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
