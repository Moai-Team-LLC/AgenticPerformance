import { describe, expect, it } from "vitest"

import type { Attributes } from "./contract"
import type { AplSpanHandle, AplSpanSink } from "./sdk"

import { Apl, AplOperation, GenAI } from "./contract"
import { wrapAgent } from "./sdk"

interface Rec {
  name: string
  attributes: Attributes
  exceptions: unknown[]
}

class RecordingSink implements AplSpanSink {
  readonly spans: Rec[] = []
  run<T>(
    name: string,
    attributes: Attributes,
    fn: (span: AplSpanHandle) => Promise<T>,
  ): Promise<T> {
    const rec: Rec = { name, attributes: { ...attributes }, exceptions: [] }
    this.spans.push(rec)
    const handle: AplSpanHandle = {
      setAttribute: (key, value) => {
        rec.attributes[key] = value
      },
      recordException: (error) => {
        rec.exceptions.push(error)
      },
    }
    return fn(handle)
  }
}

const agentOf = (sink: RecordingSink) =>
  wrapAgent("research-agent", {
    productId: "moai-research",
    agentVersion: "v3",
    taskId: "task-1",
    sink,
  })

const rootSpan = (sink: RecordingSink): Rec => {
  const root = sink.spans[0]
  if (root === undefined) throw new Error("no root span recorded")
  return root
}

describe("APL SDK — wrapAgent / instrumentTools (Phase-1 APL-1.1/1.2)", () => {
  it("opens invoke_agent with agent identity keyed on the operation", async () => {
    const sink = new RecordingSink()
    await agentOf(sink).run(async () => undefined)
    const root = rootSpan(sink)
    expect(root.name).toBe("invoke_agent research-agent")
    expect(root.attributes[GenAI.OPERATION_NAME]).toBe(AplOperation.INVOKE_AGENT)
    expect(root.attributes[Apl.AGENT_ID]).toBe("research-agent")
    expect(root.attributes[Apl.AGENT_VERSION]).toBe("v3")
    expect(root.attributes[Apl.TASK_ID]).toBe("task-1")
  })

  it("recordOutcome sets outcome and flags keep only on fail/escalated", async () => {
    const okSink = new RecordingSink()
    await agentOf(okSink).run(async (ctx) => ctx.recordOutcome("success"))
    expect(rootSpan(okSink).attributes[Apl.OUTCOME]).toBe("success")
    expect(rootSpan(okSink).attributes[Apl.KEEP]).toBeUndefined()

    const failSink = new RecordingSink()
    await agentOf(failSink).run(async (ctx) => ctx.recordOutcome("fail"))
    expect(rootSpan(failSink).attributes[Apl.OUTCOME]).toBe("fail")
    expect(rootSpan(failSink).attributes[Apl.KEEP]).toBe(true)
  })

  it("recordDecision redacts secrets before they become an attribute", async () => {
    const sink = new RecordingSink()
    await agentOf(sink).run(async (ctx) =>
      ctx.recordDecision("chose route A; key sk-ABCDEFGHIJKLMNOPQRSTUVWX"),
    )
    const reason = rootSpan(sink).attributes[Apl.DECISION_REASON]
    expect(reason).toContain("[redacted:secret:openai_key]")
    expect(reason).not.toContain("sk-ABCDEFGHIJKLMNOPQRSTUVWX")
  })

  it("wrapTool emits an execute_tool span and returns the result", async () => {
    const sink = new RecordingSink()
    const out = await agentOf(sink).run(async (ctx) => {
      const search = ctx.wrapTool("web_search", async (q: string) => `res:${q}`)
      return search("hi")
    })
    expect(out).toBe("res:hi")
    const tool = sink.spans.find((s) => s.name === "execute_tool web_search")
    expect(tool?.attributes[GenAI.OPERATION_NAME]).toBe(AplOperation.EXECUTE_TOOL)
    expect(tool?.attributes[GenAI.TOOL_NAME]).toBe("web_search")
  })

  it("wrapTool records the exception and rethrows", async () => {
    const sink = new RecordingSink()
    await expect(
      agentOf(sink).run(async (ctx) => {
        const boom = ctx.wrapTool("boom", async () => {
          throw new Error("nope")
        })
        return boom()
      }),
    ).rejects.toThrow("nope")
    const tool = sink.spans.find((s) => s.name === "execute_tool boom")
    expect(tool?.exceptions).toHaveLength(1)
  })

  it("instrumentTools wraps every tool with no per-tool code", async () => {
    const sink = new RecordingSink()
    await agentOf(sink).run(async (ctx) => {
      const tools = ctx.instrumentTools({
        alpha: async () => 1,
        beta: async () => 2,
      })
      await tools.alpha()
      await tools.beta()
    })
    expect(sink.spans.map((s) => s.name)).toEqual(
      expect.arrayContaining(["execute_tool alpha", "execute_tool beta"]),
    )
  })
})
