#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path

from hook_session_state import load_state


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


def run_ok(cmd: list[str], cwd: Path) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
        )
        return (result.returncode == 0, result.stdout.strip() or result.stderr.strip())
    except Exception as exc:
        return (False, str(exc))


def parse_numstat(output: str) -> tuple[int, int]:
    added = 0
    deleted = 0
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            if parts[0].isdigit():
                added += int(parts[0])
            if parts[1].isdigit():
                deleted += int(parts[1])
    return (added, deleted)


def git_diff_numstat(root: Path) -> tuple[int, int]:
    unstaged = parse_numstat(run(["git", "diff", "--numstat"], root))
    staged = parse_numstat(run(["git", "diff", "--cached", "--numstat"], root))
    return (unstaged[0] + staged[0], unstaged[1] + staged[1])


def auto_commit_enabled() -> bool:
    return any(
        os.environ.get(name) == "1"
        for name in ("AI_AUTO_COMMIT", "CODEX_AUTO_COMMIT", "CLAUDE_AUTO_COMMIT")
    )


def classify_commit_message(changed_files: list[str]) -> str:
    doc_files = {"AGENTS.md", "README.md", "CLAUDE.md"}
    if any(path.startswith(".codex/") for path in changed_files):
        return "chore: workflow 자동화 업데이트"
    if any(path.startswith("docs/") or path in doc_files for path in changed_files):
        return "docs: 문서 업데이트"
    return "chore: 중요 변경사항 저장"


def should_auto_commit(changed_files: list[str], added: int, deleted: int) -> bool:
    important_paths = {"AGENTS.md", "README.md", "CLAUDE.md"}
    if len(changed_files) >= 2:
        return True
    if added + deleted >= 25:
        return True
    return any(
        path.startswith(".codex/")
        or path.startswith("docs/")
        or path in important_paths
        for path in changed_files
    )


def main() -> None:
    payload = json.load(__import__("sys").stdin)
    root = Path(payload.get("cwd") or ".").resolve()
    session_state = load_state(root)
    short_status = run(["git", "status", "--short"], root)
    changed_files = []
    if short_status:
        for line in short_status.splitlines():
            if len(line) > 3:
                changed_files.append(line[3:])
    added, deleted = git_diff_numstat(root)
    summary_parts = []
    if changed_files:
        preview = ", ".join(changed_files[:6])
        if len(changed_files) > 6:
            preview += ", ..."
        summary_parts.append(f"Changed files: {preview}.")
    else:
        summary_parts.append("No tracked file changes detected.")
    if changed_files and session_state.get("baseline_clean") and auto_commit_enabled():
        if should_auto_commit(changed_files, added, deleted):
            commit_message = classify_commit_message(changed_files)
            add_ok, add_output = run_ok(["git", "add", "-A"], root)
            if add_ok:
                commit_ok, commit_output = run_ok(
                    ["git", "commit", "-m", commit_message],
                    root,
                )
                if commit_ok:
                    summary_parts.append(f"Auto-committed important changes with message: {commit_message}.")
                else:
                    summary_parts.append(f"Auto-commit failed: {commit_output}.")
            else:
                summary_parts.append(f"Auto-commit staging failed: {add_output}.")
        else:
            summary_parts.append("Auto-commit skipped because the current changes did not meet the important-change heuristic.")
    elif changed_files and session_state.get("baseline_clean"):
        summary_parts.append("Auto-commit skipped because no auto-commit opt-in env var is set.")
    elif changed_files:
        summary_parts.append("Auto-commit skipped because this session started with an already dirty worktree.")
    summary_parts.append("Before finishing, confirm test status and remaining risk in the final response.")
    summary_parts.append("If behavior or workflow changed, confirm whether AGENTS.md, README.md, KPT.md, or CLAUDE.md need updates.")
    print(
        json.dumps(
            {
                "systemMessage": " ".join(summary_parts),
                "hookSpecificOutput": {
                    "hookEventName": "Stop"
                }
            }
        )
    )


if __name__ == "__main__":
    main()
