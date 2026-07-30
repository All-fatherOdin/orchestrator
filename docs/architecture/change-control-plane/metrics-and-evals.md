# Metrics and Evaluations

“First time without bugs” is not accepted as a metric until its numerator,
denominator, cohort, and observation window are recorded.

## Required Identity

Every measurement must join immutable project, change, wave, task, attempt,
prompt-version, model-route, commit, eval-suite/version, and incident IDs where
applicable. Correlation and causation IDs connect events; display names do not.

## Delivery Metrics

- **First-pass acceptance rate:** tasks accepted after their first completed
  attempt / tasks with at least one completed attempt.
- **Correction cycles:** median and distribution of rejected review/correction
  cycles per accepted task.
- **Lead time:** intent-to-ready, ready-to-dispatch, and dispatch-to-accepted.
- **Cost per accepted change:** tokens and provider cost across all attempts,
  reviews, and replans divided by accepted changes.
- **Override/escalation rate:** audited overrides or human escalations per
  dispatched wave.

## Quality and Safety Metrics

- escaped defects by severity within fixed 7-, 30-, and 90-day windows;
- change failure, rollback, hotfix, reopen, and deployment rework rates;
- scope/architecture drift violations;
- halt recurrence after repair and incident recurrence by class;
- stale-plan detection precision and avoided unsafe dispatches.

## Prompt and Model Evals

Compare prompt/model candidates on versioned task cohorts using identical
acceptance oracles. Record sample size, task mix, confidence interval, cost,
latency, first-pass rate, escaped defects, and policy violations. A prompt may
be marked champion only against a declared objective and guardrails; “eval not
measured” remains an explicit state.

## Baseline

Before claiming improvement, capture at least one comparable prior/manual
cohort. Report absolute values and deltas. Never infer product or business
impact from generated lines, test count, or token use alone.
