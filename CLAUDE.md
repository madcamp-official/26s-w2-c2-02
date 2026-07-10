# Claude Code Compatibility

Use [AGENTS.md](./AGENTS.md) as the primary source of truth for repository rules, verification expectations, and documentation sync requirements.

## Claude-specific notes

- Read `AGENTS.md` first, then `README.md`, before making unfamiliar changes.
- Treat `.agents/skills/` as Codex-specific workflow references. They may still be useful as human-readable process notes, but they are not the Claude-native configuration surface.
- Use [`docs/ai_workflows.md`](./docs/ai_workflows.md) for shared workflow summaries that should make sense to both Codex and Claude users.
- Keep Claude-specific guidance here minimal. If a rule should apply to both Codex and Claude, add it to `AGENTS.md` instead.
- When agent workflow files change, sync `AGENTS.md`, `CLAUDE.md`, [`docs/ai_workflows.md`](./docs/ai_workflows.md), and the relevant section in `README.md`.
