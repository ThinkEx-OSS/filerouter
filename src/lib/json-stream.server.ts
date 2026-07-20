const encoder = new TextEncoder()
const STRING_CHUNK_SIZE = 16 * 1024

export function jsonReadableStream(value: unknown): ReadableStream<Uint8Array> {
  const chunks = serializeJson(value, new Set())

  return new ReadableStream({
    cancel() {
      chunks.return()
    },
    pull(controller) {
      const next = chunks.next()
      if (next.done) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(next.value))
    },
  })
}

function* serializeJson(
  value: unknown,
  ancestors: Set<object>
): Generator<string, void> {
  if (value === null) {
    yield "null"
    return
  }

  switch (typeof value) {
    case "boolean":
      yield value ? "true" : "false"
      return
    case "number":
      yield Number.isFinite(value) ? String(value) : "null"
      return
    case "string":
      yield* serializeString(value)
      return
    case "bigint":
      throw new TypeError("Do not know how to serialize a BigInt")
    case "undefined":
    case "function":
    case "symbol":
      return
  }

  const object = value as Record<string, unknown>
  if (ancestors.has(object)) {
    throw new TypeError("Converting circular structure to JSON")
  }
  const toJSON = object.toJSON
  if (typeof toJSON === "function") {
    yield* serializeJson(toJSON.call(object), ancestors)
    return
  }

  ancestors.add(object)
  try {
    if (Array.isArray(object)) {
      yield "["
      for (const [index, item] of object.entries()) {
        if (index > 0) yield ","
        if (isOmitted(item)) yield "null"
        else yield* serializeJson(item, ancestors)
      }
      yield "]"
      return
    }

    yield "{"
    let written = 0
    for (const key of Object.keys(object)) {
      const item = object[key]
      if (isOmitted(item)) continue
      if (written > 0) yield ","
      yield* serializeString(key)
      yield ":"
      yield* serializeJson(item, ancestors)
      written += 1
    }
    yield "}"
  } finally {
    ancestors.delete(object)
  }
}

function* serializeString(value: string): Generator<string, void> {
  yield '"'
  let chunk = ""
  const flush = function* () {
    if (chunk) {
      yield chunk
      chunk = ""
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const escaped = escapeCodeUnit(value, index, code)
    chunk += escaped.value
    index += escaped.consumed
    if (chunk.length >= STRING_CHUNK_SIZE) yield* flush()
  }
  yield* flush()
  yield '"'
}

function escapeCodeUnit(
  value: string,
  index: number,
  code: number
): { consumed: number; value: string } {
  switch (code) {
    case 0x08:
      return { consumed: 0, value: "\\b" }
    case 0x09:
      return { consumed: 0, value: "\\t" }
    case 0x0a:
      return { consumed: 0, value: "\\n" }
    case 0x0c:
      return { consumed: 0, value: "\\f" }
    case 0x0d:
      return { consumed: 0, value: "\\r" }
    case 0x22:
      return { consumed: 0, value: '\\"' }
    case 0x5c:
      return { consumed: 0, value: "\\\\" }
  }
  if (code < 0x20) {
    return { consumed: 0, value: unicodeEscape(code) }
  }
  if (code >= 0xd800 && code <= 0xdbff) {
    const next = value.charCodeAt(index + 1)
    return next >= 0xdc00 && next <= 0xdfff
      ? { consumed: 1, value: value.slice(index, index + 2) }
      : { consumed: 0, value: unicodeEscape(code) }
  }
  if (code >= 0xdc00 && code <= 0xdfff) {
    return { consumed: 0, value: unicodeEscape(code) }
  }
  return { consumed: 0, value: value[index]! }
}

function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).padStart(4, "0")}`
}

function isOmitted(value: unknown): boolean {
  return (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  )
}
