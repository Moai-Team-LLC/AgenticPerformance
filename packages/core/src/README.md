# APL — telemetry contract + normalization (Phase 0)

Closes backlog items **APL-0.1** (canonical `apl.*` contract) and **APL-0.2**
(normalization layer), plus **APL-0.5** (reference fixtures) — the foundation the
whole Agent Performance Layer keys off. Pure, dependency-free library code; no
runtime wiring yet.

## Files

| File                                                  | Role                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract.ts`                                         | Canonical model: `AplOperation` (`invoke_agent`/`chat`/`execute_tool`), `gen_ai.*` + `apl.*` attribute keys, `RawTrace`/`AplTrace` types, mandatory-attr sets. |
| `normalize.ts`                                        | `normalizeGenAI` + `normalizeOpenInference` → internal model; `canonicalShape`, `validateTrace`, `canonicalEquivalent`.                                        |
| `fixtures.ts`                                         | Two reference products (gen_ai.\* raw loop + OpenInference) describing the SAME execution.                                                                     |
| `normalize.test.ts`                                   | Phase-0 acceptance (§6.1): both fixtures normalize to the same canonical shape.                                                                                |
| `redact.ts`                                           | **Phase 1** (APL-1.3): in-process secret + PII redaction before export (reuses `guard.ts`).                                                                    |
| `sdk.ts`                                              | **Phase 1** (APL-1.1/1.2): `wrapAgent` / `instrumentTools` / `recordOutcome`·`Feedback`·`Decision`, injectable `AplSpanSink` (default = `@opentelemetry/api`). |
| `sampling.ts`                                         | **Phase 1** (APL-1.5): head sampler + keep-hint; models the Collector tail-keep decision.                                                                      |
| `redact.test.ts` · `sdk.test.ts` · `sampling.test.ts` | Phase-1 unit tests (no OTel SDK / DB needed).                                                                                                                  |

## Decisions encoded (from PRD v0.2 review)

- **Operation, not span name.** Classification keys on `gen_ai.operation.name`
  (`chat`), never the span name (`chat gpt-4o`) — so model/tool suffixes that
  conformant instrumentors add never fragment aggregation.
- **Identity on the Resource.** `tenant/product/agent/agent_version` are Resource
  attributes (checked by `validateTrace` at trace level); only per-invocation facts
  (`apl.task_id/outcome/…`) are span attributes.
- **Post-normalization equivalence**, not byte-identical trees: equal iff same set of
  `{invoke_agent, chat, execute_tool}` operations + parentage + mandatory attrs.
  Extra framework spans (RETRIEVER, sub-chains) are **preserved** but excluded from
  the canonical shape.
- **OpenInference is a first-class input.** The AgenticMind engine itself emits
  OpenInference (`lib/observability/trace.ts`), so it is normalized through the same
  layer as external `gen_ai.*` products — the engine is not exempt from its own contract.

## Verify

```
bunx tsc --noEmit -p packages/shared/tsconfig.json
bunx vitest run packages/shared/src/lib/apl/
```

## Phase 1 — status

Done + tested here: SDK (`sdk.ts`), redaction (`redact.ts`), sampling (`sampling.ts`).
Storage target: `../../database/schema/apl/trace-span.ts` (`apl_span` hypertable) +
`_span-hypertable.sql`. Collector (tail-sampling + redaction): `deploy/otel-collector.apl.yaml`.

**Contract note:** while building `wrapAgent` it became clear a multi-agent process
shares one OTel Resource, so `agent_id`/`agent_version` moved from the Resource to the
`invoke_agent` span (tenant/product stay on the Resource). `contract.ts` +
`fixtures.ts` were updated accordingly; the Phase-0 gate still passes.

**Deferred (infra, needs a live endpoint/DB):** the OTLP **receiver** server →
normalize → `apl_span` writer (APL-1.4 control-plane), and the SDK-overhead benchmark
(APL-1.6). Everything above is the pure, testable seam those wire into.

## Phase 2 — status (`eval/`)

Done + tested (`eval/{baseline,gate,mining}.ts`), storage in `../../database/schema/apl/eval.ts`:

- **`eval/baseline.ts`** (APL-2.2, makes Q3 a MUST): deterministic baseline suite; an
  empty suite does NOT pass.
- **`eval/gate.ts`** (APL-2.3): version gate vs the PRIOR agent_version's score on the
  SAME `case_set_hash`; empty golden set = HARD FAIL; cold-start gates on baseline only.
  Fixes the two `lib/eval/harness.ts` bugs (passRate=1-on-empty; flat-constant baseline).
- **`eval/mining.ts`** (APL-2.4): failure-fraction cap + deterministic disjoint train/gate
  split (improver-consumed cases held out of the gate — no leakage).

**Deferred:** out-of-band LLM-judge runner (APL-2.5, needs an LLM + runner env).

## Phase 3 — status (`judge/`, `failure/`, `scorecard.ts`)

Done + tested; schemas in `../../database/schema/apl/{judge,failure}.ts`:

- **`judge/calibration.ts`** (APL-3.2, fixes judge#1): stratified (≥50/class) + Wilson
  95% lower bound on TPR **and** TNR. Rejects the "pass on an empty positive class"
  footgun that `computeCalibration` has (reuses its confusion matrix).
- **`judge/version.ts`** (APL-3.1, fixes judge#4): version hash pins the model
  SNAPSHOT; calibration expires on prompt/model change or age.
- **`failure/cluster-identity.ts`** (APL-3.3/3.5, fixes failure#1/#3): durable
  run-over-run cluster id via label-embedding carry-forward (deterministic); `isNewCluster`
  = size + novelty + post-deploy timing.
- **`failure/trend.ts`** (APL-3.5, fixes failure#4): Poisson significance spike +
  volume-floor suppression (no alerts on small-count noise).
- **`scorecard.ts`** (APL-3.7): headless per-agent read-model projection; score curve
  filtered to the current frozen `case_set_hash`.

**Deferred:** 4-stage LLM taxonomy open/axial coding (APL-3.4, needs an LLM — cluster
identity already gives label stability); the cross-tenant fleet view (APL-3.7,
BYPASSRLS + live DB).

## Phase 4 — status (`improve/`)

Done + tested; ledger schema in `../../database/schema/apl/improvement.ts`. Closes the
sharpest security findings:

- **`improve/autonomy.ts`** (APL-4.4, fixes improve-trust#2): diff allowlist + content
  guard. "tools[] unchanged" is necessary but NOT sufficient — rejects tool-invocation
  smuggling / secret / scope language / injection in the patched text.
- **`improve/content-safety.ts`** (APL-4.3, fixes improve-trust#3): screens mined
  artifacts (guard injection/PII + "is-this-an-instruction" heuristic) and quarantines
  low-trust sources, with provenance — closes the `feedback-promoter.ts` poison hole.
- **`improve/ledger.ts`** (APL-4.5, fixes improve-trust#5): an author='judge-gated'
  improvement is UN-writable without full rollback/audit justification; lifecycle state
  machine.
- **`improve/submit.ts`** (APL-4.1/4.2): the L1/L2 ship-through-gate flow —
  autonomy → content-safety → the Phase-2 eval gate.

**Deferred:** the L2 LLM patch proposer (needs an LLM, #16/#25).

## Phase 5 — status (`improve/`)

Done + tested. Closes the reward-hacking + eligibility findings:

- **`improve/eligibility.ts`** (APL-5.1, fixes improve-trust#6): L3 is a CODE-ENFORCED
  gate (golden set ≥ N + fresh stratified calibration + independent gating judge), so
  L3 lights up per agent, never fleet-wide at GA. Reframes PRD assumption A2.
- **`improve/independence.ts`** (APL-5.2, fixes improve-trust#4/judge#3): the gating
  judge must differ in provider AND prompt authorship AND label set; `partitionCorpus`
  gives a deterministic sealed/gate/tuning split the proposer can never train on.
- **`improve/canary.ts`** (APL-5.3/5.4): idempotent, guarded `advance` (resumable after
  a worker restart) + `abDecision` (promote/rollback with a min-sample + margin, no
  decision on noise).

**Deferred (net-new infra):** the durable worker that drives `advance()` and the live
traffic routing that produces the A/B stats (no broker / no rollout code in the engine
today) — these are the seams the pure decisions above wire into.
