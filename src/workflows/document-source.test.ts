import { describe, expect, test } from "vite-plus/test"

import { readPublicHttpUrl } from "@/lib/public-url"

describe("hosted document URL policy", () => {
  test("accepts public HTTP sources and strips credentials", () => {
    expect(
      readPublicHttpUrl("https://user:secret@example.com/report.pdf").toString()
    ).toBe("https://example.com/report.pdf")
  })

  test.each([
    "http://localhost/report.pdf",
    "http://127.0.0.1/report.pdf",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.4/report.pdf",
    "http://localhost./report.pdf",
    "http://service.local./report.pdf",
    "http://127.0.0.1./report.pdf",
    "http://[::1]/report.pdf",
    "http://[fd00::1]/report.pdf",
  ])("rejects non-public source %s", (source) => {
    expect(() => readPublicHttpUrl(source)).toThrow("public Internet")
  })
})
