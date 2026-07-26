import { createHash } from "node:crypto";
import { compilePromptV1, compileStablePrefixV1 } from "../prompt-compiler-v1/prompt-compiler-v1.mjs";

export const PROMPT_CACHE_LAYOUT_V1 = "PromptCacheLayoutV1";
export const EXPLICIT_CACHE_BREAKPOINT_DEFAULT = false;

const VOLATILE_KEYS = new Set([
  "timestamp", "requestId", "request_id", "user", "userId", "user_id",
  "toolOutput", "tool_output", "workingState", "working_state", "selectedSources",
  "selected_sources", "tools", "toolList", "tool_list",
]);

function fingerprint(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function rejectVolatile(value, path = "stable") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (VOLATILE_KEYS.has(key)) throw new Error(`Volatile or user-specific value ${path}.${key} cannot enter the stable prefix.`);
    rejectVolatile(child, `${path}.${key}`);
  }
}

/**
 * The prefix is immutable governance only. Tool definitions and every task/runtime
 * value are intentionally placed after it to preserve provider implicit caching.
 */
export function buildPromptCacheLayoutV1({ governance, toolContract, task }) {
  rejectVolatile(governance);
  const { prefix } = compileStablePrefixV1({ governance });
  const prompt = compilePromptV1({ governance, toolContract, task });
  if (!prompt.startsWith(prefix)) throw new Error("Prompt compiler no longer preserves the stable-prefix boundary.");
  const suffix = prompt.slice(prefix.length).replace(/^\n+/, "");
  return Object.freeze({
    version: PROMPT_CACHE_LAYOUT_V1,
    stablePrefix: prefix,
    dynamicSuffix: suffix,
    stablePrefixIdentity: fingerprint(prefix),
    prompt,
  });
}

/** Explicit breakpoints are deliberately unavailable until a compatible adapter has measured net value. */
export function explicitCacheBreakpointV1({ route, enabled = EXPLICIT_CACHE_BREAKPOINT_DEFAULT, benchmark } = {}) {
  if (!enabled) return Object.freeze({ enabled: false, reason: "disabled-by-default; implicit provider caching remains available" });
  if (!route?.explicitCacheBreakpointCompatible)
    throw new Error("Explicit cache breakpoints are unsupported for this route.");
  if (!benchmark || benchmark.netValue !== true)
    throw new Error("Explicit cache breakpoints require reproducible net-value benchmark evidence.");
  return Object.freeze({ enabled: true, reason: "compatible route with recorded net-value benchmark evidence" });
}
