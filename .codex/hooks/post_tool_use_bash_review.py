#!/usr/bin/env python3
import json
import sys


VERIFICATION_HINTS = ("test", "pytest", "vitest", "jest", "lint", "typecheck", "check", "fmt", "format")
TDD_RED_HINTS = ("tdd", " red", "red-", "failing", "expect-fail", "regression-red")


def main() -> None:
    payload = json.load(sys.stdin)
    command = str(payload.get("tool_input", {}).get("command", ""))
    response = payload.get("tool_response", {})

    exit_code = None
    if isinstance(response, dict):
        exit_code = response.get("exit_code")

    lower_command = command.lower()
    verification_failed = exit_code not in (None, 0) and any(
        token in lower_command for token in VERIFICATION_HINTS
    )
    if verification_failed and any(token in lower_command for token in TDD_RED_HINTS):
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": "A verification command failed in a way that may be an intentional TDD red step. Before finishing, make it green or explicitly report why it remains red.",
                    },
                }
            )
        )
        return

    if verification_failed:
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": "A verification command failed. Inspect the failure, fix it, or explicitly report the gap before continuing.",
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": "A test, lint, typecheck, or formatting command failed in this turn.",
                    },
                }
            )
        )
        return

    if command and any(token in lower_command for token in ("install", "migrate", "generate", "build")):
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": "This command may have changed generated artifacts or runtime expectations. Before finishing, check whether tests, formatting, or docs need a follow-up pass.",
                    }
                }
            )
        )
        return


if __name__ == "__main__":
    main()
