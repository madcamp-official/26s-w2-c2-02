---
name: bug-investigation
description: Investigate a bug in a disciplined order. Use when behavior is broken, flaky, throwing errors, or suspected to regress.
---

# Bug Investigation

Do not start with a fix. Start with a reliable feedback loop.

## Process

1. Restate the symptom in one sentence.
2. Capture the reproduction path:
   - command, route, UI flow, fixture, or input
3. Build the tightest available failing check:
   - targeted test
   - curl or CLI script
   - minimal harness
4. Narrow the search:
   - recent changes
   - logs and stack traces
   - boundary files near the failing seam
5. List a few root-cause candidates, then eliminate them with evidence.
6. Fix only after one candidate is proven by the failing loop.
7. Lock the bug down with a regression test where practical.

## Guardrails

- Avoid speculative edits before repro.
- Prefer public seams over private internals.
- If the bug is flaky, raise reproduction rate before theorizing.
- If no tight loop is possible, say so clearly and list what was tried.

## Output

Report:

- reproduction steps
- active failing check
- top root-cause candidate
- files worth reading next
- proof used to validate the fix
