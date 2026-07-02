/**
 * APL improvement ledger (Phase-4, backlog APL-4.5) — fixes improve-trust#5.
 *
 * An auto-merged (author="judge-gated") improvement is UN-WRITABLE without the full
 * justification needed to audit and roll it back: the patch diff, the eval run + per
 * failure-mode delta, the judge id/version + calibration snapshot as-of decision, the
 * source traces of any mined content, and the canary/A-B outcome. Mirrors the
 * always-store-actor+reason+hash discipline of guard-events. Pure.
 */

export type ImprovementStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "canary"
  | "deployed"
  | "rolled_back"

export type ImprovementAuthor = "human" | "claude" | "judge-gated"

export interface ImprovementRecord {
  versionFrom: string
  versionTo: string
  hypothesis: string
  status: ImprovementStatus
  author: ImprovementAuthor
  patchDiff?: unknown
  evalRunId?: string
  perModeDelta?: Record<string, number>
  judgeVersion?: string
  calibrationSnapshot?: { tpr: number; tnr: number; labelCount: number }
  sourceTraceRefs?: readonly string[]
  canaryAbOutcome?: string
  rollbackOf?: string
}

/** Fields an auto-merge cannot be written without. */
export const JUDGE_GATED_REQUIRED = [
  "patchDiff",
  "evalRunId",
  "perModeDelta",
  "judgeVersion",
  "calibrationSnapshot",
  "sourceTraceRefs",
  "canaryAbOutcome",
] as const

/** Returns the missing-justification errors — empty means the record is writable. */
export const validateImprovement = (record: ImprovementRecord): string[] => {
  const errors: string[] = []
  if (record.author === "judge-gated") {
    const present: Record<string, unknown> = {
      patchDiff: record.patchDiff,
      evalRunId: record.evalRunId,
      perModeDelta: record.perModeDelta,
      judgeVersion: record.judgeVersion,
      calibrationSnapshot: record.calibrationSnapshot,
      sourceTraceRefs: record.sourceTraceRefs,
      canaryAbOutcome: record.canaryAbOutcome,
    }
    for (const field of JUDGE_GATED_REQUIRED) {
      if (present[field] === undefined) errors.push(`judge-gated improvement missing ${field}`)
    }
  }
  return errors
}

export const isWritable = (record: ImprovementRecord): boolean =>
  validateImprovement(record).length === 0

const ALLOWED_TRANSITIONS: Readonly<Record<ImprovementStatus, readonly ImprovementStatus[]>> = {
  proposed: ["approved", "rejected"],
  approved: ["canary", "deployed", "rejected"],
  canary: ["deployed", "rolled_back"],
  deployed: ["rolled_back"],
  rejected: [],
  rolled_back: [],
}

export const canTransition = (from: ImprovementStatus, to: ImprovementStatus): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to)
