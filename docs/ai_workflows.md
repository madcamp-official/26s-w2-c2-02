# AI Workflows

이 문서는 사람 팀원, Codex 사용자, Claude Code 사용자가 함께 참고하는 공용 workflow 요약입니다.

## 역할 분담

- `AGENTS.md`: 저장소 공통 규칙, 검증 기대치, 문서 동기화 원칙
- `CLAUDE.md`: Claude Code 전용 보충 안내
- `.codex/`: Codex 전용 project-local config 와 hook
- `.agents/skills/`: Codex 전용 shared skill
- `docs/ai_workflows.md`: 도구를 가리지 않고 이해 가능한 공용 workflow 설명

## 공통 운영 원칙

- unfamiliar code 를 수정하기 전 `AGENTS.md`, `README.md` 를 먼저 읽습니다.
- 기능 변경, 인터페이스 변경, 운영 기대치 변경이 있으면 관련 문서를 함께 갱신합니다.
- 가능하면 가장 관련성 높은 테스트나 lint 를 실행합니다.
- 검증을 못 했으면 이유를 명시합니다.
- 공통 규칙은 한곳에만 둡니다. 공통 규칙은 `AGENTS.md`, 도구 전용 규칙은 각 전용 파일에 둡니다.

## Workflow 요약

### repo-onboarding

- 목적: 프로젝트 구조, 실행법, 테스트 진입점, 배포 주의사항을 빠르게 파악
- Codex 구현: `.agents/skills/repo-onboarding`
- 사람용 해석: 새 디렉터리에서 바로 수정하지 말고 구조와 실행/테스트 진입점을 먼저 찾습니다.

### bug-investigation

- 목적: 재현 가능한 디버깅 루프를 먼저 확보하고 원인 후보를 줄이기
- Codex 구현: `.agents/skills/bug-investigation`
- 사람용 해석: 수정부터 하지 말고 재현, 로그, 관련 seam, 회귀 테스트 순으로 좁혀갑니다.

### tdd-loop

- 목적: red -> green -> refactor 를 작은 단위로 반복
- Codex 구현: `.agents/skills/tdd-loop`
- 사람용 해석: 실패하는 테스트를 먼저 만들고, 최소 수정으로 통과시킨 뒤 작은 리팩터링만 합니다.

### pr-review

- 목적: 버그, 회귀, 누락 테스트, 운영 리스크 중심 리뷰
- Codex 구현: `.agents/skills/pr-review`
- 사람용 해석: 스타일보다 correctness 와 risk 를 먼저 봅니다.

### release-check

- 목적: 배포 전 검증, 환경변수, 마이그레이션, 문서 업데이트 확인
- Codex 구현: `.agents/skills/release-check`
- 사람용 해석: shipping 전에 테스트, 설정, 데이터, 운영 영향, 문서를 한 번 더 봅니다.

### safe-refactor

- 목적: 동작은 유지하면서 변경 범위를 좁게 가져가는 리팩터링
- Codex 구현: `.agents/skills/safe-refactor`
- 사람용 해석: 기능 추가와 리팩터링을 섞지 말고, 작은 체크포인트와 검증을 유지합니다.

### codebase-design-vocabulary

- 목적: seam, interface, module boundary 언어를 통일
- Codex 구현: `.agents/skills/codebase-design-vocabulary`
- 사람용 해석: 설계 논의를 할 때 같은 단어를 같은 의미로 씁니다.

### create-plan

- 목적: 애매한 작업을 실행 가능한 단계로 정리
- Codex 구현: `.agents/skills/create-plan`
- 사람용 해석: 바로 구현하기 전에 위험과 검증 포인트가 보이는 짧은 계획을 만듭니다.

### grill-me

- 목적: 계획이나 설계의 허점을 공격적으로 드러내기
- Codex 구현: `.agents/skills/grill-me`
- 사람용 해석: 실패 시나리오, 롤백, 운영 제약, 빠진 테스트를 일부러 찔러봅니다.

### changelog-generator

- 목적: 사용자 영향 중심으로 변경 내역을 정리
- Codex 구현: `.agents/skills/changelog-generator`
- 사람용 해석: 내부 구현보다 실제로 무엇이 달라졌는지부터 씁니다.

## Codex-specific automation

현재 Codex 에는 다음 project-local hook 이 있습니다.

- `SessionStart`: 저장소 문서와 skill 존재를 바탕으로 초기 컨텍스트 보강
- `PreToolUse` for `Bash`: 위험 명령, production 추정 대상, secret 노출 가능 명령, 위험한 git network 명령 차단
- `PreToolUse` for edits: `main`/`master` 에서 중요한 파일을 수정하기 전 topic branch 사용을 안내하고, `CODEX_AUTO_BRANCH=1` 이 설정된 clean worktree 에서는 로컬 topic branch 를 만들 수 있음
- `PostToolUse` for `Bash`: 실패한 검증 명령과 후속 확인이 필요한 명령에 대한 경고
- `PostToolUse` for edits: 큰 삭제나 문서/검증 누락 가능성 경고
- `Stop`: 변경 파일, 테스트 상태, 남은 리스크를 최종 답변에서 언급하도록 유도하고, clean-start session 에서 `CODEX_AUTO_COMMIT=1` 이 설정된 경우에만 중요한 변경을 자동 커밋할 수 있음

이 자동화는 Codex 전용입니다. Claude Code 사용자는 같은 개념을 수동 체크리스트로 따라가면 됩니다.

## Branch-first 작업

- 목적: 중요한 변경이 기본 브랜치에 바로 쌓이지 않도록 로컬 체크포인트를 분리하기
- 기본 원칙: `main` 또는 `master` 에서 큰 변경을 시작하기 전 topic branch 생성을 제안합니다.
- 자동화 opt-in: `CODEX_AUTO_BRANCH=1` 이 설정되어 있고 worktree 가 clean 하면 중요한 편집 전 로컬 topic branch 를 만들 수 있습니다.
- 자동 생성 대상 예시: `.codex/`, `.agents/`, `docs/`, `AGENTS.md`, `README.md`, `CLAUDE.md`, `KPT.md`
- 건너뛰는 경우: worktree 가 dirty 한 경우, 이미 topic branch 인 경우, 사용자가 기본 브랜치 작업을 명시한 경우

## 중요 변경 자동 커밋

- 목적: 중요한 변경이 생겼을 때 사람이 커밋 타이밍을 놓쳐도 체크포인트를 남기기
- 동작 시점: Codex `Stop` hook 실행 시점
- opt-in: `CODEX_AUTO_COMMIT=1` 환경변수가 설정된 경우에만 자동 커밋 허용
- 안전장치: 세션 시작 시 worktree 가 clean 했던 경우에만 자동 커밋 가능
- 건너뛰는 경우: 세션 시작 전부터 미커밋 변경이 있었던 경우
- 중요 변경 판단 기준:
  - 변경 파일이 2개 이상인 경우
  - staged 와 unstaged 변경의 추가/삭제 라인 합이 대략 25줄 이상인 경우
  - `.codex/`, `docs/`, `AGENTS.md`, `README.md`, `CLAUDE.md` 중 하나가 바뀐 경우
- 자동 커밋 메시지 예시:
  - `chore: auto-commit workflow updates`
  - `docs: auto-commit documentation updates`
  - `chore: auto-commit important changes`

## Push/Pull 승인 흐름

- `git push` 와 `git pull` 은 자동 실행하지 않습니다.
- 원격보다 앞서거나 뒤처진 상태는 먼저 감지하고 사용자에게 제안합니다.
- 사용자가 승인한 뒤에만 실행합니다.
- `git pull` 은 `--ff-only` 를 기본으로 사용하고, `--ff-only` 없는 pull 은 hook 에서 차단합니다.
- `git push --force`, `git push --force-with-lease`, `git push --mirror`, `git push --delete` 는 hook 에서 차단합니다.
- 인증 토큰, 비밀번호, private key 는 채팅에 공유하지 않습니다.

## TDD 와 검증 실패 처리

- 일반적인 test, lint, typecheck, format 실패는 즉시 확인하고 수정하거나 남은 위험으로 명시합니다.
- `tdd`, `red`, `failing`, `regression` 같은 의도가 명령에 드러난 실패는 red 단계일 수 있으므로 즉시 block 하지 않고, 최종 응답 전 green 전환 또는 잔여 실패 보고를 요구합니다.
- 실패한 검증을 그대로 두고 작업을 끝내지 않습니다.

## 문서 업데이트 규칙

다음 중 하나가 바뀌면 문서 동기화를 확인합니다.

- 저장소 공통 규칙
- 실행 또는 테스트 방법
- agent workflow 의 목적이나 사용 시점
- Codex 전용 hook 또는 skill 구성
- Claude 와 Codex 의 역할 분담 방식
