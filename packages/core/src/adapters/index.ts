/**
 * APL adapters for the Moai agentic stack. Each adapter maps a sibling product's
 * telemetry into the APL contract (FR-INTEG-2): a caller fills a structural shape
 * from the product's own exports, so APL keeps zero dependency on those packages.
 *
 *   AgenticOps (runtime/fleet)   → fromAgenticOpsRun(run) → RawTrace + timings
 *   AgenticMind (knowledge)      → fromAgenticMind(spans, identity) → RawTrace
 *
 * Pipe the RawTrace through normalize (normalizeGenAI / normalizeOpenInference)
 * then ingest.
 */

export * from "./agenticops"
export * from "./agenticmind"
