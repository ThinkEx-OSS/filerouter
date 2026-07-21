import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"

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
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { parser: options.parserId, status: "ok" })
      return
    }
    if (request.method !== "POST" || request.url !== "/parse") {
      sendJson(response, 404, {
        error: { code: "route_not_found", message: "Parser route not found." },
      })
      return
    }
    if (activeRequests >= options.maxConcurrency) {
      sendJson(response, 429, {
        error: {
          code: "capacity_exceeded",
          message: `${options.parserId} is at capacity.`,
        },
      })
      return
    }

    activeRequests += 1
    try {
      const bytes = await readBody(request, options.maxBytes)
      const result = await options.handler({
        bytes,
        contentType:
          singleHeader(request.headers["content-type"]) ??
          "application/octet-stream",
        fileName:
          decodeHeader(singleHeader(request.headers[FILE_NAME_HEADER])) ??
          "document",
        options: parseOptions(
          singleHeader(request.headers[ENGINE_OPTIONS_HEADER])
        ),
      })
      sendJson(response, 200, result, options.maxResponseBytes)
    } catch (error) {
      if (!(error instanceof ParserRequestError)) {
        console.error(
          JSON.stringify({
            errorType: error instanceof Error ? error.name : "UnknownError",
            parser: options.parserId,
          })
        )
      }
      const failure = toParserFailure(error)
      sendJson(response, failure.status, { error: failure.error })
    } finally {
      activeRequests -= 1
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
): void {
  const body = JSON.stringify(value)
  if (maxBytes && Buffer.byteLength(body) > maxBytes) {
    sendJson(response, 413, {
      error: {
        code: "provider_limit_exceeded",
        message: `Parser response exceeds the ${maxBytes}-byte output limit.`,
      },
    })
    return
  }
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  })
  response.end(body)
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
