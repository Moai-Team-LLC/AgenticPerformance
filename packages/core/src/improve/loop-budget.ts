/**
 * APL loop fail-block (Verified-Autonomy doctrine §2 + the enforced side of §5).
 *
 * A uniform, PURE stop-contract for any APL loop that consumes budget — the durable
 * improvement sweep today, the judge/proposer LLM loops later. The loop injects the
 * clock (nowMs) and any per-iteration token/cost deltas; nothing here reads a clock,
 * db, or network, mirroring the rest of core.
 *
 * Doctrine: the budget is checked at the top of each iteration AND again at the
 * point-of-effect (the SHC kill-race lesson), and the loop STOPS FAIL-CLOSED on any
 * breach rather than "trying once more". The guarded entry (`guardedSweep`) requires a
 * budget by its signature — absent budget = refuse to run.
 */

export interface LoopBudget {
  /** Hard cap on iterations (rows/steps) processed in one run. */
  maxIterations: number
  /** Cumulative token ceiling across the run. */
  tokenBudget: number
  /** Hard dollar ceiling across the run (the enforced form of the §5 cost cap). */
  costCapUsd: number
  /** Wall-clock ceiling measured from the run start against the injected clock. */
  timeoutMs: number
  /** Consecutive verify failures after which the run escalates to a human. */
  escalateAfterVerifyFails: number
}

export type StopReason =
  | "kill_switch"
  | "max_iterations"
  | "token_budget"
  | "cost_cap"
  | "timeout"
  | "escalate_verify_fails"

export interface BudgetState {
  iterations: number
  tokens: number
  costUsd: number
  consecutiveVerifyFails: number
  startedMs: number
}

export interface BudgetTracker {
  /**
   * The fail-closed stop check. Call at the top of each iteration AND immediately
   * before the point-of-effect write. Returns the breached reason, or null to proceed.
   */
  shouldStop(nowMs: number): StopReason | null
  /** Record one consumed iteration, with optional token/cost deltas. */
  recordIteration(delta?: { tokens?: number; costUsd?: number }): void
  /** A verify/outcome failure — increments the consecutive-fail counter. */
  recordVerifyFail(): void
  /** A verify/outcome success — resets the consecutive-fail counter. */
  recordVerifyPass(): void
  state(): Readonly<BudgetState>
}

/**
 * Pure budget tracker. `killSwitch` is re-read on every `shouldStop`, so a switch
 * flipped mid-run halts the loop at the next check (top-of-iteration or point-of-effect).
 */
export const createBudgetTracker = (
  budget: LoopBudget,
  startedMs: number,
  killSwitch?: () => boolean,
): BudgetTracker => {
  const s: BudgetState = {
    iterations: 0,
    tokens: 0,
    costUsd: 0,
    consecutiveVerifyFails: 0,
    startedMs,
  }
  return {
    shouldStop: (nowMs) => {
      if (killSwitch?.() === true) return "kill_switch"
      if (s.iterations >= budget.maxIterations) return "max_iterations"
      if (s.tokens > budget.tokenBudget) return "token_budget"
      if (s.costUsd > budget.costCapUsd) return "cost_cap"
      if (nowMs - s.startedMs > budget.timeoutMs) return "timeout"
      if (s.consecutiveVerifyFails >= budget.escalateAfterVerifyFails)
        return "escalate_verify_fails"
      return null
    },
    recordIteration: (delta) => {
      s.iterations += 1
      s.tokens += delta?.tokens ?? 0
      s.costUsd += delta?.costUsd ?? 0
    },
    recordVerifyFail: () => {
      s.consecutiveVerifyFails += 1
    },
    recordVerifyPass: () => {
      s.consecutiveVerifyFails = 0
    },
    state: () => ({ ...s }),
  }
}
