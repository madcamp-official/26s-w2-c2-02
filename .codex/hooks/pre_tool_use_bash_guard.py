#!/usr/bin/env python3
import json
import re
import sys


DESTRUCTIVE_PATTERNS = [
    r"\brm\s+-rf\s+/(?:\s|$)",
    r"\brm\s+-fr\s+/(?:\s|$)",
    r"\brm\s+-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*\s+\.(?:\s|$)",
    r"\brm\s+-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*\s+\.\.(?:\s|$)",
    r"\bsudo\s+rm\b",
    r"\bgit\s+reset\s+--hard\b",
    r"\bgit\s+clean\s+-[A-Za-z]*[dfx][A-Za-z]*\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\bchmod\s+-R\s+777\b",
    r":\s*>\s*\.env(?:\.[^/\s]+)?\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r":\(\)\s*\{\s*:\|:\&\s*;\s*\}:",
]

SECRET_PATTERNS = [
    r"\b(printenv|env)\b.*\b(TOKEN|SECRET|PASSWORD|API_KEY|KEY)\b",
    r"\becho\b.*\$(?:\{)?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|KEY)[A-Z0-9_]*(?:\})?",
    r"\bcat\b\s+.*\.env(?:\.[^/\s]+)?\b",
]

PROD_PATTERNS = [
    r"\b(curl|wget|http|https)\b.*\b(prod|production|live)\b",
    r"https?://[^ ]*(prod|production|live)[^ ]*",
    r"\b(kubectl|helm|vercel|flyctl|railway)\b.*\b(prod|production)\b",
]

GIT_NETWORK_PATTERNS = [
    (
        r"(?:^|[;&]\s*)git\s+push\b[^\n;&]*\s--(?:force(?!-with-lease)|mirror|delete)\b",
        "Blocked destructive git push variant. Use a normal push, or --force-with-lease only for explicitly approved history rewrites.",
    ),
    (
        r"(?:^|[;&]\s*)git\s+pull\b(?![^\n;&]*\s--ff-only\b)",
        "Blocked git pull without --ff-only. Use proposal + approval, then git pull --ff-only.",
    ),
]


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )


def main() -> None:
    payload = json.load(sys.stdin)
    command = str(payload.get("tool_input", {}).get("command", ""))

    for pattern in DESTRUCTIVE_PATTERNS:
        if re.search(pattern, command):
            deny("Blocked potentially destructive shell command.")
            return

    for pattern in SECRET_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            deny("Blocked likely secret exposure command.")
            return

    for pattern in PROD_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            deny("Blocked command that appears to target a production system.")
            return

    for pattern, reason in GIT_NETWORK_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            deny(reason)
            return


if __name__ == "__main__":
    main()
