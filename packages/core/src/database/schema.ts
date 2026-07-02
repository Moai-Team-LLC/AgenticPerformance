// @apl/core schema barrel — the APL data model.

import * as Agent from "./schema/agent"
import * as AgentPrompt from "./schema/agent-prompt"
import * as AgentVersion from "./schema/agent-version"
import * as Eval from "./schema/eval"
import * as Failure from "./schema/failure"
import * as Improvement from "./schema/improvement"
import * as Judge from "./schema/judge"
import * as TraceSpan from "./schema/trace-span"

export * from "./schema/agent"
export * from "./schema/agent-prompt"
export * from "./schema/agent-version"
export * from "./schema/trace-span"
export * from "./schema/eval"
export * from "./schema/judge"
export * from "./schema/failure"
export * from "./schema/improvement"

export const schema = {
  ...Agent,
  ...AgentPrompt,
  ...AgentVersion,
  ...TraceSpan,
  ...Eval,
  ...Judge,
  ...Failure,
  ...Improvement,
}
