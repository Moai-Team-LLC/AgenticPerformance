import { describe, expect, it } from "vitest"

import { GenAI } from "../contract"
import { canonicalShape, normalizeGenAI, validateTrace } from "../normalize"
import { fromAgenticOpsRun, outcomeToApl } from "./agenticops"

const run = {
  manifest: { name: "research-agent", model: "claude-sonnet-4" },
  outcome: { status: "completed" as const, turns: 3 },
  audit: [
    { kind: "lifecycle" as const, action: "start", at: 1000 },
    { kind: "tool" as const, action: "web_search", at: 1100 },
  ],
  agentVersion: "v3",
  traceId: "run-1",
  startMs: 1000,
  endMs: 2000,
  tenantId: "00000000-0000-0000-0000-000000000000",
}

describe("AgenticOps → APL adapter", () => {
  it("maps a run to a contract-valid APL trace (invoke_agent + execute_tool)", () => {
    const { trace, timings } = fromAgenticOpsRun(run)
    const normalized = normalizeGenAI(trace)
    expect(validateTrace(normalized)).toEqual([])
    expect(canonicalShape(normalized)).toEqual(["execute_tool<invoke_agent", "invoke_agent<"])
    expect(timings.size).toBe(2) // root + 1 tool audit (lifecycle audit ignored)
  })

  it("stamps agent identity + outcome + model on the root", () => {
    const { trace } = fromAgenticOpsRun(run)
    const root = trace.spans.find((s) => s.parentSpanId === null)
    expect(root?.attributes["apl.agent_id"]).toBe("research-agent")
    expect(root?.attributes["apl.agent_version"]).toBe("v3")
    expect(root?.attributes["apl.outcome"]).toBe("success")
    expect(root?.attributes[GenAI.REQUEST_MODEL]).toBe("claude-sonnet-4")
  })

  it("maps bounded-runner statuses to APL outcomes", () => {
    expect(outcomeToApl("completed")).toBe("success")
    expect(outcomeToApl("error")).toBe("fail")
    expect(outcomeToApl("max-turns")).toBe("escalated")
    expect(outcomeToApl("timeout")).toBe("escalated")
    expect(outcomeToApl("cancelled")).toBe("unknown")
  })
})
