import { runCommand } from "citty"
import { FileRouter } from "@file_router/sdk"
import { fakeProvider } from "@file_router/sdk/testing"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vite-plus/test"

import { createMainCommand } from "../src/main"
import type { CliRuntime } from "../src/runtime"

const reportPath = fileURLToPath(
  new URL("./fixtures/report.pdf", import.meta.url)
)

function createRuntime() {
  const stdout: Array<string> = []
  const files = new Map<string, string>()
  const router = new FileRouter({
    providers: {
      datalab: fakeProvider({ id: "datalab" }),
      llamaparse: fakeProvider({ id: "llamaparse" }),
      "mistral-ocr": fakeProvider({ id: "mistral-ocr" }),
    },
  })
  const runtime: CliRuntime = {
    apiURL: "https://filerouter.test",
    createRouter: () => Promise.resolve(router),
    fetch: globalThis.fetch,
    listProviders: () => router.providers,
    openBrowser: () => Promise.resolve(),
    saveApiKey: () => Promise.resolve(),
    sleep: () => Promise.resolve(),
    writeFile(path, content) {
      files.set(path, content)
      return Promise.resolve()
    },
    writeStdout(content) {
      stdout.push(content)
    },
  }
  return { files, runtime, stdout }
}

describe("FileRouter CLI", () => {
  test("completes the device login flow", async () => {
    const { runtime, stdout } = createRuntime()
    const responses = [
      Response.json({
        device_code: "device-secret",
        expires_in: 600,
        interval: 0,
        user_code: "ABCD-2345",
        verification_uri: "https://filerouter.test/device",
        verification_uri_complete:
          "https://filerouter.test/device?user_code=ABCD2345",
      }),
      Response.json(
        {
          error: "authorization_pending",
          error_description: "Authorization is pending.",
        },
        { status: 400 }
      ),
      Response.json({
        access_token: "temporary-session",
        expires_in: 600,
        token_type: "Bearer",
      }),
      Response.json({ key: "fr_secret" }),
      Response.json({ success: true }),
    ]
    let savedApiKey = ""
    runtime.fetch = () => Promise.resolve(responses.shift() ?? Response.error())
    runtime.saveApiKey = (apiKey) => {
      savedApiKey = apiKey
      return Promise.resolve()
    }

    await runCommand(createMainCommand(runtime), { rawArgs: ["login"] })

    expect(savedApiKey).toBe("fr_secret")
    expect(stdout.join("")).toContain("Authenticated.")
  })

  test("parses a document to stdout", async () => {
    const { runtime, stdout } = createRuntime()

    await runCommand(createMainCommand(runtime), {
      rawArgs: ["parse", reportPath],
    })

    expect(stdout.join("")).toBe("# Fake document\n")
  })

  test("writes machine-readable comparison output", async () => {
    const { runtime, stdout } = createRuntime()

    await runCommand(createMainCommand(runtime), {
      rawArgs: ["compare", reportPath, "--json"],
    })

    const result = JSON.parse(stdout.join(""))
    expect(result.providers).toHaveLength(3)
    expect(
      result.providers.every(
        ({ status }: { status: string }) => status === "parsed"
      )
    ).toBe(true)
  })

  test("writes output files without also writing to stdout", async () => {
    const { files, runtime, stdout } = createRuntime()

    await runCommand(createMainCommand(runtime), {
      rawArgs: ["parse", reportPath, "--out", "result.md"],
    })

    expect(files.get("result.md")).toBe("# Fake document\n")
    expect(stdout).toEqual([])
  })
})
