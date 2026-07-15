# Optional live Poyo integration procedure

Normal formatting, linting, type checks, tests, registry validation, builds, and production
smokes use local fixtures or loopback servers. They do not need a Poyo key and do not spend
credits.

This procedure is deliberately separate and off by default. Use it only with written
authorization for a specific account and credit ceiling. `bun run test:live` provides one
reviewed, fail-closed paid case; without every approval variable it skips the case or stops
before submission. If any precondition cannot be proven, stop at the connectivity tier.

## Rules

1. Never put an API key in a command argument, source file, `.env.example`, test fixture,
   issue, screenshot, clipboard report, or captured terminal output.
2. Read the key into the process environment without echo and unset it when finished.
3. Record starting balance and freshness before any generation.
4. The automated paid smoke is limited to one reviewed new task and one output.
5. Do not submit when the selected request's maximum cost cannot be established below the
   written ceiling.
6. Do not retry an ambiguous submission. Preserve the local job and Poyo task ID if present,
   then stop.
7. Stop immediately when observed spend reaches or exceeds the ceiling.
8. Never claim remote deletion, cancellation, or expiration was tested; those endpoints are
   not documented.

## Tier 1: connectivity only

This tier calls Poyo's balance endpoint but does not submit a generation.

From a clean shell:

```bash
read -r -s -p "Poyo API key: " POYO_API_KEY
printf '\n'
export POYO_API_KEY
bun run dev
```

Open <http://localhost:5173/settings>, confirm **Environment key active**, and select
**Test connection**. Record only:

- pass/fail;
- returned account identity, if any;
- balance and refresh timestamp;
- application/database/registry versions from Diagnostics.

Do not copy the key, raw environment, or full process listing into evidence. If connectivity
fails, stop here, terminate the application, and unset the key.

## Tier 2: one budget-gated generation

### 1. Review the fixed case and establish an explicit ceiling

Stop the Tier 1 development server with `Ctrl+C` but keep the same shell so the unprinted
`POYO_API_KEY` environment value remains available. Read
`tests/live/poyo-live.live.test.ts` and independently verify its fixed case against the current
[Poyo pricing catalogue](https://poyo.ai/pricing) and model documentation:

- model: `nano-banana-2-lite`;
- request: one 1:1 image from the fixed low-complexity prompt in the test;
- reviewed maximum: 5 credits;
- runner-wide reserve: a case must be at most 150 credits;
- operator ceiling: a whole number from 1 through 300 and at least the reviewed maximum.

Poyo has no pricing-estimate endpoint. If the price or request has changed, do not update the
hash casually and do not run the paid test. Re-review the case, its maximum, and the source
constant together first.

The live runner requires all controls below; there are intentionally no defaults:

```bash
read -r -p "Approved credit ceiling (1-300): " POYO_LIVE_BUDGET_CREDITS
export POYO_LIVE_TESTS=1
export POYO_LIVE_APPROVED=YES
export POYO_LIVE_MODEL=nano-banana-2-lite
export POYO_LIVE_PRICING_HASH=d9967a136a8aad200d408e2b852bae9a6dc9b1e212f472b7fefba41b466d0faf
export POYO_LIVE_BUDGET_CREDITS

bun run test:live
```

The guard does not print the key. It validates approval, model allow-list, integer budget,
reviewed pricing hash, reviewed maximum, and starting balance before the only paid submission.
It then polls the same Poyo task for at most 20 minutes and compares task-reported credits and
the observed balance delta with the declared limits. If it exits nonzero, do not submit a
replacement task.

If submission times out or becomes `submission_unknown`, do not press retry and do not create a
second task. Status polling and download retry are safe only when they operate on the same
known Poyo task/output.

### 2. Reconcile spend and evidence

After the task reaches `finished` or authoritative `failed`, refresh balance and calculate:

```text
observed_spend = start_balance - final_balance
```

Record the result as `passed`, `failed`, or `ambiguous`, with the approved ceiling and observed
spend. Stop if the observed value is negative, unavailable, or greater than the ceiling; do not
run another task to investigate.

A failed Poyo task is expected to cost zero according to the general balance/status docs, but
some model pages describe pre-deduction/refunds. Use the final refreshed balance and Poyo's
reported `credits_amount` as evidence rather than assuming interim billing behavior.

The current paid runner proves direct client submission, authoritative polling, and balance
reconciliation. It does not prove browser orchestration, persisted job recovery, downloads,
or remote cleanup against the live service; those remain covered by loopback integration and
browser tests unless a separate paid procedure is explicitly reviewed.

## Teardown

Stop the server, then clear the shell variables without printing them:

```bash
unset POYO_API_KEY
unset POYO_LIVE_TESTS POYO_LIVE_APPROVED
unset POYO_LIVE_MODEL POYO_LIVE_PRICING_HASH POYO_LIVE_BUDGET_CREDITS
```

Review the redacted Diagnostics report and structured logs for the local job/correlation ID.
Do not search for the literal key in a shell command because doing so can put it into shell
history or process metadata. Do not attach the local database, logs, source media, or downloaded
output to a public report unless their content has been reviewed independently.

## Evidence template

```text
Live test: not run | connectivity only | passed | failed | ambiguous
Date/time (UTC):
Registry versions:
Account identity (redacted if necessary):
Starting balance and freshness:
Approved ceiling:
Reviewed maximum request cost and source/hash:
Model/workflow:
Local job ID:
Poyo task ID (redact if sharing externally):
Terminal authoritative state:
Actual credits reported by task:
Final balance and freshness:
Observed spend:
Verified local outputs:
Polling/download errors:
Notes:
```
