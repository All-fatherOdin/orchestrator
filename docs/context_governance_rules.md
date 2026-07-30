# Context Governance Rules

## Task-Local Retrieval

1. Classify the requested outcome and mutation authority.
2. Read the root instructions and the smallest operational startup set.
3. Select the task profile.
4. Apply high-risk and trigger-only exclusions before ranking or truncation.
5. Preserve authority, lifecycle status, and inclusion reason in the receipt.
6. Report missing or conflicting evidence instead of filling gaps from model
   memory.

The context index routes agents to sources. It does not grant truth status or
write permission.

## Default Profiles

- `startup`: root rules, active next step, source hierarchy, compact status.
- `review`: authority and review boundaries.
- `implementation`: startup anchors plus task-selected code/spec/test files.
- `context_governance`: helper and retrieval policy maintenance.
- `project_map_governance`: explicit secondary-memory review or mutation.

Trigger-only Project Map content is excluded unless the task explicitly asks
for Project Map governance or memory work.

## High-Risk Context

Logs, runtime state, local databases, secrets, environment files, build output,
raw external payloads, and Git internals are not routine context. A task that
needs one of them must name the exact source and reason.

## Mutation Boundary

Retrieving context never authorizes mutation. Product writes still require the
task's `allowedPaths`, authorization evidence, verification commands, and
execution guards. Project Map writes additionally require explicit
Project Map scope.

## Promotion

Session discoveries enter durable project memory only as reviewed candidates.
Facts require evidence; decisions require owner or accepted-spec authority;
stale or superseded records remain auditable but must not appear as current
truth.
