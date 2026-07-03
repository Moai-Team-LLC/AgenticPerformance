# AgenticPerformance

[![Agentic Product Standard: Evals & observability](https://img.shields.io/badge/Agentic_Product_Standard-Evals_%26_observability-1E607A)](https://github.com/Moai-Team-LLC/agentic-product-standard/blob/main/SCORECARD.md)
[![CI](https://github.com/Moai-Team-LLC/AgenticPerformance/actions/workflows/ci.yml/badge.svg)](https://github.com/Moai-Team-LLC/AgenticPerformance/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)

**The Agent Performance Layer (APL)** — the reference implementation of the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)'s
*Evals & observability* surface.

> Part of the Moai Team agentic stack:
> **[Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)** (the contract) →
> **[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind)** (knowledge & memory) →
> **[AgenticOps](https://github.com/Moai-Team-LLC/AgenticOps)** (runtime & operations) →
> **AgenticPerformance** (evals & improvement). See the
> [full ecosystem](#-the-agenticproduct-ecosystem) below; adapters for the sibling
> products ship in [`packages/core/src/adapters/`](packages/core/src/adapters).

**Open-source observability, evaluation, error-taxonomy, and improvement loop for
agentic products.** APL instruments any LLM-agent system — LangGraph, CrewAI, the
OpenAI/Claude Agent SDKs, or a raw agent loop — over OpenTelemetry, and turns raw
execution into: (1) traces you can reason about, (2) per-agent golden-set evals
with a CI gate, (3) named failure clusters with trends, and (4) a governed
improvement loop with three autonomy levels and hard safety boundaries.

APL is **engine-agnostic**: it does not require any particular agent framework or
runtime. It is a separate product from — but a natural companion to — the
[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind) engine, which is APL's
first-class reference adopter. Apache-2.0 core; enterprise features (SSO/RBAC,
audit, fleet view, on-prem) are a separate edition.

## 🌐 The AgenticProduct ecosystem

The AgenticProduct family — a standard plus runnable reference implementations,
built in the open. Each layer is its own product; adopt the ones you need.

| | Repo | Layer |
|---|---|---|
| 📐 | **[agentic-product-standard](https://github.com/Moai-Team-LLC/agentic-product-standard)** | The contract — principles, the autonomy ladder, the 8-layer harness, eval discipline. |
| 🧠 | **[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind)** | Knowledge & memory — auditable, self-improving, citation-enforced, over MCP. |
| ⚙️ | **[AgenticOps](https://github.com/Moai-Team-LLC/AgenticOps)** | Runtime & operations — deployable manifests, bounded runner, scheduling, durable backlog, fleet health. |
| 🩹 | **AgenticSelfHealingCode** *(private beta — opening soon)* | Self-healing ops — production monitoring, auto-repair, and test-suite healing. |
| 📈 | **AgenticPerformance** (this repo) | Performance & improvement — traces, evals, error taxonomy, and the governed improvement loop. |

**How they compose:** AgenticOps *runs* the fleet and AgenticMind *judges*;
AgenticPerformance *measures and improves* what they produce — its
[adapters](packages/core/src/adapters) ingest their telemetry into one contract;
AgenticSelfHealingCode *repairs* what breaks. All conform to the Standard.

> Status: `@apl/core` + `@apl/ingest` (OTLP server) + `@apl/worker` are built and
> tested (**122 tests**, `tsc` clean); the migration applies to a fresh Postgres and
> `POST /v1/traces` is verified end-to-end. A published `@apl/sdk` is next.

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
                     judge, failure, improve, scorecard, adapters) + Drizzle schema.
  src/vendor/        the ~4 primitives vendored from AgenticMind (PII/injection
                     guard, calibration math, tenant RLS helper, chat seam).
apps/ingest          @apl/ingest — OTLP/JSON server (POST /v1/traces → apl_span).
apps/worker          @apl/worker — the advisory-locked improvement scheduler.
docs/                the PRD (v0.1 → v0.2), the review findings, the phased
                     backlog, and the design decisions.
```

## Quickstart (~5 minutes to your first trace)

Requires [Bun](https://bun.sh) ≥ 1.3 and Docker.

```bash
git clone https://github.com/Moai-Team-LLC/AgenticPerformance
cd AgenticPerformance
bun install
cp .env.example .env.local

docker compose up -d            # Postgres (pgvector + vectorscale + TimescaleDB) on :5439
bun run db:migrate-local        # creates the 10 apl_* tables, RLS, hypertable, retention

bun run ingest                  # the OTLP/JSON trace server on :4319
```

Send a sample agent trace and look at it:

```bash
curl -s -X POST http://localhost:4319/v1/traces \
  -H 'content-type: application/json' \
  --data-binary @examples/otlp-sample.json
# → {"ok":true,"written":3}

docker compose exec db psql -U postgres -c \
  "SELECT operation, name, agent_id, agent_version FROM apl_span ORDER BY start_ts;"
```

You now have an `invoke_agent` → `chat` + `execute_tool` trace in the store —
attributed to an agent + version, tenant-isolated by RLS, with a 90-day retention
policy. From here: wrap your own agent with the SDK (`@apl/core/sdk`), or pipe an
existing OTel Collector at `/v1/traces` (see `deploy/otel-collector.apl.yaml` for
the reference tail-sampling + redaction config).

## Develop

```
bun install
bun run tsc        # typecheck core + apps (strict)
bun run test       # vitest (122 tests)
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
Apache-2.0 [AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind) engine and
are marked in `packages/core/src/vendor/`. APL is intended as a reference
implementation of the observability/improvement layer described in the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard).
