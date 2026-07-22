import type { ApiKey } from "@better-auth/api-key"
import { Check, Copy, Trash, X } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

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
import {
  captureBrowserEvent,
  captureBrowserException,
} from "@/integrations/posthog/browser"
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
    mutationFn: async (keyName?: string) => {
      const result = await authClient.apiKey.create(
        keyName ? { name: keyName } : {}
      )
      if (result.error) {
        throw new Error(result.error.message ?? "Could not create API key.")
      }
      return result.data.key
    },
    onSuccess: async (key) => {
      captureBrowserEvent("api_key_created", { named: Boolean(name.trim()) })
      setName("")
      setCopied(false)
      setCreatedKey(key)
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey })
    },
    onError: (error) =>
      captureBrowserException(error, { operation: "api_key_create" }),
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
    onError: (error) =>
      captureBrowserException(error, { operation: "api_key_revoke" }),
  })

  function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const keyName = name.trim()
    createKeyMutation.mutate(keyName || undefined)
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
      className="min-w-0 scroll-mt-20"
      id="api-keys"
    >
      <div>
        <h2 className="text-xl font-medium" id="api-keys-title">
          API keys
        </h2>
      </div>

      <form
        className="flex w-full flex-col gap-2 py-4 sm:flex-row"
        onSubmit={createKey}
      >
        <label className="sr-only" htmlFor="api-key-name">
          API key name
        </label>
        <Input
          id="api-key-name"
          className="h-10 flex-1 bg-background px-3"
          placeholder="Name (optional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
        />
        <Button
          className="h-10"
          type="submit"
          disabled={createKeyMutation.isPending}
        >
          Generate key
        </Button>
      </form>

      {createdKey ? (
        <Alert className="ph-no-capture mb-5 max-w-full min-w-0 overflow-hidden border-primary/30 bg-primary/5 pr-10">
          <Button
            aria-label="Dismiss API key"
            className="absolute top-1.5 right-1.5"
            onClick={() => {
              setCreatedKey(null)
              setCopied(false)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X weight="bold" />
          </Button>
          <AlertTitle>Copy this key now</AlertTitle>
          <AlertDescription>It will not be shown again.</AlertDescription>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <code className="block min-w-0 flex-1 overflow-x-auto rounded-none bg-background px-3 py-2 text-sm whitespace-nowrap">
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

      <div className="divide-y divide-border">
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
                <p className="truncate font-mono text-xs font-medium">
                  {key.start}...
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {key.name ? `${key.name} · ` : null}Created{" "}
                  {dateFormatter.format(new Date(key.createdAt))}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    aria-label={`Revoke key ${key.start}`}
                    size="icon-sm"
                    variant="ghost"
                    disabled={revokeKeyMutation.isPending}
                  >
                    <Trash className="text-destructive" weight="bold" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
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
