#!/usr/bin/env python3
import argparse
from datetime import date
import re
from pathlib import Path


DONE_SECTIONS = {"added", "changed", "fixed", "removed", "security", "deprecated"}
NOTE_SECTIONS = {"notes", "known issues", "risks", "blockers"}
DEFAULT_DONE_LIMIT = 5
DEFAULT_NOTE_LIMIT = 3
IMPORTANT_KEYWORDS = (
    "스크럼",
    "changelog",
    "workflow",
    "hook",
    "command",
    "배포",
    "실행",
    "API",
    "보안",
    "차단",
    "위험",
    "승인",
    "자동",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Korean scrum notes from CHANGELOG.md."
    )
    parser.add_argument("--changelog", default="CHANGELOG.md")
    parser.add_argument("--section", default="Unreleased")
    parser.add_argument(
        "--today",
        action="append",
        default=[],
        help="Add a today task. Can be passed multiple times.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include every changelog item instead of a concise scrum summary.",
    )
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Scrum note date in YYYY-MM-DD format. Defaults to today.",
    )
    parser.add_argument(
        "--output-dir",
        default="scripts/scrum_notes",
        help="Directory where daily scrum notes are saved.",
    )
    return parser.parse_args()


def normalize_heading(text: str) -> str:
    return text.strip().strip("*").strip().lower()


def extract_release_section(markdown: str, section_name: str) -> str:
    pattern = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
    matches = list(pattern.finditer(markdown))
    for index, match in enumerate(matches):
        if normalize_heading(match.group(1)) != normalize_heading(section_name):
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        return markdown[start:end].strip()
    return ""


def parse_subsections(markdown: str) -> dict[str, list[str]]:
    current = ""
    sections: dict[str, list[str]] = {}
    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        heading = re.match(r"^###\s+(.+?)\s*$", line)
        if heading:
            current = normalize_heading(heading.group(1))
            sections.setdefault(current, [])
            continue
        item = re.match(r"^\s*[-*]\s+(.+?)\s*$", line)
        if item and current:
            sections.setdefault(current, []).append(item.group(1).strip())
    return sections


def collect_items(sections: dict[str, list[str]], names: set[str]) -> list[str]:
    items: list[str] = []
    for name, section_items in sections.items():
        if name in names:
            items.extend(section_items)
    return items


def concise_items(items: list[str], limit: int) -> list[str]:
    if len(items) <= limit:
        return items

    important = []
    normal = []
    for item in items:
        lowered = item.lower()
        if any(keyword.lower() in lowered for keyword in IMPORTANT_KEYWORDS):
            important.append(item)
        else:
            normal.append(item)

    selected = []
    for item in important + normal:
        if item not in selected:
            selected.append(item)
        if len(selected) >= limit:
            break
    return selected


def normalize_note_text(text: str) -> str:
    text = re.sub(r"^\s*[-*]\s+", "", text).strip()
    text = re.sub(r"^[A-Z]\d+\.\s*", "", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text.rstrip(".").lower()


def parse_note_date(path: Path) -> date | None:
    try:
        return date.fromisoformat(path.stem)
    except ValueError:
        return None


def load_previous_note_items(output_dir: Path, current_date: date) -> set[str]:
    previous_items: set[str] = set()
    if not output_dir.exists():
        return previous_items

    for note_path in sorted(output_dir.glob("*.md")):
        note_date = parse_note_date(note_path)
        if note_date is None or note_date >= current_date:
            continue
        for line in note_path.read_text(encoding="utf-8").splitlines():
            if re.match(r"^\s*[-*]\s+", line):
                previous_items.add(normalize_note_text(line))
    return previous_items


def exclude_previous_items(items: list[str], previous_items: set[str]) -> list[str]:
    return [
        item
        for item in items
        if normalize_note_text(to_note_style(item)) not in previous_items
    ]


def to_note_style(item: str) -> str:
    replacements = (
        (r"하도록 했습니다(?=[:：]|\.?$)", "하도록 구성"),
        (r"사용할 수 있습니다\.?$", "사용 가능"),
        (r"해야 합니다\.?$", " 필요"),
        (r"수 있습니다\.?$", " 가능"),
        (r"지원합니다(?=[:：]|\.?$)", "지원"),
        (r"추가했습니다(?=[:：]|\.?$)", "추가"),
        (r"통합했습니다(?=[:：]|\.?$)", "통합"),
        (r"조정했습니다(?=[:：]|\.?$)", "조정"),
        (r"정리했습니다(?=[:：]|\.?$)", "정리"),
        (r"제한했습니다(?=[:：]|\.?$)", "제한"),
        (r"됩니다(?=[:：]|\.?$)", "됨"),
        (r"됐습니다(?=[:：]|\.?$)", ""),
        (r"되었습니다(?=[:：]|\.?$)", ""),
        (r"했습니다(?=[:：]|\.?$)", ""),
        (r"합니다(?=[:：]|\.?$)", ""),
        (r"습니다(?=[:：]|\.?$)", ""),
    )
    styled = item.strip()
    for pattern, replacement in replacements:
        styled = re.sub(pattern, replacement, styled).strip()
    return styled.rstrip(".")


def format_bullets(items: list[str], fallback: str) -> str:
    if not items:
        return f"- {fallback}"
    return "\n".join(f"- {to_note_style(item)}" for item in items)


def format_today(today_items: list[str], notes: list[str]) -> str:
    if today_items:
        lines = ["**A. 오늘 진행할 작업**", ""]
        for index, item in enumerate(today_items, start=1):
            cleaned = re.sub(r"^[A-Z]\d+\.\s*", "", item).strip()
            lines.append(f"- A{index}. {to_note_style(cleaned)}")
        return "\n".join(lines)

    inferred = []
    for note in notes:
        if "확정" in note or "갱신" in note or "필요" in note:
            inferred.append(note)

    if not inferred:
        inferred = ["CHANGELOG.md 를 기준으로 오늘 작업 후보를 팀과 확정"]

    lines = ["**A. 후속 정리**", ""]
    for index, item in enumerate(inferred, start=1):
        lines.append(f"- A{index}. {to_note_style(item)}")
    return "\n".join(lines)


def build_note(done_items: list[str], today_items: list[str], note_items: list[str]) -> str:
    output = [
        "### 어제까지 한 일",
        "",
        format_bullets(done_items, "새로 공유할 완료 항목이 없습니다."),
        "",
        "### **오늘 할 일**",
        "",
        format_today(today_items, note_items),
        "",
        "### **궁금한/필요한/알아낸 것**",
        "",
        format_bullets(note_items, "특별히 공유할 blocker 나 확인 사항이 없습니다."),
    ]
    return "\n".join(output)


def main() -> None:
    args = parse_args()
    try:
        scrum_date = date.fromisoformat(args.date)
    except ValueError as error:
        raise SystemExit("--date must use YYYY-MM-DD format.") from error

    output_dir = Path(args.output_dir)
    output_path = output_dir / f"{scrum_date.isoformat()}.md"
    if output_path.exists():
        print(f"이미 스크럼 노트가 생성되었습니다: {output_path}")
        return

    changelog_path = Path(args.changelog)
    if not changelog_path.exists():
        raise SystemExit(f"Changelog not found: {changelog_path}")

    markdown = changelog_path.read_text(encoding="utf-8")
    release_section = extract_release_section(markdown, args.section)
    if not release_section:
        raise SystemExit(f"Section not found in changelog: {args.section}")

    sections = parse_subsections(release_section)
    done_items = collect_items(sections, DONE_SECTIONS)
    note_items = collect_items(sections, NOTE_SECTIONS)

    previous_items = load_previous_note_items(output_dir, scrum_date)
    done_items = exclude_previous_items(done_items, previous_items)
    note_items = exclude_previous_items(note_items, previous_items)

    if not args.all:
        done_items = concise_items(done_items, DEFAULT_DONE_LIMIT)
        note_items = concise_items(note_items, DEFAULT_NOTE_LIMIT)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        build_note(done_items, args.today, note_items) + "\n",
        encoding="utf-8",
    )
    print(f"스크럼 노트를 생성했습니다: {output_path}")


if __name__ == "__main__":
    main()
