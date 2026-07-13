# Changelog

이 파일은 스크럼과 릴리스 준비 때 최근 변경사항을 빠르게 훑기 위한 작업 로그입니다.
계속 참조해야 하는 핵심 정보는 루트 `README.md` 또는 관련 하위 문서에 반영하고, 여기에는 변경 영향과 후속 확인 사항을 짧게 남깁니다.

## Unreleased

### Added

- 루미 메시지를 방 상태에 저장하고 실시간으로 전달하도록 연결했습니다. 자리 비움이 60초 이상 이어진 경우에만 해당 참가자에게 집중 회복 메시지를 보내며, 같은 참가자에게는 5분 cooldown을 적용합니다.
- 스터디 라이브 세션을 시작하면 루미가 Gemini 기반 시작 멘트를 실시간으로 안내하고, 집중 이탈·자리 비움 상태에는 해당 참가자에게만 회복 메시지를 보냅니다. Gemini를 사용할 수 없을 때도 템플릿 문구로 세션이 계속 진행됩니다.
- 대기실에서 루미에게 목표를 다듬어 달라고 요청하고, 제안을 확인한 뒤 바로 내 목표로 저장할 수 있게 했습니다. Gemini 키가 없을 때의 템플릿 제안도 같은 흐름으로 사용할 수 있습니다.
- 진행 중인 세션에 합류한 참가자도 스터디룸에서 각 참가자의 실제 저장 목표와 서버 세션 기준 남은 시간을 확인할 수 있게 했습니다.
- 이미 종료된 방에 입장하면 대기실에 남지 않고 회고 화면으로 이동하도록 했습니다.
- 협업형 실전 산출물 제작 과제용 `README.md` 템플릿을 추가했습니다.
- 루미(Roomi) 프로젝트 기획안, 구현 명세, IA 구조도, 데이터 구조, API 초안을 루트 `README.md` 에 정리했습니다.
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
- Electron renderer, main/preload 단위 테스트와 E2E 테스트 실행법을 `docs/testing.md` 에 정리했습니다.
- macOS 같은 로컬 GUI 환경에서도 Electron E2E 를 실행할 수 있도록 `test:e2e:local` script 와 문서 안내를 추가했습니다.
- Figma(Roomi) 디자인 기반으로 온보딩 4단계, 방 만들기, 대기실, 스터디룸, 휴식/복귀, 세션 회고까지 9개 화면과 화면 전환 router 를 renderer 에 추가했습니다.
- 스터디룸에서 로컬 웹캠 미리보기와 마이크/카메라 켜기·끄기 컨트롤을 사용할 수 있도록 추가했습니다.
- Electron 기본 메뉴/창 테두리 대신 Roomi 디자인에 맞춘 macOS/Windows 커스텀 title bar 와 창 제어 버튼을 추가했습니다.
- 온보딩 닉네임/방 코드 입력, 카메라·마이크 권한 확인, 로컬 방 생성 설정이 대기실 상태로 이어지도록 연결했습니다.
- Figma 픽셀에서 직접 추출한 색상/타이포/간격을 `styles/tokens.css` 에 design token 으로 정리하고, 공통 `AppBar`·루미 mascot·badge/pill/button 컴포넌트를 추가했습니다.
- 개발 중 화면을 빠르게 오갈 수 있는 상단 dev 화면 전환 nav 를 추가했습니다(디자인에는 포함되지 않는 개발용 UI).
- MediaPipe 테스트 화면에서 웹캠 얼굴 landmark 기반 Rule-Based 집중도 label, 점수, feature 지속 시간을 확인할 수 있게 추가했습니다.

### Changed

- 개인 루미 메시지는 대상 참가자의 Socket.IO 채널과 대상별 스냅샷으로만 전달되도록 변경해, 이후 방 상태 갱신에서도 다른 참가자에게 노출되지 않습니다.
- 대기실에 실제 퇴장을 위한 `방 나가기`를 추가했습니다. 스터디룸의 `나가기`는 대기실 이동만 하고, 이 버튼을 눌러야 참가자 목록에서 제거됩니다.
- 스터디룸의 `나가기`는 방에서 즉시 퇴장시키지 않고 먼저 진행 중 대기실로 돌아가도록 변경했습니다. 참가자는 `합류하기`로 같은 세션에 다시 들어갈 수 있습니다.
- 대기실 오른쪽 패널에서 원래 화면 흐름에 없던 개인 `준비완료` 토글을 제거했습니다. 준비 상태와 관계없이 방장만 세션 시작 버튼을 사용합니다.
- 대기실의 준비 상태를 세션 시작 조건에서 분리했습니다. 이제 다른 참가자가 준비하지 않아도 방장은 언제든 세션을 시작할 수 있습니다.
- 중앙 Roomi API 서버를 LAN/배포 환경에서 띄울 수 있도록 `API_HOST` listen 설정과 comma-separated `CLIENT_ORIGIN` allowlist 를 추가했습니다. REST CORS 와 Socket.IO CORS 는 같은 origin 정책을 공유합니다.
- 다른 PC의 renderer 가 같은 중앙 API 를 바라보도록 `VITE_ROOMI_API_URL` 설정 예시, `/health` 확인 방법, in-memory room store 한계를 `docs/api.md` 와 `docs/architecture.md` 에 정리했습니다.
- KAIST 내부망 같은 restricted network 에서 Cloudflare Tunnel 로 Roomi API 를 외부 공개하는 설정 예시와 client URL 설정을 `docs/api.md` 에 추가했습니다.
- `@roomi/api` 가 실행 cwd 와 무관하게 repository root `.env` 를 먼저 읽고 `services/api/.env` 로 override 할 수 있게 변경해, Daily 서버 키가 package cwd 실행에서 누락되지 않도록 했습니다.
- `CLIENT_ORIGIN` 이 origin 내부 wildcard 를 지원하도록 변경해, `http://192.168.*:5175` 같은 LAN renderer origin 을 REST CORS 와 Socket.IO CORS 에 함께 허용할 수 있게 했습니다.
- Windows 환경에서도 `test:e2e:local` 을 같은 명령으로 실행할 수 있도록 Electron E2E local runner 를 Unix `env -u` 기반 shell command 에서 cross-platform Node runner 로 변경했습니다.
- Windows 환경에서도 `@roomi/desktop` dev script 가 로컬 Electron GUI 를 띄울 수 있도록 Unix `env -u` 기반 실행을 cross-platform Node runner 로 변경했습니다.
- renderer 화면의 1440x900 고정 폭/높이 기준을 제거하고, 창 크기 변경에 따라 주요 페이지가 줄바꿈·재정렬되도록 반응형 레이아웃으로 조정했습니다.
- 앱 최소 창 크기를 사용 가능한 하한선으로 올리고, 세로 공간이 부족한 화면은 콘텐츠 영역 스크롤로 접근하도록 조정했습니다.
- 콘텐츠 스크롤바, 스터디룸 하단 컨트롤 정렬, 회고 화면 상하 여백을 Roomi 화면 톤에 맞게 다듬었습니다.
- 스터디룸의 세션 종료 버튼을 아이콘형 나가기 컨트롤로 바꾸고, 회고 화면 묶음과 스크롤바 형태를 다듬었습니다.
- Electron 창과 renderer favicon 이 기본 React 아이콘 대신 루미 아이콘을 사용하도록 변경했습니다.
- 루미 앱 아이콘 배경을 투명화하고, 개발용 화면 전환 nav 제거, 방장 전용 세션 종료 메뉴/확인 모달, 전역 버튼 press 애니메이션을 추가했습니다.
- 화면 전환 enter animation, 카드 pop, 선택/컨트롤 버튼 press 모션, 메뉴와 모달 pop animation 을 추가했습니다.
- 스터디룸 참가자 타일과 목표/확인 메시지가 입력한 닉네임과 현재 방 참가자 상태를 반영하도록 변경했습니다.
- 방 생성/입장 REST 응답에 현재 클라이언트의 participant id 를 포함하고, renderer 가 서버 room session 과 realtime snapshot 을 구독하도록 연결했습니다.
- 방 생성/입장 API 변경에 맞춰 `docs/api.md` 에 `RoomSession` 응답과 `room:subscribe` realtime 이벤트를 문서화했습니다.
- Daily Client SDK 기반 화상 세션 연결을 추가해 서버가 private Daily room 과 participant token 을 발급하고, renderer 가 기존 스터디룸 타일에 Daily media track 을 렌더링하도록 변경했습니다.
- 방 코드 생성 규칙을 혼동 문자 제외 6자리 영문/숫자로 맞추고, REST 입장 성공 시 기존 구독자에게도 `room:updated` 를 broadcast 하도록 수정했습니다.
- 방 코드 생성 alphabet 에 혼동 문자 `L` 이 남아 있어 표시/입력 normalize 후 5자리로 줄어들 수 있던 문제를 수정했습니다.
- Daily room/token 준비 실패가 Roomi 방 생성 자체를 실패시키지 않도록 조정해, 서버에 없는 로컬 fallback 방 코드가 표시되는 문제를 줄였습니다.
- 스터디룸 나가기 버튼이 Socket.IO `room:leave` 로 현재 participant 를 서버 방 목록에서 제거하고, 남은 참가자에게 `room:updated` 가 broadcast 되도록 수정했습니다.
- 한 컴퓨터에서 Electron 과 브라우저 게스트를 함께 테스트할 수 있도록 로컬 API CORS 허용 origin 을 `localhost`/`127.0.0.1` dev 포트로 확장했습니다.
- Electron dev runner 가 기존 `ELECTRON_RENDERER_URL` 을 제거하고 사용 가능한 renderer 포트를 직접 선택해 로컬 GUI 창이 다른 5175 포트 점유 프로세스에 붙지 않도록 조정했습니다.
- Roomi 중앙 API 서버용 루트 `.env` 와 desktop renderer 용 `apps/desktop/.env` 를 분리해, 클라이언트 PC 에 Daily API key 같은 서버 secret 을 두지 않도록 정리했습니다.
- 앱과 문서, workspace package scope, preload API, realtime message event 의 영문 표기를 `Roomi` / `roomi` 로 통일했습니다.
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
- MediaPipe WASM 초기화를 위해 desktop renderer CSP 에 `wasm-unsafe-eval` 을 허용하고, Rule-Based 기준값을 화면에서 조정할 수 있는 설정 모달을 추가했습니다.

### Notes
### Manual Steps

- 라이브 LLM 메시지를 사용하려면 API 서버의 `services/api/.env`에 `GEMINI_API_KEY`를 설정해야 합니다. 키가 없으면 템플릿 fallback이 자동 적용됩니다.
- `@roomi/*` workspace package scope 로 변경된 뒤에는 `pnpm install` 을 다시 실행해 로컬 workspace link 를 갱신해야 합니다.
- 새 workspace script 를 사용하기 전에 `pnpm install` 을 실행해야 합니다.
- MediaPipe 테스트 화면을 사용하려면 `pnpm install` 로 `@mediapipe/tasks-vision` dependency 를 설치해야 합니다.
- Daily 또는 LLM provider 를 연결하기 전에 `.env.example` 을 `.env` 로 복사하고 필요한 service key 를 채워야 합니다.
