import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL review capture (v0.3 eval-science delta, FR-HITL-1). Every human review
 * decision / override is persisted as label data: it feeds the review→golden
 * pipeline as an `origin: review_capture` golden candidate (FR-EVAL-7 provenance;
 * hitl/review-capture.ts). `rubric_version` binds the decision to the exact rubric
 * it was made under — a rubric change re-baselines the judges (FR-EVAL-8), and the
 * captured labels stay attributable to their rubric generation.
 */
const aplReviewCapture = pgTable(
  "apl_review_capture",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    itemRef: text("item_ref").notNull(),
    decision: text("decision").notNull(),
    reviewer: text("reviewer").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_review_capture_decided_idx").on(table.tenantId, table.decidedAt.desc()),
    check(
      "apl_review_capture_decision_check",
      sql`${table.decision} IN ('approve', 'override', 'reject')`,
    ),
  ],
)

type AplReviewCaptureInsert = typeof aplReviewCapture.$inferInsert
type AplReviewCaptureSelect = typeof aplReviewCapture.$inferSelect

export { aplReviewCapture, type AplReviewCaptureInsert, type AplReviewCaptureSelect }
