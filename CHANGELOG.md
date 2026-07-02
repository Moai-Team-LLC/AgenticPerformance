# Changelog

All notable changes to AgenticPerformance are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-07-02

Initial release — the reference implementation of the Agentic Product Standard's
*Evals & observability* surface. Built spec-first from an adversarially-reviewed
PRD (see [`docs/`](docs)).

### Added

- **Contract & normalization** — OTel GenAI semconv + an `apl.*` namespace
  (identity on the Resource, per-invocation facts on the span); a normalization
  layer that maps both OpenInference and `gen_ai.*` into one canonical model,
  with post-normalization equivalence (not byte-identical trees).
- **SDK** (`wrapAgent` / `instrumentTools` / `recordOutcome`·`Feedback`·`Decision`)
  over an injectable span sink; in-process secret + PII redaction; head sampling
  with a Collector tail-keep model.
- **Ingest & store** — an OTLP/JSON server (`@apl/ingest`, `POST /v1/traces`) →
  normalize → an `apl_span` TimescaleDB hypertable, tenant-isolated by RLS.
- **Registry** — content-addressed, DB-immutable `agent` / `agent_version`.
- **Evals** — a mandatory deterministic baseline suite, a per-agent versioned
  golden set, and a CI gate that blocks regression vs the prior version on a
  frozen case set (empty set = hard fail).
- **Judges** — stratified calibration with a Wilson lower bound (≥50/class),
  snapshot-pinned versioning with staleness expiry, and an independent gating judge.
- **Failure analysis** — durable run-over-run cluster identity (label-embedding
  carry-forward) + Poisson-significance trend detection.
- **Improvement loop** — L1→L2→L3 with a code-enforced safety envelope
  (diff-allowlist + content guard + a fully-justified, rollback-able ledger),
  content-safety on mined artifacts, L3 eligibility, and canary/A-B decisioning.
- **Scorecard** — a headless per-agent read model.
- **Ecosystem adapters** — `fromAgenticOpsRun` and `fromAgenticMind` map sibling
  products' telemetry into the APL contract (zero dependency on their packages).
- **Worker** (`@apl/worker`) — an advisory-locked improvement sweep.

[0.1.0]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.1.0
