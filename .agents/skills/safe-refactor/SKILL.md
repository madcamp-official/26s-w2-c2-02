---
name: safe-refactor
description: Refactor with a narrow blast radius and explicit verification. Use when restructuring code without intentionally changing behavior.
---

# Safe Refactor

Refactor in small, reversible moves.

## Process

1. State the behavior that must stay unchanged.
2. Define the smallest safe scope.
3. Identify existing tests that protect the area.
4. Add focused protection if coverage is missing and risk is non-trivial.
5. Refactor in small commits or checkpoints.
6. Re-run the highest-signal checks after each meaningful step.

## Guardrails

- Avoid mixing feature work into refactors.
- Prefer seam improvements over broad rewrites.
- Keep rollback points obvious.
- Call out coupling that makes the refactor riskier than expected.

## Output

Summarize:

- change scope
- affected seams
- verification used
- rollback points
- remaining risk
