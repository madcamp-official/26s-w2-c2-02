# Changelog

이 파일은 스크럼과 릴리스 준비 때 최근 변경사항을 빠르게 훑기 위한 작업 로그입니다.
계속 참조해야 하는 핵심 정보는 루트 `README.md` 또는 관련 하위 문서에 반영하고, 여기에는 변경 영향과 후속 확인 사항을 짧게 남깁니다.

## Unreleased

### Added

- 협업형 실전 산출물 제작 과제용 `README.md` 템플릿을 추가했습니다.
- 루미(Room-AI) 프로젝트 기획안, 구현 명세, IA 구조도, 데이터 구조, API 초안을 루트 `README.md` 에 정리했습니다.
- AI 협업을 위한 공통 문서 체계를 추가했습니다: `AGENTS.md`, `CLAUDE.md`, `docs/ai_workflows.md`, `KPT.md`.
- Codex 공용 workflow skill 을 추가했습니다: repo onboarding, bug investigation, TDD loop, PR review, release check, safe refactor, design vocabulary, planning, grill-me, changelog generation.
- Codex project-local hook 과 config 를 추가해 세션 시작 컨텍스트, Bash 안전 검사, 편집 후 검토, 종료 시 요약과 선택적 자동 커밋 흐름을 지원합니다.
- Claude Code project-local 설정을 추가해 Codex 와 같은 hook 스크립트를 공유하도록 했습니다.
- AI 협업 workflow 에 changelog 작성 흐름을 통합했습니다.
- `CHANGELOG.md` 기반 스크럼 회의록 초안을 생성하는 command 를 추가했습니다.
- Electron 데스크톱 앱, API 서비스, 공유 TypeScript 계약, 공통 config 패키지를 포함한 루미 초기 monorepo 구조를 추가했습니다.
- MVP 방 생성, realtime, 환경변수 세팅을 위한 초안 문서 `docs/architecture.md`, `docs/api.md` 를 추가했습니다.
- Electron renderer, main process, preload bridge 검증을 위한 `Vitest`, Testing Library, jsdom 기반 테스트 설정과 초기 테스트를 추가했습니다.
- Electron 없이 renderer 화면만 5175 포트에서 확인할 수 있는 `dev:renderer` script 를 추가했습니다.
- 실제 Electron 창을 띄워 앱 shell 과 preload API 를 확인하는 Playwright E2E 테스트 설정을 추가했습니다.
- Linux/headless 환경에서도 Electron E2E 를 실행할 수 있도록 `ELECTRON_RUN_AS_NODE` 제거와 `xvfb-run` 실행 흐름을 반영했습니다.

### Changed

- 루트 `README.md` 를 과제 템플릿과 AI 협업 안내 중심에서 루미 프로젝트 고정 개요/기획 문서 중심으로 재구성했습니다.
- AI 협업 설정 안내는 루트 `README.md` 에 중복하지 않고 `docs/ai_workflows.md` 에서 관리하도록 문서 동기화 정책을 조정했습니다.
- 루트 `README.md` 는 앞으로 자잘한 AI workflow 변경에는 고정으로 두고, 하위 디렉터리 `README.md` 는 기존처럼 해당 모듈 변경에 맞춰 갱신하도록 `AGENTS.md` 와 `docs/ai_workflows.md` 에 명시했습니다.
- `git push` 와 `git pull` 은 자동 실행하지 않고 승인 후 진행하도록 workflow 를 정리했습니다.
- `git pull` 은 `--ff-only` 기본 사용을 요구하고, 위험한 push 옵션은 hook 에서 차단하도록 했습니다.
- 명시적으로 승인된 history rewrite 에 한해 `git push --force-with-lease` 를 허용하도록 조정했습니다.
- 중요한 변경은 가능하면 `main` 또는 `master` 가 아닌 topic branch 에서 시작하도록 branch-first workflow 를 추가했습니다.
- 중요 변경 자동 커밋은 clean-start session 과 opt-in 환경변수 조건에서만 동작하도록 제한했습니다.
- commit 메시지는 한국어를 기본으로 쓰되, `workflow`, `hook`, `API` 같은 중요한 영어 기술어는 유지하도록 정했습니다.
- 중요한 behavior, workflow, setup, user-facing 변경은 `changelog-generator` 기준으로 영향 중심의 항목을 남기도록 정했습니다.
- 스크럼 회의록은 `CHANGELOG.md` 의 `Unreleased` 항목 중 중요한 내용만 골라 "어제까지 한 일", "오늘 할 일", "궁금한/필요한/알아낸 것" 형식으로 변환해 시작하도록 정했습니다.
- 스크럼 회의록 출력 문체는 "~했습니다" 문장형 대신 개조식을 기본으로 사용하도록 정했습니다.
- 스크럼 회의록 생성 script 는 `scripts/scrum_notes/YYYY-MM-DD.md` 에 날짜별로 저장하고, 이전 날짜 노트와 겹치는 항목은 제외하도록 변경했습니다.
- 같은 날짜의 스크럼 회의록이 이미 있으면 새 파일을 만들지 않고 안내 메시지만 출력하도록 변경했습니다.
- Codex/Claude Stop hook 이 자동 커밋 환경변수 `AI_AUTO_COMMIT`, `CODEX_AUTO_COMMIT`, `CLAUDE_AUTO_COMMIT` 를 모두 `1` 로 주입하도록 변경했습니다.

### Notes

- 수동 설정, migration, 배포 전 확인이 필요한 변경은 항목 안에 명시합니다.
- Codex 사용자는 저장소를 trust 해야 repo-local `.codex/` hook 과 config 가 로드됩니다.
- 자동 branch 생성은 `AI_AUTO_BRANCH=1`, `CODEX_AUTO_BRANCH=1`, `CLAUDE_AUTO_BRANCH=1` 중 하나를 설정한 경우에만 사용할 수 있습니다.
- 자동 커밋은 Codex/Claude Stop hook 에서 기본으로 켜집니다.
- 실제 앱 코드와 실행 진입점은 아직 확정되지 않았습니다. 확정 후 루트 `README.md` 의 실행 방법을 큰 변경으로 갱신합니다.

### Manual Steps

- 새 workspace script 를 사용하기 전에 `pnpm install` 을 실행해야 합니다.
- Daily 또는 LLM provider 를 연결하기 전에 `.env.example` 을 `.env` 로 복사하고 필요한 service key 를 채워야 합니다.
