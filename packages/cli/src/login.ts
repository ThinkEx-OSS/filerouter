import type { CliRuntime } from "./runtime"
import {
  FILEROUTER_CLI_CLIENT_ID,
  FILEROUTER_CLI_SCOPE,
} from "@file_router/sdk"

interface DeviceAuthorization {
  device_code: string
  expires_in: number
  interval: number
  user_code: string
  verification_uri: string
  verification_uri_complete: string
}

interface DeviceToken {
  access_token: string
  expires_in: number
  token_type: "Bearer"
}

interface DeviceTokenError {
  error:
    | "access_denied"
    | "authorization_pending"
    | "expired_token"
    | "invalid_grant"
    | "invalid_request"
    | "slow_down"
  error_description: string
}

interface CreatedApiKey {
  key: string
}

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

export async function login(runtime: CliRuntime): Promise<void> {
  const authorization = await postJson<DeviceAuthorization>(
    runtime,
    "/api/auth/device/code",
    { client_id: FILEROUTER_CLI_CLIENT_ID, scope: FILEROUTER_CLI_SCOPE }
  )

  runtime.writeStdout(
    `Open ${authorization.verification_uri}\nCode: ${authorization.user_code}\n`
  )
  await runtime.openBrowser(
    authorization.verification_uri_complete || authorization.verification_uri
  )

  const deadline = Date.now() + authorization.expires_in * 1000
  let interval = authorization.interval
  while (Date.now() < deadline) {
    await runtime.sleep(interval * 1000)
    const response = await requestJson<DeviceToken | DeviceTokenError>(
      runtime,
      "/api/auth/device/token",
      {
        client_id: FILEROUTER_CLI_CLIENT_ID,
        device_code: authorization.device_code,
        grant_type: DEVICE_GRANT,
      }
    )

    if (response.ok && "access_token" in response.value) {
      const apiKey = await createApiKey(runtime, response.value.access_token)
      await runtime.saveApiKey(apiKey)
      await signOutTemporarySession(runtime, response.value.access_token)
      runtime.writeStdout("Authenticated.\n")
      return
    }

    if (!("error" in response.value)) {
      throw new Error(
        `FileRouter API request failed with status ${response.status}.`
      )
    }
    if (response.value.error === "authorization_pending") {
      continue
    }
    if (response.value.error === "slow_down") {
      interval += 5
      continue
    }
    throw new Error(response.value.error_description)
  }

  throw new Error("Device authorization expired. Run filerouter login again.")
}

async function postJson<Result>(
  runtime: CliRuntime,
  path: string,
  body: Record<string, string>
): Promise<Result> {
  const response = await requestJson<Result>(runtime, path, body)
  if (!response.ok) {
    throw new Error(readError(response.value, response.status))
  }
  return response.value
}

async function requestJson<Result>(
  runtime: CliRuntime,
  path: string,
  body: Record<string, string>,
  authorization?: string
): Promise<{ ok: boolean; status: number; value: Result }> {
  const response = await runtime.fetch(`${runtime.apiURL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      "Content-Type": "application/json",
    },
    method: "POST",
  })
  const value = (await response.json()) as Result
  return { ok: response.ok, status: response.status, value }
}

async function createApiKey(
  runtime: CliRuntime,
  accessToken: string
): Promise<string> {
  const response = await requestJson<CreatedApiKey | { message?: string }>(
    runtime,
    "/api/auth/api-key/create",
    { name: "FileRouter CLI" },
    accessToken
  )
  if (!response.ok || !("key" in response.value)) {
    throw new Error(readError(response.value, response.status))
  }
  return response.value.key
}

async function signOutTemporarySession(
  runtime: CliRuntime,
  accessToken: string
): Promise<void> {
  const response = await requestJson<{ success?: boolean }>(
    runtime,
    "/api/auth/sign-out",
    {},
    accessToken
  )
  if (!response.ok || !response.value.success) {
    throw new Error(
      "Authenticated, but could not close the temporary login session."
    )
  }
}

function readError(value: unknown, status: number): string {
  if (
    typeof value === "object" &&
    value !== null &&
    (("error_description" in value &&
      typeof value.error_description === "string") ||
      ("message" in value && typeof value.message === "string"))
  ) {
    return "error_description" in value
      ? String(value.error_description)
      : String(value.message)
  }
  return `FileRouter API request failed with status ${status}.`
}
