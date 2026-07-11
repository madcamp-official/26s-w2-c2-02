---
name: release-check
description: Run a deployment-readiness pass before shipping. Use when preparing a release, merging a risky change, or verifying operational readiness.
---

# Release Check

Use this before shipping changes that may affect runtime behavior.

## Checklist

1. Verification
   - relevant tests
   - lint
   - format if the repo expects it
2. Config and secrets
   - required env vars
   - example env docs
   - secret handling changes
3. Data and migrations
   - schema changes
   - backward compatibility
   - rollback considerations
4. Runtime and deployment
   - build or packaging steps
   - CI expectations
   - platform-specific caveats
5. Documentation
   - README or operator notes
   - release notes or changelog if needed

## Output

Report:

- checks run
- checks skipped
- release blockers
- manual follow-ups
