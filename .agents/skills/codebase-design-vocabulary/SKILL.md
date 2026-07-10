---
name: codebase-design-vocabulary
description: Use a shared vocabulary for seams, interfaces, and module boundaries. Use when discussing architecture, testability, or refactor direction.
---

# Codebase Design Vocabulary

Use consistent language when discussing code shape.

## Terms

- module: a unit with an interface and implementation
- interface: what callers must know to use the module correctly
- seam: the place where behavior can be exercised or swapped
- adapter: a concrete implementation at a seam
- depth: how much useful behavior sits behind a small interface
- locality: how much related change stays concentrated in one place

## Principles

- Prefer deep modules over thin pass-through layers.
- Put tests at the public seam when possible.
- Reduce interface size before adding abstraction.
- Introduce seams where variation or testing actually needs them.
- Name boundaries consistently across code and docs.

## Use

When proposing changes, explain them in terms of:

- which seam moves
- what interface gets simpler
- where locality improves
- how tests become easier or clearer
