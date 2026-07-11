---
name: tdd-loop
description: Test-driven development for feature work and bug fixes. Use when the user wants test-first changes, mentions TDD or red-green-refactor, or when a change should be protected by tests.
---

# TDD Loop

Work in small vertical slices: red -> green -> refactor.

## Rules

- Write a failing test before changing production code.
- Test behavior through a public seam.
- Make the smallest change that turns the test green.
- Refactor only after green, and keep behavior unchanged.
- Re-run the most relevant local checks after each meaningful slice.

## Loop

1. Pick the seam that proves the real behavior.
2. Add one failing test written in domain language.
3. Change only enough production code to pass.
4. Refactor naming, duplication, and boundaries after green.
5. Repeat one slice at a time.

## Bug-fix mode

- Reproduce the bug first.
- Add a regression test that fails on current behavior.
- Fix only enough to make that test pass.

## Avoid

- testing private helpers directly
- batching many tests before implementation
- assertions coupled to implementation details
- speculative features for future tests

## Final check

Before finishing, summarize:

- seam tested
- tests added or updated
- commands run
- remaining risks
