/**
 * APL scorecard read-model (Phase-3, backlog APL-3.7) — HEADLESS by design: this
 * is a pure projection over stored eval runs / clusters / budgets, exposed later as
 * REST/JSON + MCP tools. No UI here (the engine is headless; a rendered console is
 * a separate app / enterprise). The cross-tenant FLEET view (BYPASSRLS-backed) is
 * deliberately NOT built here.
 */

export interface ScoredRun {
  agentVersion: string
  caseSetHash: string
  passRate: number
  tsMs: number
}

export interface ClusterSummary {
  label: string
  count: number
  /** "up" | "down" | "flat" — derived upstream from the significance trend. */
  trend: "up" | "down" | "flat"
}

export interface Budget {
  costUsd?: number
  latencyMs?: number
  tokens?: number
}

export interface ScorecardInput {
  agentId: string
  currentVersion: string
  runs: readonly ScoredRun[]
  clusters: readonly ClusterSummary[]
  budget: Budget
  actual: Budget
  escalationRate: number
  toolCallSuccessRate: number
  pendingApprovals: number
  /** From the code-enforced L3 eligibility check (Phase 5). */
  l3Eligible: boolean
}

export interface Scorecard {
  agentId: string
  currentVersion: string
  /** Score curve over time for the CURRENT frozen case set only (comparable trend). */
  scoreCurve: { agentVersion: string; passRate: number; tsMs: number }[]
  topClusters: ClusterSummary[]
  budgetVsActual: {
    metric: "cost" | "latency" | "tokens"
    budget: number
    actual: number
    overBudget: boolean
  }[]
  escalationRate: number
  toolCallSuccessRate: number
  pendingApprovals: number
  l3Eligible: boolean
}

const budgetRows = (budget: Budget, actual: Budget): Scorecard["budgetVsActual"] => {
  const rows: Scorecard["budgetVsActual"] = []
  const add = (metric: "cost" | "latency" | "tokens", b?: number, a?: number): void => {
    if (b === undefined) return
    const actualVal = a ?? 0
    rows.push({ metric, budget: b, actual: actualVal, overBudget: actualVal > b })
  }
  add("cost", budget.costUsd, actual.costUsd)
  add("latency", budget.latencyMs, actual.latencyMs)
  add("tokens", budget.tokens, actual.tokens)
  return rows
}

/**
 * Builds the per-agent scorecard. The score curve is filtered to the CURRENT frozen
 * case_set_hash so growth of the set never reads as a regression (FR-EVAL-4/G2),
 * and sorted oldest→newest.
 */
export const buildScorecard = (input: ScorecardInput): Scorecard => {
  const currentHash = input.runs.find((r) => r.agentVersion === input.currentVersion)?.caseSetHash
  const scoreCurve = input.runs
    .filter((r) => currentHash === undefined || r.caseSetHash === currentHash)
    .slice()
    .sort((a, b) => a.tsMs - b.tsMs)
    .map((r) => ({ agentVersion: r.agentVersion, passRate: r.passRate, tsMs: r.tsMs }))

  const topClusters = [...input.clusters].sort((a, b) => b.count - a.count).slice(0, 10)

  return {
    agentId: input.agentId,
    currentVersion: input.currentVersion,
    scoreCurve,
    topClusters,
    budgetVsActual: budgetRows(input.budget, input.actual),
    escalationRate: input.escalationRate,
    toolCallSuccessRate: input.toolCallSuccessRate,
    pendingApprovals: input.pendingApprovals,
    l3Eligible: input.l3Eligible,
  }
}
