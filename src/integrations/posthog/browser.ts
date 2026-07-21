import type { BeforeSendFn, Properties } from "posthog-js"

import type { PublicPostHogConfig } from "@/integrations/posthog/config"

type PostHogClient = (typeof import("posthog-js/dist/module.slim"))["default"]

let clientPromise: Promise<PostHogClient | undefined> | undefined

export function initializePostHog(config: PublicPostHogConfig): void {
  if (clientPromise || typeof window === "undefined") {
    return
  }

  clientPromise = import("posthog-js/dist/module.slim")
    .then(({ default: posthog }) => {
      posthog.init(config.token, {
        api_host: config.host,
        autocapture: false,
        before_send: sanitizeEventUrls,
        capture_exceptions: true,
        capture_pageleave: false,
        capture_pageview: "history_change",
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        session_recording: {
          maskAllInputs: true,
          maskCapturedNetworkRequestFn: sanitizeRecordedRequest,
        },
        tracing_headers: [window.location.hostname],
      })
      return posthog
    })
    .catch(() => undefined)
}

export function captureBrowserEvent(
  event: string,
  properties?: Properties
): void {
  withClient((posthog) => posthog.capture(event, properties))
}

export function captureBrowserException(
  error: unknown,
  properties?: Properties
): void {
  withClient((posthog) => posthog.captureException(error, properties))
}

export function identifyBrowserUser(userId: string): void {
  withClient((posthog) => posthog.identify(userId))
}

export function resetBrowserUser(): void {
  withClient((posthog) => posthog.reset())
}

function withClient(action: (posthog: PostHogClient) => void): void {
  void clientPromise?.then((posthog) => {
    if (posthog) {
      action(posthog)
    }
  })
}

function sanitizeEventUrls(event: Parameters<BeforeSendFn>[0]) {
  if (!event?.properties) {
    return event
  }
  return {
    ...event,
    properties: {
      ...event.properties,
      ...sanitizeUrlProperty(event.properties, "$current_url"),
      ...sanitizeUrlProperty(event.properties, "$referrer"),
    },
  }
}

function sanitizeUrlProperty(
  properties: Properties,
  key: "$current_url" | "$referrer"
): Properties {
  const value = properties[key]
  if (typeof value !== "string" || !value) {
    return {}
  }
  return { [key]: stripUrlDetails(value) }
}

function sanitizeRecordedRequest<T extends { name?: string }>(request: T): T {
  if (request.name) {
    request.name = stripUrlDetails(request.name)
  }
  return request
}

function stripUrlDetails(value: string): string {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split("?")[0]?.split("#")[0] ?? ""
  }
}
