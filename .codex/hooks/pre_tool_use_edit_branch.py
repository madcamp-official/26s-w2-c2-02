#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
from pathlib import Path


IMPORTANT_PATHS = (
    ".codex/",
    ".agents/",
    "docs/",
    "AGENTS.md",
    "README.md",
    "CLAUDE.md",
    "KPT.md",
)


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


def touched_paths(payload: dict) -> list[str]:
    tool_input = payload.get("tool_input", {})
    paths = []
    for key in ("file_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str):
            paths.append(value)
    command = str(tool_input.get("command", ""))
    paths.extend(re.findall(r"^\*\*\* (?:Update|Add|Delete) File: (.+)$", command, re.MULTILINE))
    return [path.lstrip("./") for path in paths]


def important_edit(paths: list[str]) -> bool:
    return any(path.startswith(IMPORTANT_PATHS) or path in IMPORTANT_PATHS for path in paths)


def main() -> None:
    payload = json.load(sys.stdin)
    root = Path(payload.get("cwd") or ".").resolve()
    branch = run(["git", "branch", "--show-current"], root)
    status = run(["git", "status", "--short"], root)
    paths = touched_paths(payload)

    if branch not in ("main", "master") or not important_edit(paths):
        return

    if os.environ.get("CODEX_AUTO_BRANCH") == "1" and not status:
        branch_name = "codex/workflow-updates"
        existing = run(["git", "branch", "--list", branch_name], root)
        if existing:
            return
        result = subprocess.run(
            ["git", "switch", "-c", branch_name],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "additionalContext": f"Created topic branch {branch_name} before an important edit on {branch}.",
                        }
                    }
                )
            )
        return

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "additionalContext": "Important edit on main/master detected. Prefer proposing a topic branch first; set CODEX_AUTO_BRANCH=1 only when automatic local branch creation is desired.",
                }
            }
        )
    )


if __name__ == "__main__":
    main()
