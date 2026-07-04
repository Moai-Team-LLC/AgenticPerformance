# ADR-0001: Defer APL judge migration to native prompt-hooks/goal

- **Status:** Proposed
- **Date:** 2026-07-04

## Context

WS3 asked whether native completion-judging primitives (prompt/agent hooks,
`/goal`) can replace APL's custom "judge" glue. Inspecting APL (ADOPTION-MATRIX §2,
"Prompt-hook Stop judge + /goal (WS3) — APL") shows the "judge" is not a
session-completion loop at all: it is **eval-calibration infrastructure** —
Wilson-bound TPR/TNR gates plus a ledger with mandatory audit fields including
`judgeVersion` and `calibrationSnapshot`. It is provider-agnostic and has **no
Claude Code session loop to replace**.

Native judges cannot persist those audit fields, and adopting them would lock APL
to Claude Code — breaking both the ledger contract and APL's provider-agnostic
posture. Delta **D10** compounds this: the claim "our two-judge pattern is now
native" is doubly inaccurate for APL, because APL's two-judge split (a tuning
judge vs. a sealed gating judge) is **not yet implemented** in APL at all (PRD
finding improve-trust#4). There is no APL two-judge pattern to make native, and
the native agent-hook judge is experimental with undocumented bounds (**D4**).

## Decision

**DEFER** migrating APL's judge glue to native prompt-hooks or `/goal`. Keep the
calibration infrastructure as-is: the Wilson-bound gates and the ledger with its
mandatory `judgeVersion`/`calibrationSnapshot` audit fields remain the source of
truth, provider-agnostic.

Optional, narrow follow-up (not part of this deferral, separately justified if
pursued): use `/goal` as a **headless pre-deploy gate over the baseline suite
only** — a complement that runs alongside calibration, never a replacement for it.

## Consequences

- APL keeps its audit contract intact: every gated decision remains traceable to a
  `judgeVersion` and `calibrationSnapshot`, which native judges cannot record.
- APL stays provider-agnostic; no Claude Code lock-in is introduced.
- We do not build against experimental, undocumented native-judge bounds (D4).
- The optional `/goal` baseline-suite gate is scoped so narrowly it cannot touch
  the calibration ledger — it is additive telemetry, not a gate migration.
- Revisit trigger: if APL implements its own two-judge split (closing
  improve-trust#4) **and** native agent-hook judges gain documented, persistable
  audit fields, re-open the replacement question.

## Alternatives considered

- **Migrate the judge glue to native prompt-hook `Stop` / `/goal` now** — would
  drop the mandatory ledger audit fields and lock APL to Claude Code. Rejected on
  both the audit-contract and provider-agnostic grounds.
- **Claim the two-judge pattern is now native** — factually wrong twice over (D10):
  the split isn't implemented in APL, and the native judge is experimental.
  Rejected.
