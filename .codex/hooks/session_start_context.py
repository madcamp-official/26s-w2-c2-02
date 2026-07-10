#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path

from hook_session_state import save_state


def run(cmd: list[str], cwd: Path) -> str:
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def detect_commands(root: Path) -> list[str]:
    commands: list[str] = []
    if (root / "package.json").exists():
        commands.append("Inspect package.json scripts for run/test/lint commands.")
    if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists():
        commands.append("Inspect Python project files for run/test commands.")
    if (root / "Cargo.toml").exists():
        commands.append("Rust entry points likely use cargo commands.")
    if (root / "Makefile").exists():
        commands.append("Check Makefile targets for setup, run, and test flows.")
    return commands


def upstream_summary(root: Path) -> str:
    upstream = run(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root)
    if not upstream:
        return ""
    ahead = run(["git", "rev-list", "--count", f"{upstream}..HEAD"], root)
    behind = run(["git", "rev-list", "--count", f"HEAD..{upstream}"], root)
    if ahead.isdigit() and behind.isdigit():
        return f"Upstream: {upstream}; ahead {ahead}, behind {behind}."
    return f"Upstream: {upstream}."


def auto_branch_enabled() -> bool:
    return any(
        os.environ.get(name) == "1"
        for name in ("AI_AUTO_BRANCH", "CODEX_AUTO_BRANCH", "CLAUDE_AUTO_BRANCH")
    )


def main() -> None:
    payload = json.load(__import__("sys").stdin)
    root = Path(payload.get("cwd") or ".").resolve()
    tracked_docs = []
    for name in ("AGENTS.md", "README.md", "CLAUDE.md", "docs/ai_workflows.md", "KPT.md"):
        if (root / name).exists():
            tracked_docs.append(name)
    skills = sorted(p.parent.name for p in root.glob(".agents/skills/*/SKILL.md"))
    branch = run(["git", "branch", "--show-current"], root)
    status = run(["git", "status", "--short"], root)
    save_state(
        root,
        {
            "baseline_clean": not bool(status),
            "branch": branch,
        },
    )
    notes = [
        "Read AGENTS.md before editing unfamiliar code.",
        "Read README.md for project context and execution notes.",
    ]
    if (root / ".agents" / "skills").exists():
        notes.append("Repo-local Codex skills are available under .agents/skills.")
    notes.extend(detect_commands(root))
    if skills:
        notes.append("Available repo skills: " + ", ".join(skills) + ".")
    if tracked_docs:
        notes.append("Shared agent docs present: " + ", ".join(tracked_docs) + ".")
    if branch:
        notes.append(f"Current branch: {branch}.")
    upstream = upstream_summary(root)
    if upstream:
        notes.append(upstream)
    if branch in ("main", "master"):
        notes.append("For substantial changes on main/master, propose creating a topic branch before editing.")
        if auto_branch_enabled():
            notes.append("Auto-branch opt-in is set; a clean protected branch may be switched to a topic branch before substantial edits.")
    if status:
        notes.append("Worktree is not clean; avoid overwriting unrelated changes.")
        notes.append("Auto-commit will stay off for this session because the worktree already had changes.")
    context = " ".join(notes)
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": context,
                }
            }
        )
    )


if __name__ == "__main__":
    main()
