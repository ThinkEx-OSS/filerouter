import { drizzle } from "drizzle-orm/d1"

import * as schema from "@/db/schema"

export function createDb(binding: D1Database) {
  return drizzle(binding, { schema })
}

export type Db = ReturnType<typeof createDb>
