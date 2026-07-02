/**
 * APL in-process redaction (Phase-1, backlog APL-1.3).
 *
 * Runs BEFORE export so "redacted before export" is literally true at the SDK
 * boundary (the Collector/Presidio path is an optional higher-recall upgrade, not
 * the authoritative boundary). Reuses the engine's PII detectors (guard.ts) and
 * adds secret detection (known key shapes + high-entropy tokens) so credentials
 * captured in tool arguments never reach a trace (NFR-SEC-2 / NFR-PRIV-1).
 */

import type { Attributes } from "./contract"

import { redactPii } from "./vendor/guard"

/** Known credential shapes. Linear patterns (no nested quantifiers → no ReDoS). */
const SECRET_PATTERNS: readonly { kind: string; re: RegExp }[] = [
  { kind: "openai_key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { kind: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "google_api_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "stripe_key", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "bearer", re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
]

/** A contiguous token long enough that, if high-entropy, it is almost certainly a secret. */
const ENTROPY_TOKEN = /\b[A-Za-z0-9+/=_-]{40,}\b/g
const ENTROPY_THRESHOLD = 3.5

const shannonEntropy = (s: string): number => {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const count of freq.values()) {
    const p = count / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/** Redacts secrets then PII from free text. Returns the redacted text + kind tags found. */
export const redactText = (text: string): { redacted: string; found: string[] } => {
  const found = new Set<string>()
  let out = text

  for (const { kind, re } of SECRET_PATTERNS) {
    if (re.test(out)) {
      found.add(`secret:${kind}`)
      out = out.replace(re, `[redacted:secret:${kind}]`)
    }
  }

  out = out.replace(ENTROPY_TOKEN, (token) => {
    if (shannonEntropy(token) >= ENTROPY_THRESHOLD) {
      found.add("secret:high_entropy")
      return "[redacted:secret]"
    }
    return token
  })

  const pii = redactPii(out)
  for (const kind of pii.found) found.add(`pii:${kind}`)

  return { redacted: pii.redacted, found: [...found] }
}

/**
 * Scrubs every string-valued attribute (secrets + PII). Non-string values pass
 * through untouched. Applied by the SDK span processor before export.
 */
export const redactAttributes = (
  attrs: Attributes,
): { attributes: Attributes; found: string[] } => {
  const found = new Set<string>()
  const out: Attributes = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string") {
      const r = redactText(value)
      out[key] = r.redacted
      for (const f of r.found) found.add(f)
    } else {
      out[key] = value
    }
  }
  return { attributes: out, found: [...found] }
}
