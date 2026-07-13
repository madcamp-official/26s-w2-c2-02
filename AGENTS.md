## Repository Rules

- `AGENTS.md` is the shared source of truth for repository-wide agent rules across tools.
- Update related documentation when behavior, interfaces, or operational expectations change.
- Treat the root `README.md` as a stable Roomi project overview after the current rewrite: do not update it for small AI workflow/hook/skill changes. Keep those changes in `docs/ai_workflows.md`, `AGENTS.md`, or tool-specific docs. Nested `README.md` files still follow the normal documentation-sync policy for their subtree.
- For notable behavior, workflow, setup, or user-facing changes, update `CHANGELOG.md` using the changelog-generator style: impact first, internal details second, and manual steps called out explicitly.
- If a nested directory has its own `AGENTS.md`, follow that file for work in that subtree.
- Before editing unfamiliar code, read `AGENTS.md` first, then `README.md` if present.
- Call out any required documentation sync before finishing work.
- Keep tool-specific workflow details out of `AGENTS.md`.
- Keep repo-shared agent guidance in `AGENTS.md`, Codex skills in `.agents/skills/`, Codex hooks/config in `.codex/`, Claude hooks/config in `.claude/`, Claude compatibility notes in `CLAUDE.md`, and cross-tool workflow summaries in `docs/ai_workflows.md`.
- Use Korean commit messages by default. Keep important English technical terms such as `workflow`, `hook`, and `API` when they are clearer.
- Commit and push every completed user-requested change, including small fixes, unless the user explicitly asks not to commit or push. If verification fails or push is blocked, report it instead of hiding the failure.

## Verification

- Run the most relevant local test or lint command after changes when practical.
- If verification cannot be run, state that clearly.
