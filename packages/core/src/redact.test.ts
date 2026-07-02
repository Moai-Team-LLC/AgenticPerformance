import { describe, expect, it } from "vitest"

import { redactAttributes, redactText } from "./redact"

describe("APL redaction (Phase-1 APL-1.3)", () => {
  it("redacts known credential shapes", () => {
    expect(redactText("key sk-ABCDEFGHIJKLMNOPQRSTUVWX end").redacted).toContain(
      "[redacted:secret:openai_key]",
    )
    expect(redactText("tok ghp_ABCDEFGHIJKLMNOPQRSTUVWX").redacted).toContain(
      "[redacted:secret:github_token]",
    )
    expect(redactText("stripe sk_live_ABCDEFGHIJKLMNOPQR").redacted).toContain(
      "[redacted:secret:stripe_key]",
    )
    expect(redactText("Authorization: Bearer abcdefghijklmnopqrstuvwx").redacted).toContain(
      "[redacted:secret:bearer]",
    )
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM"
    expect(redactText(`t ${jwt}`).redacted).toContain("[redacted:secret:jwt]")
  })

  it("redacts a high-entropy token but leaves a low-entropy run", () => {
    const secret = "aB3xYz90QwErTyUiOpAsDfGhJkLzXcVbNm1234567890"
    expect(redactText(secret).redacted).toBe("[redacted:secret]")
    const boring = "a".repeat(44)
    expect(redactText(boring).redacted).toBe(boring)
  })

  it("redacts PII via the reused guard.ts detectors", () => {
    expect(redactText("reach bob@example.com now").redacted).toContain("[redacted:email]")
    expect(redactText("host 10.0.0.1 down").redacted).toContain("[redacted:ipv4]")
  })

  it("redactAttributes scrubs string values and passes non-strings through", () => {
    const { attributes, found } = redactAttributes({
      note: "email x@y.com",
      token: "sk-ABCDEFGHIJKLMNOPQRSTUVWX",
      count: 5,
      ok: true,
    })
    expect(attributes.count).toBe(5)
    expect(attributes.ok).toBe(true)
    expect(attributes.note).toContain("[redacted:email]")
    expect(attributes.token).toContain("[redacted:secret:openai_key]")
    expect(found).toContain("pii:email")
    expect(found).toContain("secret:openai_key")
  })
})
