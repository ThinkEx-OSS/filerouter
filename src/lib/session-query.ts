import { queryOptions } from "@tanstack/react-query"

import type { AuthSession } from "@/lib/auth.functions"
import { getSession } from "@/lib/auth.functions"

export type { AuthSession }

const authSessionQueryKey = ["auth", "session"] as const

export function getAuthSessionQueryOptions() {
  return queryOptions({
    queryKey: authSessionQueryKey,
    queryFn: () => getSession(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
