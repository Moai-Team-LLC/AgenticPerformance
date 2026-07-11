/**
 * APL gating-judge independence (Phase-5, backlog APL-5.2) — fixes improve-trust#4
 * + judge#3 (reward-hacking: the gating judge shares identity with the judge the
 * patch was optimized against). The L3 gating judge MUST differ in model provider
 * AND prompt authorship AND calibration label set; and the eval corpus is split so
 * a SEALED set is seen only by the gating judge (never the proposer). Pure.
 */

import { hashUnit } from "../eval/mining"

export interface JudgeDescriptor {
  provider: string
  /** Authorship identity of the judge prompt (e.g. a lineage/author hash). */
  promptAuthorHash: string
  /** Which calibration label set the judge was calibrated on. */
  labelSetId: string
}

export interface IndependenceResult {
  independent: boolean
  reasons: string[]
}

/** The gating judge must not share provider, prompt authorship, or label set with the optimized-against judge. */
export const checkJudgeIndependence = (
  gating: JudgeDescriptor,
  optimizedAgainst: JudgeDescriptor,
): IndependenceResult => {
  const reasons: string[] = []
  if (gating.provider === optimizedAgainst.provider) {
    reasons.push("gating judge shares the model provider with the optimized-against judge")
  }
  if (gating.promptAuthorHash === optimizedAgainst.promptAuthorHash) {
    reasons.push("gating judge shares prompt authorship")
  }
  if (gating.labelSetId === optimizedAgainst.labelSetId) {
    reasons.push("gating judge calibrated on the same (non-disjoint) label set")
  }
  return { independent: reasons.length === 0, reasons }
}

export interface GeneratorJudgeDecorrelation {
  decorrelated: boolean
  reason?: string
}

/**
 * Coarse provider family of a model id (bare or `provider/model`, e.g. a gateway slug like
 * `openrouter/google/gemini-1.5-pro`). Lets the decorrelation/independence checks be
 * grounded in the ACTUAL routed model id rather than a hand-typed `provider` string that
 * can drift from reality. Pure. (Mirrors the sibling engines' family mapper.)
 */
export const providerFamily = (model: string): string => {
  const m = model.toLowerCase()
  const slash = m.lastIndexOf("/")
  const bare = slash > 0 ? m.slice(slash + 1) : m
  if (/^(gpt-|o1|o3|o4|chatgpt|text-)/u.test(bare) || m.includes("openai")) {
    return "openai"
  }
  if (bare.includes("claude") || m.includes("anthropic")) {
    return "anthropic"
  }
  if (bare.includes("gemini") || m.includes("google")) {
    return "google"
  }
  if (/llama|mistral|mixtral|qwen|deepseek|gemma/u.test(bare)) {
    return "open-weights"
  }
  return slash > 0 ? m.slice(0, m.indexOf("/")) : "unknown"
}

/**
 * Doctrine §1a: a judge must be a DIFFERENT model family than the GENERATOR whose output
 * it verifies. A same-family second pass shares the generator's blind spots and co-signs
 * its errors ("two GPT passes are one opinion twice") — distinct from `checkJudgeIndependence`,
 * which guards the judge against the judge a patch was optimized against.
 */
export const checkGeneratorJudgeDecorrelation = (
  generatorProvider: string,
  judgeProvider: string,
): GeneratorJudgeDecorrelation =>
  generatorProvider === judgeProvider
    ? {
        decorrelated: false,
        reason: `judge shares the generator's model family (${judgeProvider}) — a same-family check co-signs shared blind spots`,
      }
    : { decorrelated: true }

/**
 * The same §1a check, grounded in the actual routed model ids (e.g. the judge's
 * `opts.model`) instead of hand-typed provider strings that can lie: it derives each
 * family with `providerFamily` first. Prefer this whenever the concrete model ids are
 * known so the check reflects what the gateway will really route, not metadata.
 */
export const checkGeneratorJudgeDecorrelationByModel = (
  generatorModelId: string,
  judgeModelId: string,
): GeneratorJudgeDecorrelation =>
  checkGeneratorJudgeDecorrelation(providerFamily(generatorModelId), providerFamily(judgeModelId))

export interface CorpusPartition {
  /** Seen only by the gating judge — the proposer never sees these. */
  sealed: string[]
  /** The regression gate's scoring set. */
  gate: string[]
  /** Visible to the L2/L3 proposer. */
  tuning: string[]
}

/**
 * Deterministic 3-way split of a case corpus into sealed / gate / tuning. Same ids →
 * same partition across runs (hash-based, no RNG), so the sealed set stays stable and
 * the proposer can never train on it.
 */
export const partitionCorpus = (
  caseIds: readonly string[],
  opts: { sealedFraction: number; gateFraction: number },
): CorpusPartition => {
  const sealed: string[] = []
  const gate: string[] = []
  const tuning: string[] = []
  const gateCut = opts.sealedFraction + opts.gateFraction
  for (const id of caseIds) {
    const u = hashUnit(id)
    if (u < opts.sealedFraction) sealed.push(id)
    else if (u < gateCut) gate.push(id)
    else tuning.push(id)
  }
  return { sealed, gate, tuning }
}
