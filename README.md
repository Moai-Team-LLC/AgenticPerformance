# Agent Performance Layer (APL)

[![Agentic Product Standard: Evals & observability](https://img.shields.io/badge/Agentic_Product_Standard-Evals_%26_observability-1E607A)](https://github.com/Moai-Team-LLC/agentic-product-standard/blob/main/SCORECARD.md)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)

> Part of the Moai Team agentic stack:
> **[Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)** (the contract) →
> **[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind)** (knowledge & memory) →
> **[AgenticOps](https://github.com/Moai-Team-LLC/AgenticOps)** (runtime & operations) →
> **APL** (performance & improvement). Adapters for the sibling products ship in
> [`packages/core/src/adapters/`](packages/core/src/adapters).

**Open-source observability, evaluation, error-taxonomy, and improvement loop for
agentic products.** APL instruments any LLM-agent system — LangGraph, CrewAI, the
OpenAI/Claude Agent SDKs, or a raw agent loop — over OpenTelemetry, and turns raw
execution into: (1) traces you can reason about, (2) per-agent golden-set evals
with a CI gate, (3) named failure clusters with trends, and (4) a governed
improvement loop with three autonomy levels and hard safety boundaries.

APL is **engine-agnostic**: it does not require any particular agent framework or
runtime. It is a separate product from — but a natural companion to — the
[AgenticMind](https://github.com/AlexDuchDev/AgenticMind) engine, which is APL's
first-class reference adopter. Apache-2.0 core; enterprise features (SSO/RBAC,
audit, fleet view, on-prem) are a separate edition.

> Status: **core is built and tested** (`@apl/core`, 117 tests). Ingest server +
> durable worker + published SDK are in progress (see `docs/APL-backlog.md`).

## The 7 layers

0. **Contract** — OTel GenAI semconv + namespaced `apl.*`, with a normalization
   layer that maps both OpenInference and `gen_ai.*` into one canonical model.
1. **SDK** — a thin `wrapAgent` / `instrumentTools` wrapper + `record*` hooks.
2. **Ingest & store** — OTLP → normalize → a Postgres/TimescaleDB trace store
   (one datastore, tenant-isolated by row-level security).
3. **Registry** — agents and immutable, content-addressed `agent_version`s.
4. **Evaluation** — a mandatory deterministic baseline suite + per-agent golden
   set + a version gate (blocks regression vs the prior version on a frozen set).
5. **Error analysis** — auto-triage → stable, run-over-run failure clusters →
   significance-gated trends.
6. **Improvement** — L1 assisted → L2 suggested → L3 judge-gated auto, inside a
   mechanically-enforced safety envelope (diff allowlist + content guard + a
   fully-justified, rollback-able improvement ledger).
7. **Scorecard** — a headless per-agent read model exposed as API/MCP.

## Layout

```
packages/core        @apl/core — all the logic (contract, SDK, ingest, eval,
                     judge, failure, improve, scorecard) + Drizzle schema.
  src/vendor/        the ~4 primitives vendored from AgenticMind (PII/injection
                     guard, calibration math, tenant RLS helper, chat seam).
apps/                (WIP) ingest server (OTLP → apl_span) + improvement worker.
docs/                the PRD (v0.1 → v0.2), the review findings, the phased
                     backlog, and the §14 design decisions.
```

## Develop

```
bun install
bun run tsc        # typecheck @apl/core
bun run test       # vitest (117 tests)
```

## Design decisions (why it is the way it is)

APL began as a rigorously-reviewed spec. Key locked decisions live in
`docs/APL-PRD-v0.2.md` and `docs/APL-plan-and-openq.md`; the adversarial review
that shaped them is in `docs/APL-REVIEW-findings.md`. Highlights: Postgres-only
(no second datastore — RLS tenant isolation is mandatory for the trace store);
statistically-sound judge calibration (stratified ≥50/class + Wilson lower bound,
not point estimates); mechanically-enforced autonomy boundary (a patch that
smuggles a tool call in prompt text is rejected even if `tools[]` is unchanged);
content-safety on every mined artifact; and an empty golden set is a hard-fail,
never a green gate.

## Provenance & license

Apache-2.0. A handful of small primitives were vendored (clean-room) from the
Apache-2.0 [AgenticMind](https://github.com/AlexDuchDev/AgenticMind) engine and
are marked in `packages/core/src/vendor/`. APL is intended as a reference
implementation of the observability/improvement layer described in the
[Agentic Product Standard](https://github.com/AlexDuchDev/agentic-product-standard).
