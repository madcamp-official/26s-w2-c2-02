# 루미와 함께하는 표정 파티 게임 기획

> 상태: 기획 초안 · 브랜치: `feature/face-party-games`
> 관련 문서: [`architecture.md`](./architecture.md), [`api.md`](./api.md), 루트 `README.md` 「아키텍처」
> 관련 코드: [`focus-pipeline.ts`](../apps/desktop/src/renderer/src/focus-pipeline.ts), [`use-focus-detection.ts`](../apps/desktop/src/renderer/src/use-focus-detection.ts), [`roomi-orchestrator.ts`](../services/api/src/roomi/roomi-orchestrator.ts)

친구 2~4명이 같은 방에서 **실시간 화상으로 서로 얼굴을 보며** 하는 표정 게임 3종을,
**AI 진행자 루미**가 사회를 보는 파티 앱으로 재기획한다. 스터디룸에서 검증된
인프라(방/코드 입장, 4인 화상, Socket.IO 상태 동기화, 루미 오케스트레이터, 로컬 얼굴 분석,
집중 시간 랭킹)를 **거의 그대로 재활용**하는 것이 핵심 전략이다.

## 왜 이 방향인가 (설계 원칙)

1. **확실한 신호만 규칙으로 삼는다.** 감정 추정·거짓말 탐지 같은 "그럴듯하지만 안 맞는"
   신호는 배제하고, MediaPipe가 안정적으로 잡는 것만 게임 규칙에 쓴다.
   - 미소(`mouthSmile`), 입 벌림(`jawOpen`), **좌/우 독립 윙크(`eyeBlinkLeft`/`eyeBlinkRight`)**,
     눈썹 올림(`browInnerUp`/`browOuterUp`), 볼 부풀림(`cheekPuff`), 입 오므림(`mouthPucker`),
     고개 자세(yaw/pitch/roll).
2. **루미가 없으면 성립 안 되는 게임을 우선한다.** 단순 중계·코멘트가 아니라 루미의
   **① 무한 콘텐츠 생성 ② 비밀 정보 관리(비밀지기·심판) ③ 실시간 내레이션 ④ 방 기억·적응**
   중 최소 2개를 필수로 쓰는 게임만 채택.
3. **프라이버시 원칙 유지.** 스터디룸과 동일하게 **영상 원본과 원본 랜드마크(468점)는
   서버로 보내지 않는다.** 로컬에서 표정 신호/이벤트로 요약한 값만 전송한다.
   ([focus-pipeline.ts](../apps/desktop/src/renderer/src/focus-pipeline.ts)의 `FeatureWindowV1` 방식 계승)

## 현황 요약 (근거)

- **이미 있는 것 (재활용 대상)**
  - 방 생성/입장/조회 REST, 초대 코드, 4인 제한 — `services/api/src/rooms/`, `server.ts`
  - Socket.IO 게이트웨이(구독·상태 broadcast·서버 기준 타이머 동기화) — `services/api/src/realtime/gateway.ts`
  - 루미 오케스트레이터(현재 에코 스텁, LLM 연결 지점) — `services/api/src/roomi/roomi-orchestrator.ts`
  - 로컬 얼굴 분석 파이프라인(랜드마크 → 순수 함수 신호) — `focus-pipeline.ts` + `use-focus-detection.ts`
  - **blendshape가 이미 켜져 있음**: [use-focus-detection.ts:339](../apps/desktop/src/renderer/src/use-focus-detection.ts#L339) `outputFaceBlendshapes: true` — 값을 **소비만 안 할 뿐** 표정 엔진의 절반은 완성 상태
  - 4인 화상 타일, 집중 시간 기준 랭킹 UI/로직
- **새로 필요한 것**
  - `expression-pipeline.ts`: blendshape → 표정 신호(미소/윙크/입벌림/눈썹…) 순수 함수 + 임계값
  - 게임 상태 머신: `GameSession` / `GameRound` / 라운드 채점 (서버가 라운드·타이밍 권위)
  - 루미의 게임별 콘텐츠 생성 프롬프트(질문/미션/시드 표정) + 진행 멘트
  - 게임용 Socket.IO 이벤트 계약
  - 게임별 화면(진행 UI, 베팅/추리 입력, 결과·회고)

## 채택 게임 3종

### A. 루미의 히든 미션 (Hidden Face Mission) — 1순위

**한 줄:** 루미가 각자에게 **몰래** 표정 미션을 주고, 자유 대화(잡담) 중 남몰래 수행 →
라운드 끝에 루미가 판정·공개, 서로 누구 미션이었는지 추리.

- **루미의 역할(대체 불가):** 비밀 미션을 **혼자 알고 있다가 심판까지** 봄(②) + 미션 생성(①) + 공개 내레이션(③).
- **확실한 신호:** 윙크 횟수, 미소 발생 횟수, "입 절대 안 벌리기" 유지, 눈썹 올림 횟수 — 전부 카운트/유지 기반이라 **오탐 내성 최고**.
- **미션 예시(루미 생성):** "몰래 윙크 3번", "누가 웃으면 3초 안에 따라 웃기", "이번 판 절대 입 벌리지 않기", "눈썹 5번 올리기".
- **판정:** 각 클라이언트가 자기 표정 이벤트를 **로컬 카운트** → 카운트·성공여부만 서버 전송. 루미가 취합해 성공/실패 + 추리 정답 공개.
- **인프라 재활용:** 소셜 추리 = 4인 화상 + Socket.IO. 미션 배정은 참가자별 비공개 payload.
- **점수:** 미션 성공 + 남의 미션 맞히기.

### B. 표정 진실게임 (Poker-Face Bluff) — 2순위

**한 줄:** 루미가 짓궂은 질문을 하고, 지목된 사람은 **포커페이스로 답변**. 나머지는
"답하다 무너질까(웃음/입벌림/눈썹 튐)"에 베팅. 루미가 "텔"을 판정.

- **루미의 역할(대체 불가):** 질문 무한 생성(①) + "텔" 실시간 내레이션·판정(③) + 방 기억으로 저격 질문(④).
- **확실한 신호:** 답변 구간(예: 8초) 동안 `mouthSmile`/`jawOpen`/`browOuterUp`가 임계값 이상 **튀는(spike)** 순간 = 무너짐.
- **판정 원칙:** 루미는 "거짓말 탐지"라고 **단정하지 않는다.** "어 방금 입꼬리 올라갔는데?" 식 **뉘앙스/힌트**로만 표현해 오탐이 게임을 안 깨게 한다.
- **점수:** 지목자는 포커페이스 유지 시 획득, 베터는 예측 적중 시 획득.
- **인프라 재활용:** 질문 생성 = 루미 오케스트레이터, 베팅 입력 = socket 이벤트, 랭킹 재활용.

### C. 표정 카피캣 릴레이 (Expression Copycat Relay) — 3순위(가장 신선, 난이도 높음)

**한 줄:** 릴레이(텔레폰) 게임의 표정판. 1번이 시드 표정을 재현 → 2번은 **1번만 보고**
따라 함 → 3번은 2번만 보고… 마지막에 시드와 얼마나 뒤틀렸는지 비교.

- **루미의 역할:** 시드 표정/테마 생성(①, 예: "졸린 고양이", "놀란 사장님") + 왜곡 결과를 코믹하게 중계·채점(③).
- **확실한 신호:** 연속 두 사람의 **blendshape 벡터 코사인 유사도**로 전달 정확도 측정.
- **핵심 난제 — 시야 통제:** 화상 방은 원래 전원이 서로 보인다. 릴레이는 "**다음 사람에게 현재 사람만 보이게**" 순차 노출이 필요 → Daily 타일 가시성 제어 또는 전용 릴레이 화면 필요. (아래 「열린 결정」 참고)
- **유사도 계산 위치:** blendshape 벡터(52개 실수)는 영상이 아니므로 프라이버시 위험이 낮아 **비교를 위해 서버 전송 허용 가능**(원본 랜드마크는 여전히 미전송). 로컬 계산 후 유사도 점수만 보내는 방식도 가능 — 3-2단계에서 확정.

## 공통 엔진 설계

```
[카메라] → MediaPipe FaceLandmarker (blendshape 이미 on)
   → expression-pipeline.ts (순수 함수: blendshape → ExpressionSignals, 임계값)
   → 게임별 판정기 (히든미션=카운트 / 진실게임=spike / 카피캣=유사도)
   → 로컬 요약(이벤트/점수/유사도)만 서버 전송 (영상·원본 랜드마크 미전송)
        |
   Socket.IO 게임 이벤트  ←→  서버(라운드·타이밍 권위)  ←→  루미 오케스트레이터(LLM)
```

- `expression-pipeline.ts`는 `focus-pipeline.ts`와 동일한 규율을 따른다: **랜드마크/blendshape in, 신호 out, 순수 함수** → 튜닝 화면에서 맞춘 임계값이 실제 게임에 그대로 적용.
- 서버는 스터디룸 타이머(`timer:sync`)처럼 **라운드 시작/종료 기준 시간**을 잡아 전원 동기화.
- 루미 멘트는 기존 `RoomiMessage` 계약을 확장해 게임 이벤트 타입 추가.

## 데이터/계약 스케치 (확정 전 초안)

```ts
type GameKind = 'hidden_mission' | 'poker_bluff' | 'copycat_relay';

type GameSession = {
  id: string;
  roomId: string;
  kind: GameKind;
  status: 'lobby' | 'in_round' | 'reveal' | 'ended';
  round: number;
  startedAt: string;
};

type ExpressionSignals = {           // expression-pipeline 출력
  timestamp: number;
  smile: number;                     // 0~1
  jawOpen: number;
  winkLeft: boolean;
  winkRight: boolean;
  browRaise: number;
  cheekPuff: number;
  headYaw: number; headPitch: number; headRoll: number;
};

// 히든 미션: 비공개 배정 + 로컬 카운트 결과만 서버로
type HiddenMission = { playerId: string; prompt: string; verify: 'wink_count' | 'smile_count' | 'no_jaw_open' | 'brow_count'; target: number };
type MissionResult  = { playerId: string; count: number; success: boolean };

// 진실게임: 답변 구간 텔 판정
type BluffResult = { targetId: string; cracked: boolean; tell: 'smile' | 'jaw' | 'brow' | null; heldMs: number };

// 카피캣: 연속 유사도
type RelayLink = { fromId: string; toId: string; similarity: number };
```

- 신규 Socket.IO 이벤트(초안): `game:start`, `game:round-begin`, `mission:assign`(비공개), `expression:report`, `bluff:bet`, `relay:advance`, `game:reveal`.
- 루미 메시지 `eventType` 확장: `game_intro` | `round_prompt` | `tell_hint` | `game_reveal` | `game_summary`.

## 실행 계획

각 단계: 행동 / 이유 / 위험 / 검증.

### 1. 표정 엔진 (`expression-pipeline.ts`)
- **행동:** blendshape → `ExpressionSignals` 순수 함수 + 임계값(`defaultExpressionSettings`) 작성. 미소/윙크/입벌림/눈썹/볼/고개자세. `use-focus-detection`이 이미 뽑는 blendshape를 소비하도록 연결.
- **이유:** 세 게임의 공통 기반. 순수 함수라 단위 테스트로 빠르게 안정화.
- **위험:** 조명/개인차로 임계값 편차 → 상수 대신 조정 가능한 설정 객체로.
- **검증:** vitest 단위 테스트(합성 blendshape 입력 → 신호 기대값). 기존 튜닝 화면 재활용해 실측.

### 2. 게임 프레임워크
- **행동:** shared 타입에 `GameSession`/`GameRound` 추가, 서버 라운드 상태 머신 + Socket.IO 이벤트, 라운드 타이밍 권위.
- **이유:** 세 게임이 공유하는 진행 골격 먼저 고정.
- **위험:** 스터디룸 세션 상태와 개념 충돌 → 게임 세션을 별도 엔티티로 분리.
- **검증:** 게이트웨이 테스트(라운드 begin/reveal broadcast, 중복 방지).

### 3. 루미 콘텐츠 생성
- **행동:** 오케스트레이터에 게임별 프롬프트(미션/질문/시드 표정) + 진행 멘트. LLM 실패 시 템플릿 fallback(기존 정책 계승).
- **이유:** 루미가 게임의 색깔. 무한 콘텐츠가 재플레이성의 핵심.
- **위험:** 부적절/반복 미션 → 금지 목록 + 다양성 시드.
- **검증:** 오케스트레이터 단위 테스트(스텁 LLM), 수동 플레이.

### 4. 게임 A — 히든 미션 (**첫 목표**)
- **이유:** 판정이 카운트 기반이라 가장 견고, 루미 강점(비밀지기)이 가장 선명, 인프라 재활용 최대.
- **검증:** 미션 배정 비공개성, 카운트 판정 정확도, 추리·공개 플로우 E2E(수동 2~4인).

### 5. 게임 B — 진실게임
- **검증:** spike 판정 안정성, 베팅 동기화, 루미 "힌트" 톤이 단정적이지 않은지.

### 6. 게임 C — 카피캣 릴레이
- **행동:** 시야 통제(순차 노출) 방식 확정 후 유사도 채점.
- **위험:** 화상 타일 가시성 제어가 Daily 제약에 걸릴 수 있음 → 전용 릴레이 화면으로 우회.
- **검증:** 유사도 단조성(같은 표정↑, 다른 표정↓), 릴레이 순서 동기화.

### 7. 점수·회고
- **행동:** 게임별 점수 → 기존 랭킹 UI 재활용, 루미의 라운드/세션 회고 멘트.
- **검증:** 점수 집계 정확도, 회고 생성.

## 열린 결정 (사용자 확인 필요)

1. **스터디룸과의 관계** — 게임으로 **완전 전환**할지, 스터디룸과 **공존(모드 선택)**할지.
   권장: 인프라 공유 + 홈에서 "공부 모드 / 놀기 모드" 선택으로 **공존**, MVP는 게임에 집중.
2. **카피캣 시야 통제** — Daily 타일 가시성 제어 vs 전용 릴레이 화면(현재 사람만 크게).
   권장: 리스크 낮은 **전용 릴레이 화면**.
3. **카피캣 유사도 계산 위치** — 로컬 계산 후 점수만 전송 vs blendshape 벡터 서버 전송.
   권장: 프라이버시 보수적으로 **로컬 계산 후 유사도만 전송**.
4. **빌드 순서** — 문서는 견고성·재활용 기준 A→B→C 권장(사용자 선호 순서 진실게임·카피캣·히든미션과 다름).

## 문서 동기화 필요 (완료 시)

- 방향 확정 후 루트 `README.md` 「산출물 주제/아키텍처」와 `docs/architecture.md`, `docs/api.md` 갱신.
- 게임 이벤트/타입 확정 시 `packages/shared` 및 `CHANGELOG.md` 반영.
