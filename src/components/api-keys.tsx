import type { ApiKey } from "@better-auth/api-key"
import { Check, Copy, Key, Plus, Trash } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FILEROUTER_API_KEY_PREFIX } from "@file_router/sdk/hosted"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

type ApiKeySummary = Omit<ApiKey, "key">

const apiKeysQueryKey = ["auth", "api-keys"] as const
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
})

export function ApiKeys() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const keys = useQuery({
    queryKey: apiKeysQueryKey,
    queryFn: async (): Promise<Array<ApiKeySummary>> => {
      const result = await authClient.apiKey.list()
      if (result.error) {
        throw new Error(result.error.message ?? "Could not load API keys.")
      }
      return result.data.apiKeys
    },
  })

  const createKeyMutation = useMutation({
    mutationFn: async (keyName: string) => {
      const result = await authClient.apiKey.create({ name: keyName })
      if (result.error) {
        throw new Error(result.error.message ?? "Could not create API key.")
      }
      return result.data.key
    },
    onSuccess: async (key) => {
      setName("")
      setCopied(false)
      setCreatedKey(key)
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey })
    },
  })

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({ keyId })
      if (result.error) {
        throw new Error(result.error.message ?? "Could not revoke API key.")
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey })
    },
  })

  function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const keyName = name.trim()
    if (keyName) createKeyMutation.mutate(keyName)
  }

  async function copyCreatedKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey)
    setCopied(true)
  }

  const error = keys.error ?? createKeyMutation.error ?? revokeKeyMutation.error

  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="flex items-center gap-2">
        <Key className="size-5 text-primary" weight="bold" />
        <h2 className="text-lg font-medium">API keys</h2>
      </div>

      <form className="mt-4 flex max-w-xl gap-2" onSubmit={createKey}>
        <label className="sr-only" htmlFor="api-key-name">
          API key name
        </label>
        <input
          id="api-key-name"
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Local development"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
        />
        <Button
          className="h-10"
          type="submit"
          disabled={createKeyMutation.isPending || !name.trim()}
        >
          <Plus weight="bold" />
          Create key
        </Button>
      </form>

      {createdKey ? (
        <div className="mt-4 max-w-2xl rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Copy this key now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It will not be shown again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-background px-3 py-2 text-sm">
              {createdKey}
            </code>
            <Button
              aria-label="Copy API key"
              size="icon"
              variant="outline"
              onClick={copyCreatedKey}
            >
              {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      <div className="mt-6 divide-y divide-border border-y border-border">
        {keys.isPending ? (
          <p className="py-4 text-sm text-muted-foreground">Loading keys...</p>
        ) : keys.data?.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          keys.data?.map((key) => (
            <div
              className="flex items-center justify-between gap-4 py-4"
              key={key.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {key.start ?? key.prefix ?? FILEROUTER_API_KEY_PREFIX}... -
                  Created {dateFormatter.format(new Date(key.createdAt))}
                </p>
              </div>
              <Button
                aria-label={`Revoke ${key.name ?? "API key"}`}
                size="icon-sm"
                variant="ghost"
                disabled={revokeKeyMutation.isPending}
                onClick={() => revokeKeyMutation.mutate(key.id)}
              >
                <Trash className="text-destructive" weight="bold" />
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
