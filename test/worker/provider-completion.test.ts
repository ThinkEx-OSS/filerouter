import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vite-plus/test"

import { api } from "@/api/app"
import {
  providerCompletionEventType,
  withProviderCompletion,
} from "@/lib/provider-completion.server"

describe("provider completion", () => {
  test("injects only provider-owned completion options", async () => {
    const datalab = await withProviderCompletion(
      env,
      "job-1",
      "execution-1",
      "datalab",
      { mode: "balanced" }
    )
    expect(datalab).toMatchObject({
      mode: "balanced",
      webhook_url: expect.stringContaining(
        "/api/v1/provider-completions/job-1/execution-1"
      ),
    })
    expect(providerCompletionEventType("datalab", "execution-1")).toBe(
      "provider-execution-1"
    )

    const llamaparse = await withProviderCompletion(
      env,
      "job-1",
      "execution-2",
      "llamaparse",
      { tier: "fast" }
    )
    expect(llamaparse).toMatchObject({
      tier: "fast",
      webhook_configurations: [
        {
          webhook_events: expect.arrayContaining([
            "parse.success",
            "parse.error",
          ]),
          webhook_output_format: "json",
          webhook_url: expect.stringContaining(
            "/api/v1/provider-completions/job-1/execution-2"
          ),
        },
      ],
    })
    expect(providerCompletionEventType("llamaparse", "execution-2")).toBe(
      "provider-execution-2"
    )

    await expect(
      withProviderCompletion(
        env,
        "job-1",
        "execution-3",
        "mistral-ocr",
        undefined
      )
    ).resolves.toBeUndefined()
    expect(
      providerCompletionEventType("mistral-ocr", "execution-3")
    ).toBeUndefined()
  })

  test("authenticates callbacks before waking the matching execution", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined)
    const get = vi.fn().mockResolvedValue({
      sendEvent,
      status: vi.fn().mockResolvedValue({ status: "waiting" }),
    })
    const testEnv = {
      ...env,
      DOCUMENT_WORKFLOW: {
        create: vi.fn(),
        createBatch: vi.fn(),
        get,
      } as Cloudflare.Env["DOCUMENT_WORKFLOW"],
    }
    const providerOptions = await withProviderCompletion(
      testEnv,
      "job-2",
      "execution-4",
      "datalab",
      undefined
    )
    const callbackUrl = providerOptions?.webhook_url
    if (typeof callbackUrl !== "string") {
      throw new Error("Expected a Datalab completion URL.")
    }

    const accepted = await api.fetch(
      new Request(callbackUrl, { method: "POST" }),
      testEnv
    )
    expect(accepted.status).toBe(204)
    expect(get).toHaveBeenCalledWith("job-2")
    expect(sendEvent).toHaveBeenCalledWith({
      payload: {},
      type: "provider-execution-4",
    })

    const invalidUrl = new URL(callbackUrl)
    invalidUrl.searchParams.set("token", "invalid")
    const rejected = await api.fetch(
      new Request(invalidUrl, { method: "POST" }),
      testEnv
    )
    expect(rejected.status).toBe(404)
    expect(sendEvent).toHaveBeenCalledOnce()
  })

  test("accepts late callbacks after the workflow is terminal", async () => {
    const testEnv = {
      ...env,
      DOCUMENT_WORKFLOW: {
        create: vi.fn(),
        createBatch: vi.fn(),
        get: vi.fn().mockResolvedValue({
          sendEvent: vi.fn().mockRejectedValue(new Error("already complete")),
          status: vi.fn().mockResolvedValue({ status: "complete" }),
        }),
      } as Cloudflare.Env["DOCUMENT_WORKFLOW"],
    }
    const providerOptions = await withProviderCompletion(
      testEnv,
      "job-3",
      "execution-5",
      "datalab",
      undefined
    )
    const callbackUrl = providerOptions?.webhook_url
    if (typeof callbackUrl !== "string") {
      throw new Error("Expected a Datalab completion URL.")
    }

    const response = await api.fetch(
      new Request(callbackUrl, { method: "POST" }),
      testEnv
    )
    expect(response.status).toBe(204)
  })
})
