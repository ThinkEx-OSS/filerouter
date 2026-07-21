import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { getSessionFromHeaders } from "@/lib/auth-queries.server"

export const getSession = createServerFn({ method: "GET" }).handler(() =>
  getSessionFromHeaders(getRequestHeaders())
)

export type AuthSession = Awaited<ReturnType<typeof getSession>>
