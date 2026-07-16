/**
 * Cache-adjusted cost accounting (doctrine §5 + dev-env dogfooding export). A cost metric
 * built on RAW token counts overstates spend badly when cache-read dominates: measured on
 * our own dev environment, cache-read was 96.5% of all tokens at ~−90% price, so a
 * cache-blind cost is ~6× too high. `costPerVerifiedOutcome` (scorecard.ts) is only
 * meaningful if the `costUsd` feeding it is cache-adjusted — otherwise a cheap, cache-warm
 * loop reads as expensive and the §5 alarm ("burning more to confirm less") fires on noise.
 * Pure — the token split comes from the provider/AgenticGateway usage fields.
 */

/** Token usage for a window, split by cache role (from the LLM/gateway usage fields). */
export interface TokenUsage {
  /** Fresh (uncached) input tokens — full input price. */
  freshInput: number
  /** Cache-write tokens — input price × cacheWriteMult (Anthropic ≈ +25%). */
  cacheWrite: number
  /** Cache-read tokens — input price × cacheReadMult (Anthropic ≈ −90%). */
  cacheRead: number
  /** Output tokens — output price. */
  output: number
}

export interface ModelPricing {
  inputPerMTok: number
  outputPerMTok: number
  /** Cache-write premium over input price. Default 1.25 (Anthropic). */
  cacheWriteMult?: number
  /** Cache-read fraction of input price. Default 0.1 (Anthropic ≈ −90%). */
  cacheReadMult?: number
}

const DEFAULT_CACHE_WRITE_MULT = 1.25
const DEFAULT_CACHE_READ_MULT = 0.1
const PER_MTOK = 1_000_000

/**
 * Cache-adjusted $ cost for a usage window — the number `costPerVerifiedOutcome` MUST use.
 * Weights each token by its cache role: fresh input at full price, cache-write at a small
 * premium, cache-read at a deep discount, output at the output rate.
 */
export const cacheAdjustedCostUsd = (usage: TokenUsage, pricing: ModelPricing): number => {
  const inRate = pricing.inputPerMTok / PER_MTOK
  const cwMult = pricing.cacheWriteMult ?? DEFAULT_CACHE_WRITE_MULT
  const crMult = pricing.cacheReadMult ?? DEFAULT_CACHE_READ_MULT
  return (
    usage.freshInput * inRate +
    usage.cacheWrite * inRate * cwMult +
    usage.cacheRead * inRate * crMult +
    usage.output * (pricing.outputPerMTok / PER_MTOK)
  )
}

/** The cache-BLIND cost (every input-side token at full input price) — the naive metric
 * whose overstatement is the reason cache-adjustment exists. */
export const rawCostUsd = (usage: TokenUsage, pricing: ModelPricing): number =>
  (usage.freshInput + usage.cacheWrite + usage.cacheRead) * (pricing.inputPerMTok / PER_MTOK) +
  usage.output * (pricing.outputPerMTok / PER_MTOK)

/**
 * Fraction (0..1) by which cache adjustment cuts the naive cost. A high value means a
 * raw-token cost metric would massively overstate spend — quantifies why §5 must
 * cache-adjust. Returns 0 for an empty window.
 */
export const cacheSavingsRatio = (usage: TokenUsage, pricing: ModelPricing): number => {
  const raw = rawCostUsd(usage, pricing)
  if (raw === 0) {
    return 0
  }
  return Math.max(0, 1 - cacheAdjustedCostUsd(usage, pricing) / raw)
}
