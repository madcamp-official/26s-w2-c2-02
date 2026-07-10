## Repository Rules

- `AGENTS.md` is the shared source of truth for repository-wide agent rules across tools.
- Update related documentation when behavior, interfaces, or operational expectations change.
- If a nested directory has its own `AGENTS.md`, follow that file for work in that subtree.
- Before editing unfamiliar code, read `AGENTS.md` first, then `README.md` if present.
- Call out any required documentation sync before finishing work.
- Keep tool-specific workflow details out of `AGENTS.md`.
- Keep repo-shared agent guidance in `AGENTS.md`, Codex skills in `.agents/skills/`, Codex hooks/config in `.codex/`, Claude hooks/config in `.claude/`, Claude compatibility notes in `CLAUDE.md`, and cross-tool workflow summaries in `docs/ai_workflows.md`.
- Use Korean commit messages by default. Keep important English technical terms such as `workflow`, `hook`, and `API` when they are clearer.

## Verification

- Run the most relevant local test or lint command after changes when practical.
- If verification cannot be run, state that clearly.
