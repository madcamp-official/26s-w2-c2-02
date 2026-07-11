---
name: changelog-generator
description: Turn completed work into clear release notes or change summaries. Use when documenting merged changes, release notes, or user-facing updates.
---

# Changelog Generator

Describe what changed in a way humans can scan quickly.

## Process

1. Identify the real behavior changes.
2. Separate user-facing impact from internal refactors.
3. Note setup, migration, or rollout requirements.
4. Keep wording concrete and release-note friendly.

## Output modes

- end-user release notes
- engineering changelog
- PR summary

## Rules

- Prefer impact over implementation detail.
- Mention breaking or manual steps explicitly.
- Omit noise-only refactors unless they matter operationally.
