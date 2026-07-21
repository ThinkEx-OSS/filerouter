import { env as workerEnv } from "cloudflare:workers"
import { apiKey } from "@better-auth/api-key"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth/minimal"
import { bearer, deviceAuthorization } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import {
  FILEROUTER_API_KEY_PREFIX,
  FILEROUTER_CLI_CLIENT_ID,
} from "@file_router/sdk/hosted"

import type { Db } from "@/db/server"
import { createDb } from "@/db/server"
import * as schema from "@/db/schema"

interface AuthRuntimeEnv {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

const DEVELOPMENT_AUTH_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

function getAuthSecret(env: AuthRuntimeEnv) {
  if (env.BETTER_AUTH_SECRET) {
    return env.BETTER_AUTH_SECRET
  }

  throw new Error("BETTER_AUTH_SECRET is not configured")
}

function getAuthBaseURL(env: AuthRuntimeEnv) {
  if (env.BETTER_AUTH_URL) {
    return env.BETTER_AUTH_URL
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3000"
  }
  throw new Error("BETTER_AUTH_URL is not configured")
}

function createAuth(database: Db, env: AuthRuntimeEnv) {
  const baseURL = getAuthBaseURL(env)
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    secret: getAuthSecret(env),
    baseURL,
    trustedOrigins: import.meta.env.DEV ? DEVELOPMENT_AUTH_ORIGINS : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 90,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              prompt: "select_account",
            },
          }
        : undefined,
    plugins: [
      apiKey({
        defaultPrefix: FILEROUTER_API_KEY_PREFIX,
        enableMetadata: true,
        keyExpiration: {
          defaultExpiresIn: 60 * 60 * 24 * 365,
          disableCustomExpiresTime: true,
        },
        permissions: {
          defaultPermissions: { jobs: ["create", "read"] },
        },
        rateLimit: {
          enabled: true,
          maxRequests: 300,
          timeWindow: 60 * 1000,
        },
        requireName: false,
      }),
      bearer(),
      deviceAuthorization({
        expiresIn: "10m",
        interval: "5s",
        validateClient: (clientId) => clientId === FILEROUTER_CLI_CLIENT_ID,
        verificationUri: "/device",
      }),
      tanstackStartCookies(),
    ],
    rateLimit: {
      enabled: !import.meta.env.DEV,
    },
  })
}

export async function withAuth<T>(
  run: (auth: ReturnType<typeof createAuth>) => Promise<T> | T
) {
  return run(createAuth(createDb(workerEnv.DB), workerEnv))
}
