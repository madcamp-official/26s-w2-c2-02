---
name: repo-onboarding
description: Quickly map a repository before touching code. Use when starting in an unfamiliar repo, finding run/test entry points, or summarizing project structure and deployment constraints.
---

# Repo Onboarding

Use this skill to get oriented fast and leave a usable map behind.

## Goals

- Identify the project structure and the important top-level directories.
- Find how to run the project locally.
- Find the fastest relevant test or lint entry point.
- Note deployment or environment caveats that could affect changes.

## Process

1. Read `AGENTS.md` first, then `README.md`, then the nearest subtree docs if needed.
2. Map the repository shape:
   - entry apps or services
   - shared libraries
   - docs, scripts, infra, and deployment folders
3. Find execution entry points:
   - package manager scripts
   - make targets
   - framework-specific commands
4. Find verification entry points:
   - fastest single-target test command
   - broader test suite
   - lint and format commands
5. Find deployment-sensitive files:
   - env examples
   - Docker, CI, IaC, or platform config
   - migration scripts and release notes

## Output

Summarize briefly:

- project structure
- local run command
- local test/lint command
- deployment cautions
- missing documentation or setup gaps
