import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"

import {
  JOB_ID_HEADER,
  RELEASE_ID_HEADER,
  REQUEST_ID_HEADER,
  emitWideEvent,
  serializeError,
} from "./observability.ts"

export const ENGINE_OPTIONS_HEADER = "x-filerouter-engine-options"
export const FILE_NAME_HEADER = "x-filerouter-file-name"

export type ParserRequest = {
  bytes: Buffer
  contentType: string
  fileName: string
  options: unknown
}

export type ParserHandler = (request: ParserRequest) => Promise<unknown>

export type ParserServerOptions = {
  handler: ParserHandler
  maxBytes: number
  maxConcurrency: number
  maxResponseBytes: number
  parserId: string
  port?: number
}

export function startParserServer(options: ParserServerOptions): void {
  let activeRequests = 0
  const server = createServer(async (request, response) => {
    const startedAt = Date.now()
    const requestId =
      singleHeader(request.headers[REQUEST_ID_HEADER]) ?? crypto.randomUUID()
    const path = new URL(request.url ?? "/", "http://container").pathname
    response.setHeader("X-Request-Id", requestId)
    let bodyBytes: number | undefined
    let errorCode: string | undefined
    let failure: unknown
    let requestActive = false
    let status = 500

    try {
      if (request.method === "GET" && path === "/health") {
        status = sendJson(response, 200, {
          parser: options.parserId,
          status: "ok",
        })
        return
      }
      if (request.method !== "POST" || path !== "/parse") {
        errorCode = "route_not_found"
        status = sendJson(response, 404, {
          error: { code: errorCode, message: "Parser route not found." },
        })
        return
      }
      if (activeRequests >= options.maxConcurrency) {
        errorCode = "capacity_exceeded"
        status = sendJson(response, 429, {
          error: {
            code: errorCode,
            message: `${options.parserId} is at capacity.`,
          },
        })
        return
      }

      activeRequests += 1
      requestActive = true
      const bytes = await readBody(request, options.maxBytes)
      bodyBytes = bytes.byteLength
      const engineOptions = parseOptions(
        singleHeader(request.headers[ENGINE_OPTIONS_HEADER])
      )
      const result = await options.handler({
        bytes,
        contentType:
          singleHeader(request.headers["content-type"]) ??
          "application/octet-stream",
        fileName:
          decodeHeader(singleHeader(request.headers[FILE_NAME_HEADER])) ??
          "document",
        options: engineOptions,
      })
      status = sendJson(response, 200, result, options.maxResponseBytes)
      if (status >= 400) {
        errorCode = "provider_limit_exceeded"
      }
    } catch (error) {
      failure = error
      const parserFailure = toParserFailure(error)
      errorCode = parserFailure.error.code
      status = sendJson(response, parserFailure.status, {
        error: parserFailure.error,
      })
    } finally {
      if (requestActive) {
        activeRequests -= 1
      }
      emitWideEvent(status >= 500 ? "error" : "info", {
        active_requests: activeRequests,
        body_bytes: bodyBytes,
        content_length: numericHeader(
          singleHeader(request.headers["content-length"])
        ),
        content_type:
          singleHeader(request.headers["content-type"]) ?? undefined,
        duration_ms: Date.now() - startedAt,
        error_code: errorCode,
        event: "parser_engine_request_completed",
        job_id: singleHeader(request.headers[JOB_ID_HEADER]),
        max_concurrency: options.maxConcurrency,
        method: request.method,
        outcome:
          status >= 500 ? "error" : status >= 400 ? "rejected" : "success",
        parser: options.parserId,
        path,
        release_id: singleHeader(request.headers[RELEASE_ID_HEADER]),
        request_id: requestId,
        service: `filerouter-${options.parserId}`,
        status_code: status,
        ...(failure ? serializeError(failure) : {}),
      })
    }
  })

  server.listen(options.port ?? 8080, "0.0.0.0")
}

export class ParserRequestError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ParserRequestError"
    this.code = code
    this.status = status
  }
}

async function readBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<Buffer> {
  const contentLength = Number(request.headers["content-length"])
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ParserRequestError(
      413,
      "provider_limit_exceeded",
      `Document exceeds the ${maxBytes}-byte parser limit.`
    )
  }

  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new ParserRequestError(
        413,
        "provider_limit_exceeded",
        `Document exceeds the ${maxBytes}-byte parser limit.`
      )
    }
    chunks.push(buffer)
  }
  if (size === 0) {
    throw new ParserRequestError(400, "empty_document", "Document is empty.")
  }
  return Buffer.concat(chunks, size)
}

function parseOptions(value: string | undefined): unknown {
  if (!value) {
    return {}
  }
  try {
    return JSON.parse(decodeURIComponent(value)) as unknown
  } catch {
    throw new ParserRequestError(
      400,
      "invalid_provider_options",
      "Parser options are invalid."
    )
  }
}

function decodeHeader(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  try {
    return decodeURIComponent(value)
  } catch {
    throw new ParserRequestError(
      400,
      "invalid_file_name",
      "Document filename is invalid."
    )
  }
}

function singleHeader(
  value: string | Array<string> | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  maxBytes?: number
): number {
  const body = JSON.stringify(value)
  if (maxBytes && Buffer.byteLength(body) > maxBytes) {
    return sendJson(response, 413, {
      error: {
        code: "provider_limit_exceeded",
        message: `Parser response exceeds the ${maxBytes}-byte output limit.`,
      },
    })
  }
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  })
  response.end(body)
  return status
}

function numericHeader(value: string | undefined): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toParserFailure(error: unknown): {
  error: { code: string; message: string }
  status: number
} {
  if (error instanceof ParserRequestError) {
    return {
      error: { code: error.code, message: error.message },
      status: error.status,
    }
  }
  return {
    error: { code: "parse_failed", message: "Document parsing failed." },
    status: 500,
  }
}
