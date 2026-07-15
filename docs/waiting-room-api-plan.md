# 대기실(Waiting Room) API 범위 계획

> 상태: 7단계 완료 · 8단계 문서 동기화 완료, 실제 Electron E2E는 실행 환경 제약으로 보류 · 브랜치: `page/waitingroom`
> 관련 문서: [`api.md`](./api.md) (구현 후 동기화), README 「API / 외부 서비스 연동」 표

대기실 IA 5요소(참가자 목록 / 준비 상태 / 개인 목표 입력 / 루미 다듬기 / 세션 시작)에
**늦은 입장 처리**를 더한 API 범위 계획이다.

## 현황 요약 (근거)

- **이미 있는 것**
  - 방 생성/입장/조회 REST — `services/api/src/server.ts`
  - Socket.IO 게이트웨이 `room:join` / `participant:update-status` broadcast — `services/api/src/realtime/gateway.ts`
  - `Goal`·`RoomiMessage` 타입 — `packages/shared/src/types.ts`
- **비어 있는 것**
  - `WaitingRoom.tsx`는 참가자·목표·준비상태가 전부 하드코딩 (백엔드 연결 0)
  - 준비 상태(ready) 모델 없음 — `ParticipantStatus`는 집중용 enum(`online/focused/...`)뿐
  - 목표 등록/수정 엔드포인트 없음
  - 목표 다듬기 LLM 없음 — `RoomiOrchestrator`는 `[kind] text` 에코 스텁
  - 세션 시작 엔드포인트 없음, shared 타입에 `StudySession` 부재(README에만 존재)
  - **버그 위험**: `joinRoom`이 REST와 socket 양쪽에서 참가자를 push → 중복 입장 가능

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 준비 상태 모델 | `Participant.isReady: boolean` 별도 플래그 (집중용 `status`와 분리) |
| 세션 시작 채널 | `POST /sessions` + `session:start` socket broadcast |
| 이중 join 버그 | **REST 전용 입장 + socket 구독**으로 단일화 (`page/studyroom`에서 수렴). 1단계에서 죽은 socket `room:join` 경로 제거로 마무리 ✅ |
| 늦은 입장 라우팅 | 대기실을 **거쳐서**(목표 입력 위해) 진행 중 모드로 → 합류 |
| 늦은 참가자 목표 | 진행 중에도 목표 입력 허용 |

## 대기실 2모드 분기

대기실 화면은 `room.status`에 따라 두 모드로 렌더된다. 늦은 참가자도 대기실에서 목표를 정한 뒤 합류한다.

| | 모드 1 · 시작 전 (`waiting`) | 모드 2 · 진행 중 (`studying`/`break`) |
|---|---|---|
| 참가자 패널 | 준비 현황 (`2/4 준비완료`) | `진행 중` 배지 + `이미 공부 중이에요` |
| 목표 입력 | 있음 | 있음 (진행 중에도 허용) |
| 루미 다듬기 | 있음 | 있음 |
| CTA 버튼 | host만 `세션 시작하기` / member는 `방장 대기 중` 문구 | 전원 `합류하기` (기존 세션 무중단 진입) |
| 진입 후 | 새 세션 시작 | 진행 중 `currentSession`·타이머 스냅샷과 합류 |

- `ended` 방 입장은 회고/닫힘 화면으로 라우팅(별도 케이스).

## 실행 계획

각 단계: 행동 / 이유 / 위험 / 검증.

### 1. 발견 + join 단일화 ✅ (완료)
- **행동**: `page/studyroom` 머지로 입장은 이미 **REST 전용**(`POST /rooms/join` 단일 push), socket은 `room:subscribe` 구독으로 수렴. 남은 죽은 경로였던 socket `room:join` 핸들러를 제거하고 shared 계약(`ClientToServerEvents`)에서도 삭제.
- **이유**: 이중 join 버그 위에 준비상태·세션시작을 얹으면 오염. join이 화상 토큰까지 발급하므로 REST가 더 자연스러움(계획의 "socket 단일화"에서 방향 전환).
- **위험**: 계약 변경이 클라이언트를 깨뜨림 → 워크스페이스 typecheck로 desktop이 해당 이벤트를 안 쓰는 것 확인.
- **검증**: socket으로 `room:join` 쏴도 참가자 중복 없음 (`services/api/src/realtime/gateway.test.ts`, vitest 통과). typecheck 전체 통과.

### 2. shared 타입·이벤트 확장
- **행동**: `Participant.isReady: boolean`, `StudySession` 타입, `RoomSnapshot.currentSession?` 추가. realtime 이벤트 `participant:ready`·`goal:submit`·`session:start` 추가. **join 응답에 `room.status` + `currentSession` 항상 포함(모드 분기 계약 고정)**.
- **이유**: 타입 계약을 먼저 잡으면 서버/클라 양쪽이 컴파일 에러로 빠르게 피드백.
- **위험**: `maxParticipants: 4` 등 리터럴 타입과 기존 default-settings 충돌.
- **검증**: `pnpm --filter @roomi/shared build` 통과.

### 3. 준비 상태 API ✅ (완료)
- **행동**: socket `participant:ready`(명시적 `isReady` 목표 상태 — 토글 대신 멱등) → `RoomService.setReady()` → `onRoomUpdated`가 `room:updated` broadcast.
- **이유**: 대기실의 참가자 준비 표시용 신호. 현재 desktop UI에서는 원래 화면 흐름에 없는 별도 준비 토글을 노출하지 않으며, 세션 시작 권한·조건과도 분리한다. 방장은 다른 참가자의 준비 여부와 관계없이 시작할 수 있다.
- **위험**: 집중용 `status`와 대기용 `isReady` 혼용 시 스터디룸 단계 의미 충돌 → 별도 필드로 분리(2단계).
- **검증**: `RoomService.setReady` 단위 테스트(set/clear/broadcast/미존재 방) + gateway 통합 테스트로 **2개 소켓 구독 상태에서 ready 변경이 양쪽에 broadcast** 되는 것 확인. vitest 8건 통과.

### 4. 목표 등록/수정 API ✅ (완료)
- **행동**: `POST /rooms/:roomId/goals`(participant 기준 upsert, `rawText`) → snapshot broadcast. socket `goal:submit`도 동일 `RoomService.submitGoal()` 호출. `room.status`가 `waiting`이 아니어도 허용(진행 중 목표 입력). 참가자 미존재 시 404.
- **이유**: 개인 목표가 있어야 다듬기·세션시작이 성립. 늦은 참가자도 목표 입력 필요.
- **위험**: 같은 participant 다중 goal → 목록 중복. participantId 기준 upsert로 방지(재제출 시 `refinedText` 무효화).
- **검증**: 같은 참가자 2회 제출 시 goal 1건 유지 — `submitGoal` 단위 테스트(생성/upsert/참가자별 분리/broadcast/studying 허용/미존재 방·참가자) + REST(`server.test.ts`) + gateway `goal:submit` 통합. vitest 19건 통과.

### 5. 루미 목표 다듬기 API (LLM) ✅ (완료)
- **행동**: `POST /goals/refine`(`rawGoal`, `sessionMinutes`) → `RoomiOrchestrator.refineGoal()`가 `{ refinedText, reason, source }` 반환. **Gemini(`gemini-2.5-flash`) 호출 실패·무키 시 템플릿 fallback**. 원본 rawGoal은 서버에만(응답에 미포함).
- **아키텍처**: `GeminiClient`(raw fetch, 외부 경계 1곳: `GEMINI_API_KEY`·모델·타임아웃) → `RoomiOrchestrator`(seam: kind별 프롬프트+fallback, `TextGenerator` 주입). `.env`에 `GEMINI_API_KEY`만 넣으면 라이브, 없으면 템플릿 자동. 나머지 kind(start/focus/break/summary)는 같은 client·패턴 재사용.
- **[갱신 2026-07] LLM 프로바이더 변경**: 이후 작업에서 Gemini가 Ollama로 교체됨 — 현재 `services/api/src/roomi/ollama-client.ts`가 `OLLAMA_BASE_URL`/`OLLAMA_MODEL`/`OLLAMA_TIMEOUT_MS`로 동작하며 `GeminiClient`/`GEMINI_API_KEY`는 코드에 존재하지 않는다. 최신 계약은 [`api.md`](./api.md) Environment 절 참고. 이 절의 나머지 서술(아키텍처 seam, fallback 동작)은 Gemini→Ollama 교체 후에도 구조적으로 유효하다.
- **위험**: LLM 키/네트워크 실패로 흐름 블록 → try/catch 동기 fallback으로 항상 200.
- **검증**: orchestrator 단위 3건(gemini/throw→template/무generator→template) + GeminiClient fetch-mock 3건(무키 throw/파싱/비정상응답) + REST 2건(무LLM 200 template / generator 주입 시 gemini). vitest 27건 통과. 키 없는 상태에서도 200 + 템플릿 확인.

### 6. 세션 시작 API ✅ (완료)
- **행동**: `POST /sessions`(host 권한 검증, `room.status === 'waiting'`일 때만 허용, 아니면 409, `StudySession` 생성) → `room.status='studying'`+`currentSession` 세팅 → **기존 `room:updated`로 전원 전환**.
- **설계 결정**: 별도 `session:start` 이벤트를 만들지 않고 `room:updated` 재사용(스냅샷에 `currentSession`+`studying`이 실려 나가 단일 소스). 클라(7단계)는 status 변화로 스터디룸 전환.
- **위험**: host 아닌 참가자 시작 → 서버에서 강제(클라 버튼 신뢰 금지). 준비 상태는 시작 조건이 아니며, 중복 클릭·늦은 참가자의 두 번째 세션 생성은 `waiting` 가드(409)로 차단.
- **검증**: `startSession` 단위 5건(host 성공/broadcast/비host 403 사유/이미 시작 409 사유/미존재 방) + REST 4건(200·403·409·404). vitest 36건 통과.

### 7. 대기실 2모드 분기 (프론트) ✅
- **행동**: `WaitingRoom.tsx` 하드코딩 제거 → props 주도. `room.status`로 시작 전/진행 중 2모드 렌더, host/member CTA 분기, 실제 `isReady` 기반 준비 현황, 목표 입력. 원래 화면 흐름에 없는 desktop 준비완료 토글은 노출하지 않고, **host 시작 시 member는 `room:updated`(studying)로 자동 전환**, 늦은 합류는 진행 중 모드 `합류하기`.
- **검증(완료)**: WaitingRoom 컴포넌트 테스트 5건(ready 수·host 시작·member 시작버튼 없음·진행 중 모드 합류·목표 저장) + App 테스트 갱신(member 자동 전환, ready 0/4). desktop 15건 통과.
- **마무리**: `ended` 스냅샷은 대기실 진입 대신 회고 화면으로 라우팅한다. 스터디룸은 participant별 저장 목표와 `currentSession.startedAt`·`plannedMinutes` 기반 남은 시간을 표시한다. 대기실은 `POST /goals/refine` 제안을 표시하고, 수락 시 기존 goal upsert 경로로 저장한다.
- **검증(추가)**: 종료 방 라우팅 App 테스트, 목표 다듬기 요청·수락 컴포넌트 테스트, 서버 시작 시각 기반 타이머 단위 테스트를 추가한다.

### 8. 문서 sync + e2e (마무리) 🔶
- **행동**: `docs/api.md`·README API표·`packages/shared`·`CHANGELOG.md` 동기화(AGENTS.md 규칙).
- **이유**: 문서-코드 drift 방지는 저장소 필수 규칙.
- **위험**: 문서만/코드만 갱신 → 명세 drift 재발.
- **문서 sync(완료)**: `docs/api.md` renderer 동작 계약과 `CHANGELOG.md` 사용자 영향 항목을 갱신했다. 루트 README는 저장소 규칙에 따라 이번 UI/API 연결 변경으로 수정하지 않았다.
- **검증**: `pnpm -r typecheck` 및 desktop Vitest 19건 통과. `pnpm --filter @roomi/desktop test:e2e:local`은 production build 완료 뒤 현재 환경에서 Electron이 `SIGABRT`로 종료되어 창 검증 전 실패했다. GUI가 가능한 로컬 환경에서 정상 시작·늦은 입장 시나리오를 각각 완주해야 한다.

## 착수 순서 근거

1(버그 정리) → 2(타입 계약)을 먼저 깔고, 3~6은 서로 독립이라 순차/병렬 가능, 7(화면 분기) → 8(문서·검증)로 마감.
