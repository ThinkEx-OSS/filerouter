import {
  FILEROUTER_DEFAULT_API_URL,
  DirectFileRouter,
  FileRouter,
} from "@file_router/sdk"
import { builtInProviders, DEFAULT_PROVIDER_ID } from "@file_router/sdk/catalog"
import type {
  CompareResult,
  HostedCompareOptions,
  HostedParseOptions,
  ParseInput,
  ParseResult,
  ProviderMap,
} from "@file_router/sdk"

interface DocumentRouter {
  compare: (
    input: ParseInput,
    options?: HostedCompareOptions
  ) => Promise<CompareResult>
  parse: (
    input: ParseInput,
    options?: HostedParseOptions
  ) => Promise<ParseResult>
}

export interface CliRuntime {
  apiURL: string
  createRouter: (local: boolean) => Promise<DocumentRouter>
  fetch: typeof globalThis.fetch
  listProviders: () => ProviderMap
  openBrowser: (url: string) => Promise<void>
  saveApiKey: (apiKey: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  writeStdout: (content: string) => void
}

export function createDefaultRuntime(): CliRuntime {
  const apiURL = trimSlash(
    process.env.FILEROUTER_API_URL ?? FILEROUTER_DEFAULT_API_URL
  )
  return {
    apiURL,
    async createRouter(local) {
      if (local) {
        return createLocalRouter()
      }
      const { readSavedApiKey } = await import("./config")
      const apiKey = process.env.FILEROUTER_API_KEY ?? (await readSavedApiKey())
      if (!apiKey) {
        throw new Error(
          "Not authenticated. Run filerouter login or use --local."
        )
      }
      return new FileRouter({ apiKey, baseURL: apiURL })
    },
    fetch: globalThis.fetch,
    listProviders: () => createLocalRouter().providers,
    async openBrowser(url) {
      const { spawn } = await import("node:child_process")
      const [command, args] = browserCommand(url)
      const child = spawn(command, args, { detached: true, stdio: "ignore" })
      child.on("error", () => {})
      child.unref()
    },
    async saveApiKey(apiKey) {
      const { saveApiKey } = await import("./config")
      await saveApiKey(apiKey)
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async writeFile(path, content) {
      const { writeFile } = await import("node:fs/promises")
      await writeFile(path, content, "utf8")
    },
    writeStdout(content) {
      process.stdout.write(content)
    },
  }
}

function browserCommand(url: string): [string, Array<string>] {
  if (process.platform === "darwin") {
    return ["open", [url]]
  }
  if (process.platform === "win32") {
    return ["cmd", ["/c", "start", "", url]]
  }
  return ["xdg-open", [url]]
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function createLocalRouter() {
  const providers: ProviderMap = builtInProviders()
  return new DirectFileRouter({
    defaultProvider: DEFAULT_PROVIDER_ID,
    providers,
  })
}
