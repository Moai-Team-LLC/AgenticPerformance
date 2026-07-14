# Changelog

All notable changes to AgenticPerformance are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-07-14

The eval-science spec (v0.3 delta) is now **implemented** — measurement science
as code, with migration `0001` extending the data model.

### Added

- **Judge Card** (`judge/card.ts`) — confidence calibration (ECE, Brier),
  bias battery (swap-consistency / position bias), and a derived
  `calibrated | uncalibrated | stale` status with the Cycle-of-Trust invariant:
  only a calibrated judge may gate L3/auto-apply/release (`canGate`).
- **Staged failure attribution** (`failure/stage.ts`) — the orthogonal
  `retrieval_miss | reasoning_error | tool_error | verification_error` axis with
  deterministic precedence and per-stage rollups; `apl_failure.pipeline_stage`.
- **Retrieval evaluation** (`eval/retrieval.ts`) — Recall@k, MRR, NDCG (graded),
  a separate retrieval regression gate (Recall@5, cold-start aware, n=0 hard
  fail) and `passCubed` for release-critical changes; `apl_retrieval_case`.
- **Ground-truth provenance** (`eval/provenance.ts`) — per-item provenance
  (rubric version, labeler, agreement, origin); `unanchored` sets cannot back
  release gates; rubric changes compute judge re-baseline targets. Provenance
  columns on `apl_eval_case`.
- **Gold probes** (`judge/gold-probes.ts`) — deterministic 2–5% probe sampling,
  windowed probe-accuracy trend, and a volume-floored drift alert.
- **Drift monitoring** (`drift/`) — representativeness (centroid-cosine shift +
  a training-free two-sample AUC) answering "when did my evals stop representing
  prod?", and tool-call-mix behavior drift (total-variation distance with a
  volume floor); `apl_representativeness_run`.
- **Human-review pipeline** (`hitl/`) — review capture → `review_capture`
  golden candidates, stratified escalation+random sampling, reviewer-ops
  metrics, and a trust-ladder sampling schedule with auto-re-escalation;
  `apl_review_capture`.
- Migration `0001` — three new tables (all RLS-isolated) + the judge/failure/
  eval-case column extensions.

## [0.3.0] — 2026-07-14

The eval-science spec lands, plus the first measurement-discipline features.

### Added

- **Eval-Science spec (v0.3 delta)** — measurement science from Agentic Product
  Standard v3.1 Part V: Judge Card, staged failure attribution, retrieval
  metrics, ground-truth provenance, drift monitoring, and the human-review
  pipeline ([docs/APL-PRD-v0.3-eval-science-delta.md](docs/APL-PRD-v0.3-eval-science-delta.md)). (#57)
- **Judge routing** — `APL_JUDGE_MODEL` env knob routes the eval judge (§1a). (#56)
- **Judge decorrelation** — grounded in the routed model id. (#55)
- **Cycle-of-Trust graduation gate** — numeric autonomy graduation (§6). (#54)
- **GenAI agent attribution** — ingest falls back to the standard
  `gen_ai.agent.{id,name,version}` keys when `apl.*` identity is absent
  (`apl.*` still wins when both are present). (#47)
- ADR: defer the native prompt-hook/goal-judge migration. (#43)

### Changed

- Ecosystem docs: AgenticGateway and AgenticAssurance joined the family table;
  AgenticSelfHealingCode left it. (#53)
- Deps: `ai` v7, `actions/checkout` v7, `@types/node` v26.

## [0.2.1] — 2026-07-03

### Security

- The ingest Bearer-token comparison is now constant-time
  (`crypto.timingSafeEqual` over SHA-256 digests), closing a theoretical
  timing side-channel on `APL_INGEST_TOKEN`.

### Docs

- Production checklist now states the TLS requirement explicitly: run the
  ingest server behind a TLS-terminating reverse proxy.

## [0.2.0] — 2026-07-03

Production hardening: the ingest server gets auth + payload limits, and the
repo gets a deployable Docker stack, an end-to-end CI job, and a release
pipeline.

### Added

- **Ingest hardening** — Bearer-token auth on the ingest server
  (`APL_INGEST_TOKEN`; required outside local dev) and a request payload cap
  (`APL_MAX_BODY_BYTES`, default 5 MB).
- **Docker** — Dockerfiles for `@apl/ingest` and `@apl/worker`, plus a
  docker-compose `full` profile (db + migrate + ingest on `:4319` + worker).
- **CI e2e** — an end-to-end job that applies the migration and runs an authed
  ingest smoke test against a real TimescaleDB.
- **Release workflow** — tag-driven GitHub release.

### Fixed

- Dependabot PRs no longer fail CI on a stale lockfile.

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

[0.4.0]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.4.0
[0.3.0]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.3.0
[0.2.1]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.2.1
[0.2.0]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.2.0
[0.1.0]: https://github.com/Moai-Team-LLC/AgenticPerformance/releases/tag/v0.1.0
