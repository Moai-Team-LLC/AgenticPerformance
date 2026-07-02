/**
 * Postgres ImprovementStore for the L3 durable sweep. Reads in-flight
 * improvements (approved/canary) and persists status transitions. The pure sweep
 * logic lives in @apl/core/improve/worker.
 */

import type { AplDatabase } from "@apl/core/database/client"
import type { ImprovementStatus } from "@apl/core/improve/ledger"
import type { ImprovementRow, ImprovementStore } from "@apl/core/improve/worker"

import { aplImprovement } from "@apl/core/database/schema/improvement"
import { eq, inArray } from "drizzle-orm"

const IN_FLIGHT: ImprovementStatus[] = ["approved", "canary"]

export const pgImprovementStore = (db: AplDatabase): ImprovementStore => ({
  due: async (): Promise<ImprovementRow[]> => {
    const rows = await db
      .select({ id: aplImprovement.id, status: aplImprovement.status })
      .from(aplImprovement)
      .where(inArray(aplImprovement.status, IN_FLIGHT))
    return rows.map((r) => ({ id: r.id, status: r.status as ImprovementStatus }))
  },
  setStatus: async (id: string, status: ImprovementStatus): Promise<void> => {
    await db.update(aplImprovement).set({ status }).where(eq(aplImprovement.id, id))
  },
})
