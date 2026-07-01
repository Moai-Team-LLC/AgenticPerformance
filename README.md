# APL — Agent Performance Layer (планирование)

Модуль/подсистема наблюдаемости + evals + таксономии ошибок + цикла улучшения агентов поверх движка **AgenticMind** (`/Users/duchenchuk/Desktop/AgenticMind`, локально v0.8.0). Владелец: Moai Team LLC.

## Файлы

| Файл | Что это |
|---|---|
| `APL-PRD-v0.1.md` | Исходный PRD (черновик к ревью). |
| `APL-REVIEW-findings.md` | 49 findings с severity/verdict (✅ verified · ◐ plausible · ○ не в топ-26 · ✗ refuted), WHY + FIX + steelman. Grounded в реальный код. |
| `APL-contradictions.md` | 30 feasibility-противоречий с движком (evidence + note). |
| `APL-plan-and-openq.md` | Ответы на §14 (Q1–Q5) + план Phase 0→5 (north-star, reuse/net-new/gate/risks на фазу, критпуть, топ-риски). |
| `APL-PRD-v0.2-delta.md` | **Готовые к вставке правки** к v0.1 по каждому спорному требованию (`БЫЛО→СТАЛО`/`NEW`), + changelog D1–D26, + новые §15/§16/§17. |
| `APL-PRD-v0.2.md` | **Цельный пересобранный PRD v0.2** (v0.1 + все правки + закрытые Q1–Q5 + план + §15–§17). Готов на согласование. |
| `APL-backlog.md` | Issue-shaped бэклог по фазам: Scope/Reuse/Net-new/Acceptance/Depends на айтем. |

## Код (Phase 0)

Первый слой Phase-0 (реестр APL-0.3/0.4) написан в репо AgenticMind на **локальной ветке `feat/apl-phase0-registry` (не запушено)**: `packages/shared/src/database/schema/apl/` — таблицы `apl_agent` / `apl_agent_prompt` / `apl_agent_version` (immutable, canonical hashing, dedup) + companion `_rls-and-immutability.sql` (RLS как `0003` + append-only триггер) + README с шагами активации. `tsc` зелёный; инертны, пока не подключены в barrel. Откат: `git checkout feat/knowledge-salvage && git branch -D feat/apl-phase0-registry`. (Lint oxlint требует Node 22 — гонять там; tsc = основной гейт.)

## Метод ревью

Workflow: 8 grounded-линз (contract/OTel · SDK · ingest/registry · eval · judge · failure · improve/trust · integ/NFR) → 53 findings → 26 адверсариально верифицировано (22 выжило вкл. 1 Critical, 4 отклонено) → §14-ответы + план на верифицированной базе.

## Вердикт (одной строкой)

Тезис сильный; **позиционирование «тонкий модуль» — главный дефект**. Из ~96 требований: 2 exists / 30 reuse-adapt / 34 net-new / 30 contradiction. APL — смежная подсистема, переиспользующая паттерны AgenticMind.

## Топ-решения v0.2

1. **НЕ ClickHouse** → Postgres/TimescaleDB (иначе Critical: ломает Postgres-only non-goal + выносит трейсы из RLS-тенант-изоляции).
2. **Headless scorecard** (API/MCP); UI + fleet + L3 → enterprise.
3. **`moai.*`→`apl.*`**, идентичность на OTel Resource, **normalization-слой** OpenInference⇆gen_ai.*.
4. **Судья:** стратификация ≥50/класс + Wilson-LB; snapshot-id в версию; независимый gating-судья.
5. **Автономия:** diff-allowlist + контент-гард; **контент-safety на майненых few-shot** (сейчас `feedback-promoter.ts` без гарда = дыра).
6. **Baseline-сьют → MUST**; пустой golden-set = HARD FAIL; нужен OTLP-**ресивер** + 100%-capture на error-path.

## Статус

- ✅ Критический ревью + фесибилити + §14 + план.
- ✅ Цельный **PRD v0.2** (`APL-PRD-v0.2.md`).
- ✅ **Phase 0 в коде — ЗАВЕРШЕНА** на ветке `feat/apl-phase0-registry` (2 коммита, tsc-green, vitest 8/8, не запушено):
  - `8a92474` реестр — `schema/apl/` (`apl_agent`/`apl_agent_prompt`/`apl_agent_version` + RLS + immutability) → #3/#4
  - `9b20070` контракт+нормализация — `lib/apl/` (`contract.ts`, `normalize.ts`, `fixtures.ts`, `normalize.test.ts`) → #1/#2/#5
  - **Phase-0 gate зелёный:** обе фикстуры (gen_ai.* и OpenInference) нормализуются в одинаковый canonical shape.
- ✅ **GitHub issues** — приватный репо https://github.com/AlexDuchDev/apl, 37 issues из бэклога (см. `ISSUES.md`); #1–5 помечены реализованными комментариями.
- ⏳ Далее: **Phase 1** — `wrapAgent` SDK (#6) + инструментация tools (#7) + in-process redaction (#8) + OTLP-ресивер→Timescale-стор (#9) + сэмплинг/Collector (#10).
