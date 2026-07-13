# 대기실(Waiting Room) API 범위 계획

> 상태: 계획(미착수) · 브랜치: `page/waitingroom`
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
- **이유**: 대기실 핵심 인터랙션이자 "모두 준비되면 시작" 기준.
- **위험**: 집중용 `status`와 대기용 `isReady` 혼용 시 스터디룸 단계 의미 충돌 → 별도 필드로 분리(2단계).
- **검증**: `RoomService.setReady` 단위 테스트(set/clear/broadcast/미존재 방) + gateway 통합 테스트로 **2개 소켓 구독 상태에서 ready 변경이 양쪽에 broadcast** 되는 것 확인. vitest 8건 통과.

### 4. 목표 등록/수정 API
- **행동**: `POST /rooms/:roomId/goals`(participant 기준 upsert, `rawText`) → snapshot broadcast. socket `goal:submit`도 동일 서비스 호출. **`room.status`가 `waiting`이 아니어도 허용**(진행 중 목표 입력).
- **이유**: 개인 목표가 있어야 다듬기·세션시작이 성립. 늦은 참가자도 목표 입력 필요.
- **위험**: 같은 participant 다중 goal → 목록 중복. participantId 기준 upsert로 방지.
- **검증**: 같은 참가자 2회 제출 시 goal 1건 유지.

### 5. 루미 목표 다듬기 API (LLM)
- **행동**: `POST /goals/refine`(`rawGoal`, `sessionMinutes`) → `RoomiOrchestrator` 통해 `refinedText`+사유 반환, **LLM 실패 시 템플릿 fallback**. 원본은 서버에만.
- **이유**: 대기실의 AI 운영자 가치 제안 핵심.
- **위험**: LLM 키/네트워크 실패로 흐름 블록 → 반드시 동기 fallback.
- **검증**: 키 없는 상태에서도 200 + 템플릿 문구 반환.

### 6. 세션 시작 API
- **행동**: `POST /sessions`(host 권한 검증, `room.status === 'waiting'`일 때만 허용, 아니면 409, `StudySession` 생성) → `session:start` broadcast로 전원 스터디룸 전환.
- **이유**: 대기실의 종료 지점이자 스터디룸 게이트. 늦은 참가자·중복 클릭의 두 번째 세션 생성 차단.
- **위험**: host 아닌 참가자 시작 / 준비 미완료 시작 → 서버에서 강제(클라 버튼 신뢰 금지).
- **검증**: member 호출 시 403, 이미 `studying`이면 409, host는 전환 broadcast.

### 7. 대기실 2모드 분기 (프론트)
- **행동**: `WaitingRoom.tsx` 하드코딩 제거 → snapshot 구독. `room.status`로 시작 전/진행 중 모드 렌더, host/member CTA 분기, 늦은 합류 라우팅(`currentSession`·타이머 스냅샷 동반).
- **이유**: API가 실제 화면에서 굴러가야 완료. 늦은 입장 UX 구현 지점.
- **위험**: `ended` 방 진입 등 예외 status 미처리.
- **검증**: `studying` 방 3번째 입장 → 진행 중 모드(합류하기·목표 입력 가능), 기존 세션 무중단. 합류 후 목표가 스터디룸에 반영. member 화면에 시작 버튼 없음.

### 8. 문서 sync + e2e (마무리)
- **행동**: `docs/api.md`·README API표·`packages/shared`·`CHANGELOG.md` 동기화(AGENTS.md 규칙).
- **이유**: 문서-코드 drift 방지는 저장소 필수 규칙.
- **위험**: 문서만/코드만 갱신 → 명세 drift 재발.
- **검증**: `pnpm -r typecheck` + 정상 시작 시나리오와 늦은 입장 시나리오 각 1회 e2e 완주.

## 착수 순서 근거

1(버그 정리) → 2(타입 계약)을 먼저 깔고, 3~6은 서로 독립이라 순차/병렬 가능, 7(화면 분기) → 8(문서·검증)로 마감.
