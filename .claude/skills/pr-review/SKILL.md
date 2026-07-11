---
name: pr-review
description: Review changes for bugs, regressions, missing tests, and operational risk. Use when reviewing a branch, pull request, or local diff.
---

# PR Review

Find correctness and risk issues first. Style is secondary.

## Review order

1. Understand the intended behavior change.
2. Inspect the diff for:
   - logic bugs
   - regressions
   - missing or weak tests
   - security issues
   - performance risks
   - deployment or migration fallout
3. Check whether docs or operational notes should move with the change.

## Reporting rules

- Lead with findings, ordered by severity.
- Cite file paths and line references when possible.
- Prefer concrete behavior risk over generic taste comments.
- If no findings are discovered, say that explicitly and note residual test gaps.

## Output

Use this structure:

- findings
- open questions or assumptions
- short change summary only after findings
