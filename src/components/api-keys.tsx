import type { ApiKey } from "@better-auth/api-key"
import { Check, Copy, Key, Plus, Trash } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FILEROUTER_API_KEY_PREFIX } from "@file_router/sdk/hosted"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
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
    <section
      aria-labelledby="api-keys-title"
      className="scroll-mt-20 border-t border-border pt-6"
      id="api-keys"
    >
      <div>
        <div className="flex items-center gap-2">
          <Key className="size-5 text-primary" weight="bold" />
          <h2 className="text-xl font-medium" id="api-keys-title">
            API keys
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a key for the TypeScript SDK or hosted HTTP API.
        </p>
      </div>

      <form
        className="flex flex-col gap-2 py-5 sm:max-w-2xl sm:flex-row"
        onSubmit={createKey}
      >
        <label className="sr-only" htmlFor="api-key-name">
          API key name
        </label>
        <Input
          id="api-key-name"
          className="h-10 flex-1 bg-background px-3"
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
        <Alert className="mb-5 max-w-2xl border-primary/30 bg-primary/5">
          <AlertTitle>Copy this key now</AlertTitle>
          <AlertDescription>It will not be shown again.</AlertDescription>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-none bg-background px-3 py-2 text-sm">
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
        </Alert>
      ) : null}

      {error ? (
        <p className="mb-5 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      <div className="divide-y divide-border border-y border-border">
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    aria-label={`Revoke ${key.name ?? "API key"}`}
                    size="icon-sm"
                    variant="ghost"
                    disabled={revokeKeyMutation.isPending}
                  >
                    <Trash className="text-destructive" weight="bold" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Revoke {key.name ?? "this API key"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Applications using this key will immediately lose access.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => revokeKeyMutation.mutate(key.id)}
                    >
                      Revoke key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
