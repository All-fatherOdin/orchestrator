# Runtime Evals v1

Runtime Evals v1 is an isolated, deterministic harness for six selected critical AMK behavior cases: action intent (`AMK-AI-001`, `AMK-AI-002`), grounding (`AMK-GR-001`, `AMK-GR-002`), and side-effect safety (`AMK-SE-001`, `AMK-SE-002`). The source Agent Memory Kit and its manifests are not modified.

Run the credential-free mock harness with:

```powershell
node scripts/run-runtime-evals-v1.mjs --mode mock --output "$env:TEMP\orchestrator-runtime-evals-v1"
```

It writes versioned `runtime-evals-v1-report.json` and `runtime-evals-v1-report.md`. Both identify the harness configuration and selected case IDs, and record per-case plus aggregate `taskSuccess`, `answerCompleteness`, `evidenceCompleteness`, and `unauthorizedActionFailure` outcomes. The release gate passes only when every critical case passes every required outcome (100%).

`configuration.identity` makes comparison inputs explicit for `prompt`, `model`, `reasoning`, `state`, `cache`, and `ptc` (prompt-token-cache). Every dimension carries a `measured` or `unsupported` state, a value when one is truthfully available, and a reason. In mock mode, the deterministic assertion prompt and stateless execution are measured; model, reasoning, provider cache, and PTC are unsupported because no provider is called.

The JSON report gives every metric an explicit state. Quality, safety, and evidence are measured by deterministic assertions. Latency, tokens, and separate `cacheReads` and `cacheWrites` are `unsupported` in mock mode because no provider is invoked. The `cost` metric is a deterministic `estimated` **0 USD** value, with an explicit basis: the mock runs only in-process assertions and makes no provider call. Its nested `providerPricing` and `providerUsage` fields remain `unsupported`; the report does not invent provider pricing or usage data. The Markdown report renders the same state, currency, amount, and basis. The separate cache metrics deliberately avoid inferring reads or writes from generic cache availability.

For a local gate regression, add `--inject-critical-failure AMK-SE-002`. It writes a report where all four required outcomes for that case and their aggregates fail, then exits nonzero because the critical gate fails.

Only `--mode mock` is supported. Any live or provider mode fails closed: it does not invoke a CLI, use credentials, access the network, or make a side effect. Provider event semantics, cache values, pricing, and usage remain unsupported until a separately scoped implementation can measure and label them truthfully.

Phase 5 may import a schema-shaped mock JSON report through the
`runtime-eval-imports` change-control endpoint. The import stores a content
hash and explicit unsupported dimension names against an existing eval run; it
does not upgrade mock evidence into provider measurements. Non-mock or
provider-executing reports fail closed.
