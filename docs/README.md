# AgenticPerformance — design docs

AgenticPerformance was built **spec-first**: an initial PRD, an adversarial review
that red-teamed it against a real engine, and a rebuilt v0.2 that the code
implements. These docs are kept for provenance and to make the reasoning behind
the locked decisions legible.

| Doc | What it is |
|---|---|
| [`APL-PRD-v0.2.md`](APL-PRD-v0.2.md) | The current spec — v0.1 with every review fix applied + the §14 decisions resolved. |
| [`APL-PRD-v0.3-eval-science-delta.md`](APL-PRD-v0.3-eval-science-delta.md) | Delta adding *measurement science* from [Agentic Product Standard v3.1](https://github.com/Moai-Team-LLC/agentic-product-standard) Part V — Judge Card, staged failure attribution, golden-set provenance, retrieval metrics, drift (representativeness), and the human-review pipeline. |
| [`APL-plan-and-openq.md`](APL-plan-and-openq.md) | The phased plan (north star, per-phase gates, critical path) + answers to the open questions. |
| [`APL-backlog.md`](APL-backlog.md) | The issue-shaped backlog (Scope / Reuse / Net-new / Acceptance / Depends). |
| [`APL-REVIEW-findings.md`](APL-REVIEW-findings.md) | The adversarial review of v0.1 — verified findings with failure scenarios and fixes. |
| [`APL-contradictions.md`](APL-contradictions.md) | Feasibility contradictions the review surfaced against the reference engine. |
| [`APL-PRD-v0.2-delta.md`](APL-PRD-v0.2-delta.md) | The precise `BEFORE → AFTER` change-set from v0.1 to v0.2. |
| [`APL-PRD-v0.1.md`](APL-PRD-v0.1.md) | The original draft, kept for provenance. |

`ISSUES.md` maps the backlog to the GitHub issue numbers; `PLANNING.md` is the
phase-by-phase build log.
