#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path


def git_diff_numstat(root: Path) -> tuple[int, int]:
    try:
        result = subprocess.run(
            ["git", "diff", "--numstat"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
    except Exception:
        return (0, 0)

    added = 0
    deleted = 0
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            if parts[0].isdigit():
                added += int(parts[0])
            if parts[1].isdigit():
                deleted += int(parts[1])
    return (added, deleted)


def main() -> None:
    payload = json.load(sys.stdin)
    root = Path(payload.get("cwd") or ".").resolve()
    patch_text = str(payload.get("tool_input", {}).get("command", ""))
    added, deleted = git_diff_numstat(root)
    deleted_files = len(re.findall(r"^\*\*\* Delete File:", patch_text, re.MULTILINE))

    if deleted_files or deleted >= 150:
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": "Large deletion detected. Review the diff carefully, run the most relevant tests, and confirm documentation impact before continuing.",
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": f"Current diff size is approximately +{added}/-{deleted} lines.",
                    },
                }
            )
        )
        return

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": "Files were edited. Before finishing, run the most relevant verification command and check whether docs such as AGENTS.md, README.md, or CLAUDE.md need updates.",
                }
            }
        )
    )


if __name__ == "__main__":
    main()
