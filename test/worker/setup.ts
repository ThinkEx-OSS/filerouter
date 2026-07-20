import { beforeAll } from "vite-plus/test"
import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"
import type { D1Migration } from "@cloudflare/vitest-pool-workers"

const testEnv = env as Cloudflare.Env & {
  TEST_MIGRATIONS: Array<D1Migration>
}

beforeAll(() => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
