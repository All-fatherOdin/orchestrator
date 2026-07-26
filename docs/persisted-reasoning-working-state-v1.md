# Persisted Reasoning and Working State v1

Provider reasoning reuse is an optional runtime optimization. It is not
Working State, source authority, a task receipt, durable project memory,
completion evidence, or approval.

The provider-neutral contract lives in
`server/provider-runtime-state-v1/index.ts`. The server integrates it into the
persisted task/run lifecycle; selecting a strategy does not itself make a
network call.

## Modes and actual lifecycle behavior

`ORCHESTRATOR_PROVIDER_REASONING_MODE` accepts:

- `off` — the default. No runtime state is recorded or reused.
- `current_turn` — stored continuation metadata is ignored.
- `persisted` — continuation metadata is eligible only after an exact runtime
  identity match and adapter capability check.

An unset value is `off`; an unknown value fails validation. Immediately before
every executor launch, automatic retry, and reviewer correction, the server
reads the current environment value, reconstructs the task identity, calls
`selectProviderRuntimeContinuationV1`, discards stale state when directed, and
persists the bounded decision before launching the adapter. The selected
strategy, reason, and invalidated identity component names appear in the task
log, run JSON, and Markdown report. Response IDs, summaries, and replay item
content are never copied into those log/report strings.

The current Codex CLI executor still launches fresh `--ephemeral` sessions. Its
adapter declares both `previous_response_id` and manual replay unsupported,
never receives either as CLI arguments, and deterministically selects a
current-turn fallback. Consequently, setting the mode to `persisted` is
observable today but does not continue a provider response. A future adapter
must explicitly declare at least one supported continuation mechanism before
it may use `recordProviderRuntimeStateForAdapterV1`.

## Runtime identity and invalidation

Reuse requires exact stability across these five components:

1. goal
2. scope
3. branch
4. priority
5. authorization

For Orchestrator tasks, goal covers the task key/title/prompt; scope covers the
exact allowed paths and verification commands; branch is the current Git branch
or detached commit; priority covers resolved/requested/minimum model, effort,
routing reason, and selected context-source priority/authority; authorization
covers the configured authorization and approval contracts plus the resulting
decision, authority, and approval-contract fingerprints. If Git branch identity
cannot be read, persisted state is not offered for reuse.

`changedProviderRuntimeIdentityV1` compares components in the fixed order above.
Any change produces `IDENTITY_CHANGED`, returns the complete ordered component
list, exposes neither an old response ID nor replay items, and sets
`stateDisposition: discard`. There is no partial compatibility or heuristic
recovery.

## Persisted operational metadata

`ProviderRuntimeStateV1` is optional JSON-serializable ephemeral metadata on a
task inside `run.json`. Historical records with no runtime fields load
unchanged. Retry and resume retain optional state long enough for the next
selection to validate it while clearing the old decision. Recovery preserves
state but never changes the recovered task outcome because of it.

A supporting future adapter may record:

- a sanitized provider response ID;
- provider-authored reasoning summaries;
- sanitized response items needed for manual replay;
- the five-part identity and its integrity fingerprint;
- a timestamp;
- explicit false authority flags.

Loading reconstructs the allowlisted contract and rejects incompatible
versions, forged fingerprints or authority, hidden reasoning fields, and
unsanitized response IDs. Every record fixes `sourceOfTruth`,
`completionEvidence`, `approvalEvidence`, and `durableProjectMemory` to `false`.
Application logic still derives facts, completion, authorization, and receipts
from their existing authoritative paths.

No hidden reasoning content is accepted. The sanitizer rejects hidden,
encrypted, raw, chain-of-thought, and reasoning-content fields recursively.
Reasoning replay items may contain only their type, identifier, status, and
provider-authored summary.

## Manual replay

When response-ID continuation is unavailable, a supporting adapter may request
manual replay. Sanitization preserves response item order and each item’s
required `type`. It also preserves assistant `phase` values such as
`commentary` and `final`; it never invents or collapses phases. If the adapter
supports neither mechanism, selection returns `current_turn`.

## Deterministic verification

Server tests cover:

- default-off and explicit current-turn behavior;
- exact-identity response-ID reuse and all five invalidations;
- manual replay item types and assistant phases;
- rejection of hidden reasoning and forged authority;
- persisted decisions before executor retries and corrections;
- recovery, resume, retry, and legacy-record compatibility;
- the explicit unsupported Codex CLI adapter and observable fallback;
- JSON round-trip behavior without credentials or provider calls.

Runtime evals include these behaviors in their critical deterministic mock set
and report the rollout identity as `off-by-default`.
