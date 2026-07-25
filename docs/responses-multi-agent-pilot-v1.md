# Responses API Multi-agent Pilot v1

## Decision

**NO. Production delegation remains disabled.**

This is an optional compatibility and value gate, not an implementation of
production delegation. The local benchmark demonstrates that three disjoint,
bounded I/O-like workstreams can reduce simulated scheduling wall-clock time
without losing fixture quality or evidence. That does not overcome the hard
provider/runtime incompatibilities below, and it is not evidence of live model
latency or quality.

## Optional outcome

Satisfied: the NO branch is complete. An automated local regression verifies
that production Responses API multi-agent behavior remains disabled, and no
production implementation or enablement was added. The existing single-agent
Codex CLI execution path remains the only active path.

The machine-readable result is
`runtime-evals-v1/responses-multi-agent-decision-v1.json`. Re-run it with:

```powershell
node runtime-evals-v1/responses-multi-agent-pilot-v1.mjs --output runtime-evals-v1/responses-multi-agent-decision-v1.json
node --test runtime-evals-v1/responses-multi-agent-pilot-v1.test.mjs
```

No credentials, provider calls, network access, or billable execution are
required.

## Capability boundary

Responses API Multi-agent is a provider beta. A request opts in with
`multi_agent.enabled` and the `responses_multi_agent=v1` beta, and the root
model may coordinate hosted subagents before producing one root final answer.
This is distinct from the existing Codex `multi_agent`/collaboration mode. The
Codex flag controls Codex runtime behavior; it is not provider compatibility
evidence and is deliberately excluded from the gate inputs.

The repository's active executor still starts fresh ephemeral Codex CLI
sessions. It has no direct Responses API Multi-agent adapter, no OpenAI SDK
dependency, and no import of `server/multi-agent-pilot-v1`. The pilot module
also exports a literal false production state and exposes no enablement
environment variable.

## Predeclared GO thresholds

Thresholds live in `server/multi-agent-pilot-v1/thresholds.json` and are loaded
before fixtures execute. GO requires every correctness, compatibility, and
rollout condition plus either a wall-clock or quality gain:

- at least 25% wall-clock improvement or at least 0.05 quality improvement;
- candidate quality at least 1.0 and no worse than the single-agent baseline;
- total fixture-token and weighted cost-input ratios no greater than 1.5;
- 100% evidence preservation and replay match;
- zero duplicate work and 100% complete final synthesis;
- disjoint write scopes, no more than three concurrent subagents, and exactly
  one root synthesis;
- support for the Responses API capability, `max_tool_calls`, explicit
  `/responses/compact`, `reasoning.summary`, and the repository provider route;
- production delegation proven disabled while the gate runs.

Unsupported hard compatibility conditions cannot be traded for speed.

## Deterministic fixture design

The single-agent baseline executes the same three workstreams sequentially.
The candidate schedules them concurrently and then performs one deterministic
root synthesis. Each workstream owns one unique fixture-output path and has
fixed facts, evidence references, delay, and token/cost inputs. Five timing
samples are collected with `performance.now`; the median is recorded.

Quality is exact fixture completion plus exact evidence coverage. Replayability
uses stable synthesis hashes. Duplicate work is repeated workstream identity.
Token figures are deterministic fixture units, not provider-reported tokens.
Cost inputs are weighted units, not currency or a pricing claim.

The beta documentation shows completed output items being retained and replayed
as later input. The local fixture verifies deterministic replay shape and hashes,
but does not claim that provider replay was executed.

## Compatibility evidence and result

Official OpenAI documentation says Responses API Multi-agent is a GPT-5.6 beta,
recommends a default maximum of three concurrent subagents, and makes the root
responsible for synthesis. It also documents these current limitations when
Multi-agent is enabled:

- `/responses/compact` is unsupported; automatic server compaction instead
  applies independently to root and subagent contexts;
- `reasoning.summary` is unsupported;
- `max_tool_calls` is unsupported.

The OpenAI provider supports the beta on supported GPT-5.6 models, while the
documented Amazon Bedrock Responses-compatible runtime does not support
Multi-agent. The local repository route supports neither direct Responses API
requests nor the beta adapter. Sources:

- https://developers.openai.com/api/docs/guides/responses-multi-agent
- https://developers.openai.com/api/docs/guides/responses-multi-agent#limitations
- https://developers.openai.com/api/docs/guides/amazon-bedrock#responses-api-feature-availability

Consequently the hard gates for tool-call limits, explicit compaction,
reasoning summaries, and repository runtime routing fail. The decision is NO
even if the local scheduling fixture meets its value thresholds.

## Rollback conditions

Production must remain on the existing single-agent Codex CLI path. Any future
pilot must revert to that path if a threshold regresses, beta schema or
availability changes, evidence/replay behavior fails, scopes overlap, more than
three subagents run, duplicate work appears, root synthesis is incomplete, or
token/cost inputs exceed 1.5 times baseline. A later GO requires a new
authorized task and provider-compatible evidence; this task provides no
activation mechanism.
