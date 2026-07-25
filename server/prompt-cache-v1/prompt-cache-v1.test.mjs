import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptCacheLayoutV1, explicitCacheBreakpointV1 } from "./prompt-cache-v1.mjs";

const governance = { version: "governance.v1", requiredInvariants: [{ id: "scope", text: "Stay within scope." }], rules: ["Do not commit."] };
const base = { toolContract: { version: "tools.v1", allowedTools: ["shell"], rules: ["Use declared tools only."] }, task: { goal: "Change one file.", successCriteria: ["Tests pass."], outputContract: "Report result.", allowedScope: ["server"], verificationCommands: ["node --test"], stopRules: ["Stop on regression."] } };

test("stable prefix identity survives representative dynamic task and tool changes", () => {
  const first = buildPromptCacheLayoutV1({ governance, ...base });
  const changed = buildPromptCacheLayoutV1({ governance, toolContract: { ...base.toolContract, allowedTools: ["shell", "filesystem"] }, task: { ...base.task, goal: "Change two files.", allowedScope: ["server", "docs"] } });
  assert.equal(first.stablePrefixIdentity, changed.stablePrefixIdentity);
  assert.equal(first.stablePrefix, changed.stablePrefix);
  assert.notEqual(first.dynamicSuffix, changed.dynamicSuffix);
  assert.match(changed.dynamicSuffix, /filesystem/);
});

test("volatile runtime data is rejected from the stable contract and absent from the prefix", () => {
  assert.throws(() => buildPromptCacheLayoutV1({ governance: { ...governance, timestamp: "secret" }, ...base }), /Volatile or user-specific/);
  const layout = buildPromptCacheLayoutV1({ governance, ...base });
  for (const secret of ["Working State", "request-123", "selected-source", "tool output"])
    assert.doesNotMatch(layout.stablePrefix, new RegExp(secret, "i"));
});

test("explicit cache breakpoints stay disabled unless compatible benchmark evidence exists", () => {
  assert.deepEqual(explicitCacheBreakpointV1(), { enabled: false, reason: "disabled-by-default; implicit provider caching remains available" });
  assert.throws(() => explicitCacheBreakpointV1({ enabled: true, route: {} }), /unsupported/);
  assert.throws(() => explicitCacheBreakpointV1({ enabled: true, route: { explicitCacheBreakpointCompatible: true } }), /net-value/);
});
