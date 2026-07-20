import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

interface CliConfig {
  apiKey: string
}

export async function readSavedApiKey(): Promise<string | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(configPath(), "utf8"))
    if (
      typeof value === "object" &&
      value !== null &&
      "apiKey" in value &&
      typeof value.apiKey === "string"
    ) {
      return value.apiKey
    }
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined
    }
    throw error
  }
  return undefined
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const path = configPath()
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const config: CliConfig = { apiKey }
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  await chmod(path, 0o600)
}

function configPath(): string {
  const root = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(root, "filerouter", "config.json")
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}
