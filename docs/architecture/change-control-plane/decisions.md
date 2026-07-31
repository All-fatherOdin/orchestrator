# Architecture Decisions

## Accepted

1. **Event spine first.** Add a small canonical change ledger before planner,
   incident, healing, lineage, or UI features.
2. **One authority per concern.** Existing run JSON remains run truth. The new
   ledger owns change/wave transitions only; docs and Project Map remain
   secondary.
3. **Logical append-only, atomic physical writes.** The implementation may
   rewrite a complete ledger file atomically, but published events are never
   mutated or removed.
4. **Deterministic projection.** State is rebuilt from validated events;
   bucket and dashboards are projections.
5. **Fail closed.** Unknown states, event types, dependencies, and transitions
   are rejected.
6. **Audited override.** Dispatch override requires a human actor and reason
   and appends an explicit event.
7. **No guessed equivalence.** Wave, queue/bucket, task, and attempt are
   separate concepts and IDs.
8. **Foundation queue is sequential.** Its two tasks touch the same server
   integration files, so parallel execution is unsafe.
9. **Halts and incidents are distinct.** A halt is one immutable detected
   occurrence; an incident is a durable aggregate with deterministic
   correlation, closure, and reopen evidence.
10. **Warden gates; Doctor executes.** Only a deterministic Warden verdict can
    authorize an allowlisted, bounded, idempotent Doctor recipe. LLM judgment
    alone never grants repair authority.

## Deferred

- database versus compact files after data-volume evidence;
- prompt registry and eval storage;
- operator UI.

## Rejected for the Foundation

- a second scheduler or run store;
- autonomous Git cleanup or external writes;
- auto-heal based on an LLM judgment alone;
- presenting inferred Nikolay behavior as replicated behavior;
- speculative queues whose acceptance criteria depend on code not built yet.
