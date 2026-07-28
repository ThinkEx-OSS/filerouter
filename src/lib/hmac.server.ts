const encoder = new TextEncoder()

export async function signHmac(
  secret: string,
  purpose: string,
  payload: string
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret, purpose, ["sign"]),
    encoder.encode(payload)
  )
  return toBase64Url(new Uint8Array(signature))
}

export async function verifyHmac(
  secret: string,
  purpose: string,
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    return crypto.subtle.verify(
      "HMAC",
      await signingKey(secret, purpose, ["verify"]),
      fromBase64Url(signature).buffer as ArrayBuffer,
      encoder.encode(payload)
    )
  } catch {
    return false
  }
}

function signingKey(
  secret: string,
  purpose: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${purpose}:${secret}`),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages
  )
}

function toBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid HMAC signature.")
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}
