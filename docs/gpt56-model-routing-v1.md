# Codex model routing v1

Status: active
Last aligned: 2026-09-28
Audience: queue authors and maintainers
Runtime impact: `sol` routes to GPT-6 Sol; Terra and Luna retain their existing IDs
Authority: owner-requested Sol migration and current runtime implementation

Source date: 2026-07-23. The volatile model facts in this document come from OpenAI's official [GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6) and [tools guide](https://developers.openai.com/api/docs/guides/tools).

## Active route policy

| Queue role | Model | Reasoning | Condition |
| --- | --- | --- | --- |
| Everyday implementation, verification, and automatic fallback | `gpt-5.6-terra` | Preserve configured effort (`light` -> `low`, `medium`, or `high`) | Default active route. |
| Quality-first escalation | `gpt-6-sol` | Preserve the selected effort first | Must be explicit: `model: sol` or `model: auto` with `minModel: sol`. Measure this baseline against one lower effort before adopting the lower-cost setting. |
| Efficient contained work | `gpt-5.6-luna` | Preserve configured effort | Available only after the installed Codex runtime is verified and started with `CODEX_LUNA_SUPPORTED=1`. |

The `sol` queue key now resolves to `gpt-6-sol` for execution, correction and review. Existing queues retain their keys and effort settings. GPT-6 Sol supports the existing low, medium and high levels; see the [official model documentation](https://developers.openai.com/api/docs/models/gpt-6-sol), checked 2026-09-28. The router uses explicit provider IDs, not family aliases.

The initial migration baseline is the existing configured effort. The UI's `light` setting maps to Codex `low`; it is the explicit one-level-lower comparison for a `medium` baseline. The router does not silently lower effort and does not enable `max`.

## Fail-closed compatibility and fallback

Every selected task is checked against the installed-runtime capability map and its local Codex tool route before launch. Terra and Sol are the established routes. Luna is disabled by default because the runtime must be verified to accept it with local Codex tools; an explicit Luna task is rejected while disabled. For `model: auto`, the same condition downgrades only the otherwise-Luna contained-work recommendation to Terra and records the automatic routing reason.

The queue accepts only `light`, `medium`, and `high`, which map exactly to Codex `low`, `medium`, and `high`. Invalid model, effort, or unverified model/tool-route combinations are rejected rather than sent to the CLI. Sol is never chosen just because a task has high-risk keywords: the escalation must be explicit. `minModel: sol` is the configuration identity for that quality-first decision.

The live GPT-5.6 documentation demonstrates direct Responses API tool use for the family. This application intentionally stays on the existing local Codex CLI tool route; it does not add Responses API calls, Pro mode, persisted reasoning, explicit prompt caching, Programmatic Tool Calling, or multi-agent behavior.

Historical fixtures and intentionally pinned fallbacks are outside this active route policy and remain unchanged.

## Validation

`server/index.test.ts` covers the Terra identity, Luna opt-in/rejection, automatic Terra fallback, and explicit Sol escalation. The deterministic runtime-evals harness records that its model, reasoning, and routing identities are unsupported rather than claiming provider coverage; it does not invoke a model or installed runtime.
