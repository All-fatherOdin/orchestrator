# Plan Challenge Checklist v1

Use this prospective checklist while drafting an implementation contract. It
is a review aid, not a schema, receipt, gate, acceptance, or implementation
authorization. Copy the applicable record below into the challenged contract;
do not create a separate per-contract state file.

## 1. Applicability classification

Mark every class `present` or `absent` and link exact repository-relative
evidence. If scope is ambiguous, treat the relevant class as `present` until
the ambiguity is resolved.

| ID | High-risk class | State | Exact evidence |
|---|---|---|---|
| R1 | External network/provider communication, credentials, publication, or external write | `present` / `absent` | |
| R2 | Canonical persistence, event, lifecycle, authority, or recovery change | `present` / `absent` | |
| R3 | Automatic allow/deny, dispatch, acceptance, rollback, repair, routing, budget, or policy decision | `present` / `absent` | |
| R4 | Destructive, irreversible, migration, installation, deployment, rollback, or retention behavior | `present` / `absent` | |
| R5 | Cross-process concurrency, lease, lock, background work, polling, webhook, or cross-repository write | `present` / `absent` | |
| R6 | Private/sensitive data crosses a new process, storage, log, UI, or external-system boundary | `present` / `absent` | |

Result: `required` when any class is `present`; otherwise `not_required`.
Read-only investigation, active-status correction, tests-only coverage under an
accepted contract, and a bounded bug fix with all six classes absent may record
`not_required`. The procedure is prospective and does not reopen completed
contracts solely because they predate v1.

## 2. In-contract challenge record

For `required`, copy and complete this section in the implementation contract.
For `not_required`, retain only the applicability table and result.

```markdown
## Plan Challenge v1 record

- Contract identifier and exact outcome:
- Applicability result: required
- Triggered risk classes and evidence:
- Affected users and workflows:
- Authoritative evidence:
- Assumptions:
- Explicit unknowns:
- Existing mechanism:
- Do-nothing alternative and cost:
- Smallest non-duplicating alternative:
- Authority changes: none / exact description
- Persistence changes: none / exact description
- Privacy changes: none / exact description
- External effects: none / exact description
- Recovery changes: none / exact description
- Failure, stale-evidence, and ambiguity boundaries:
- Rollback and stop boundaries:
- Exact impact map:
- Production consequences: none / exact paths
- Test consequences: none / exact paths
- Generated/manifest/checksum consequences: none / exact paths
- Documentation and acceptance consequences:
- Measurable success:
- Regression gates and guardrails:
- Open owner decisions:

### Round 1 (maximum 10 material questions)

| # | Question | Evidence/answer | Status: resolved/blocker |
|---|---|---|---|

### Round 2 (optional; maximum 5 questions)

Only unresolved Round 1 items or contradictions introduced by their answers.

| # | Round 1 link or contradiction | Question | Evidence/answer | Status |
|---|---|---|---|---|

### Disposition

- Disposition: revise / ready_for_owner_decision / defer / reject
- Unresolved blockers:
- Contract changes produced by the challenge:
- Final impact-map reconciliation:
- Separate owner acceptance instruction: absent / exact later instruction
```

## 3. Question rules

- Round 1 is one batch of no more than ten material questions.
- Round 2 is optional and contains no more than five questions tied to an
  unresolved Round 1 item or a contradiction introduced by its answer.
- Do not rephrase resolved questions, add stylistic questions, or split one
  issue to evade the limits.
- A material revision invalidates affected answers and requires a new contract
  revision, not a third round.
- Never include credentials, raw private data, hidden reasoning, or unbounded
  output; link bounded authoritative evidence instead.

## 4. Disposition rules

- `revise`: bounded contract correction is required.
- `ready_for_owner_decision`: no blocker remains; nothing is accepted yet.
- `defer`: required evidence or an owner decision is unavailable.
- `reject`: the boundary is unsafe, duplicative, or unjustified.

After Round 2, any unresolved authority, privacy, external-effect, recovery,
destructive-action, evidence, or impact-map blocker requires `defer` or
`reject`. The checklist cannot waive it.

## 5. Independent owner boundary

`ready_for_owner_decision`, answered questions, passing tests, or silence do
not accept a contract. Implementation begins only after a separate explicit
owner instruction naming the contract and revision. The challenge record never
authorizes files, queues, execution, merge, deployment, or external effects.

## 6. Completion check

- [ ] Applicability classification is complete and evidence-linked.
- [ ] Every required field is present in the challenged contract.
- [ ] Questions stay within 10 + 5 and two rounds.
- [ ] No blocker is hidden, waived, or inferred resolved.
- [ ] Final choices reconcile to the contract and exact impact map.
- [ ] The disposition uses the closed vocabulary.
- [ ] Owner acceptance remains separate and explicit.
- [ ] The record contains no credential, raw private data, hidden reasoning,
      unbounded output, runtime claim, or implementation claim.
