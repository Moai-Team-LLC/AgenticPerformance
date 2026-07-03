# Security Policy

## Supported versions

AgenticPerformance is pre-1.0; security fixes land on the latest `0.x` minor.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue or PR.

Use GitHub's private vulnerability reporting: the repository's **Security** tab →
**Report a vulnerability**. We aim to acknowledge within 5 business days and to
share a remediation timeline after triage.

Helpful details: affected version or commit, reproduction steps, and impact.
Coordinated disclosure is appreciated.

## Scope notes

AgenticPerformance ingests and stores agent telemetry — often the most
PII-laden, highest-volume data in a fleet. The design reflects that:

- **Tenant isolation** is enforced by Postgres row-level security on every table
  (never a per-query `WHERE`); the trace store is a TimescaleDB hypertable in the
  same Postgres so RLS applies to it too.
- **Redaction** runs in-process before export; content capture is off by default.
- **Ingest auth** — the ingest endpoint (`POST /v1/traces`) supports Bearer-token
  auth via `APL_INGEST_TOKEN`; it MUST be enabled anywhere outside local dev
  (unset = open endpoint). Request payloads are size-capped
  (`APL_MAX_BODY_BYTES`).
- **The improvement loop's autonomy is bounded by code**, not prompt: a
  diff-allowlist + content guard reject any patch that touches tools/permissions
  or smuggles tool-invocation, secret, or scope language; mined artifacts pass an
  injection/PII gate before they can become durable behavior.

When deploying, the usual agent threat model still applies — least-privilege
identities, scoped credentials (never commit them), untrusted tool/ingested
content. See the Agentic Product Standard's Layer 8 (Security & Identity).
