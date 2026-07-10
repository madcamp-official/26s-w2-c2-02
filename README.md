# 루미(Room-AI)

친구들과 함께 켜두는 AI 운영 스터디룸입니다. 루미는 단순 화상회의가 아니라 공부방의 목표 설정, 집중 세션, 휴식, 복귀, 회고를 친구 같은 말투로 진행해주는 데스크톱 앱을 목표로 합니다.

## 공통과제 II : 협업형 실전 산출물 제작

**목적:** 실시간으로 함께 공부하는 친구들의 스터디룸을 AI 운영자가 부드럽게 진행해주는 데스크톱 앱을 제작합니다. 목표 설정, 집중 세션, 휴식, 복귀, 회고까지 이어지는 하나의 공부 흐름을 만드는 것이 핵심입니다.

**선택 옵션:** 실시간 인터랙션과 LLM Wrapper를 필수 방향으로 선택합니다. Cross-Platform은 장기 확장 방향으로 두며, MVP는 데스크톱 앱에 집중합니다.

| 옵션 | 루미에서의 적용 |
|---|---|
| 실시간 인터랙션 | 방 생성, 초대 코드, 참가자 입장, 타이머, 목표, 공부/휴식 상태, 루미 메시지가 같은 방 안에서 실시간으로 동기화됩니다. |
| LLM Wrapper | LLM이 AI 운영자 역할을 맡아 목표를 세션 단위로 다듬고, 집중 회복/휴식 복귀/종료 회고 메시지를 생성합니다. |
| Cross-Platform | MVP는 데스크톱 앱으로 구현하되, Electron + React 기반으로 추후 웹/데스크톱 공통 코드베이스 확장을 고려합니다. |

**결과물:** 2인 이상, 최대 4명이 같은 방에 접속해 영상, 목표, 타이머, 상태, AI 메시지를 공유하며 한 번의 스터디 세션을 시작부터 회고까지 완료할 수 있는 MVP.

## 팀원

| 이름 | 학교 | GitHub | 역할 |
|---|---|---|---|
| 박채훈 | DGIST | chek737 | 실시간 서버, LLM 운영자, API 설계 |
| 박소요 | 숙명여대 | oyossss | 데스크톱 UI, 세션 플로우, 카메라 집중 감지 |

## 선택 옵션

- [x] 실시간 인터랙션
- [x] LLM Wrapper
- [ ] Cross-Platform

## 기획안

- **산출물 주제:** 루미(Room-AI) - 친구들과 함께 켜두는 AI 운영 스터디룸
- **제작 목적:** Zoom, Discord, Google Meet처럼 단순히 함께 켜두는 도구가 아니라, 공부방의 흐름을 AI가 운영해 목표 설정, 집중 유지, 휴식 복귀, 회고를 자연스럽게 돕는 앱을 만듭니다.
- **MVP 인증 방식:** 별도 계정 없이 닉네임 + 방 코드로 입장합니다.
- **최대 방 인원:** 4명
- **화상 인프라:** Daily 기반 화상 스터디룸
- **루미 말투:** 반말에 가까운 친구 톤
- **점수 공개:** 기본값은 공개이며, 각 사용자가 개인 점수를 숨길 수 있습니다.
- **랭킹 기준:** 집중 시간 기준 랭킹을 기본으로 합니다.

### 핵심 구현 요소

- 방 생성/입장, 초대 코드, 참가자 상태, 타이머, 목표의 실시간 동기화
- Daily 기반 최대 4명 화상 스터디룸
- LLM 기반 AI 운영자: 목표 다듬기, 집중 회복 메시지, 휴식 복귀 안내, 세션 회고 요약
- 로컬 카메라 기반 집중 상태 추정: 얼굴 없음, 자리 이탈, 눈 감김, 고개 방향/숙임 등
- 개인 확인 메시지와 오탐 보정: 감지 결과를 바로 공개하지 않고 사용자에게 먼저 확인
- 개인 요약, 방 전체 요약, 집중 시간 기준 랭킹 제공
- 추후 계정 기반 사용자/히스토리 관리로 확장

### 사용 / 시연 시나리오

1. 사용자가 데스크톱 앱을 실행하고 닉네임을 입력합니다.
2. 한 명은 방을 만들고, 다른 참가자는 닉네임과 초대 코드로 입장합니다.
3. 방장은 세션 시간, 휴식 방식, 점수 공개 기본값을 설정합니다.
4. 참가자들은 각자 이번 세션 목표를 입력합니다.
5. 루미가 목표를 한 세션 안에 확인 가능한 단위로 다듬어줍니다.
6. 공부 시작 버튼을 누르면 타이머와 참가자 상태가 실시간으로 동기화됩니다.
7. 집중 흐트러짐이 1분 이상 감지되면 본인에게만 확인 메시지가 뜹니다.
8. 휴식 시간이 되면 루미가 복귀 안내를 하고, 세션 종료 후 개인/방 전체 회고를 제공합니다.

### 개발 일정

| 날짜 | 목표 |
|---|---|
| Day 1 | 요구사항 확정, 화면 흐름 설계, 기술 스택 결정, 프로젝트 초기 세팅(Electron + React + TypeScript, 서버 기본 구조) |
| Day 2 | 방 생성/입장, 초대 코드, 참가자 목록, Socket.IO 기반 상태 동기화 구현 |
| Day 3 | 세션 목표 입력, 타이머, 공부/휴식/종료 상태 전환, 방 설정 플로우 구현 |
| Day 4 | 화상 스터디룸 연결(Daily), 영상 타일 UI, 마이크/카메라 기본 제어 구현 |
| Day 5 | LLM 운영자 연결: 목표 다듬기, 시작 멘트, 집중 회복, 휴식 복귀, 회고 요약 API 구현 |
| Day 6 | MediaPipe 기반 로컬 집중 상태 추정, 확인 메시지, OS 알림/앱 내부 메시지, 오탐 피드백 저장 구현 |
| Day 7 | 개인/방 전체 요약, 지표/랭킹, 시연 시나리오 점검, 버그 수정, 발표 자료/README 정리 |

## 구현 명세서

| 구현 요소 | 설명 | 우선순위 |
|---|---|---|
| 방 생성/입장 | 방장은 방을 만들고 초대 코드를 발급합니다. 참가자는 닉네임과 초대 코드로 방에 입장합니다. | 필수 |
| 실시간 상태 동기화 | 참가자 목록, 온라인/집중중/쉬는중/자리비움 상태, 목표, 타이머, 루미 메시지를 Socket.IO로 동기화합니다. | 필수 |
| 세션 운영 플로우 | 목표 입력, 목표 다듬기, 공부 시작, 휴식, 복귀, 종료 회고까지 한 세션을 완주할 수 있게 합니다. | 필수 |
| 화상 스터디룸 | Daily를 사용해 최대 4명의 참가자 영상 타일을 표시합니다. 직접 WebRTC 구현은 MVP에서 제외합니다. | 필수 |
| LLM 운영자 | 서버에서 LLM API를 호출해 목표 다듬기, 회복 메시지, 복귀 안내, 세션 요약을 생성합니다. 실패 시 템플릿 문구로 대체합니다. | 필수 |
| 로컬 집중 감지 | MediaPipe로 얼굴 없음, 눈 감김, 고개 돌림, 고개 숙임을 추정합니다. 영상 원본은 서버에 보내지 않습니다. | 필수 |
| 확인 메시지/오탐 보정 | 1분 이상 흐트러짐이 감지되면 본인에게만 확인 메시지를 띄우고, 응답을 상태 보정 데이터로 저장합니다. | 필수 |
| 요약과 지표 | 개인 목표 달성 여부, 집중 시간, 흐트러짐 확인 횟수, 방 전체 집중 온도, 목표 달성률, 복귀율을 보여줍니다. | 선택 |
| 랭킹 | 집중 시간 기준 랭킹을 기본으로 표시합니다. 구체적인 이탈 사유는 공개하지 않고, 점수 숨김을 선택한 사용자의 개인 점수는 방 전체에 노출하지 않습니다. | 선택 |

## 아키텍처

```text
Electron Desktop App
  - React UI
  - Camera / OS Notification
  - MediaPipe local focus detection
  - Socket.IO client
  - Daily video client
        |
        | HTTPS / WebSocket
        v
Backend API Server
  - Room/session API
  - Socket.IO realtime gateway
  - LLM orchestrator
  - Video token issuer
  - Summary/event aggregator
        |
        v
Database
  - users/nicknames
  - rooms
  - participants
  - study sessions
  - goals
  - status events
  - feedback events
  - summaries

External Services
  - LLM API
  - Daily
```

- 클라이언트는 카메라 영상을 로컬에서 분석하고, 서버에는 `focused`, `away`, `break`, `paused` 같은 상태 신호만 보냅니다.
- 서버는 방의 기준 시간과 이벤트 순서를 관리해 모든 참가자에게 같은 타이머와 상태를 전달합니다.
- LLM API 키는 클라이언트에 두지 않고 서버에서만 사용합니다.
- 영상 인프라는 Daily로 확정하고, 서버는 Daily 방 생성/참가 토큰 발급과 방 입장에 필요한 값만 담당합니다.
- MVP는 계정 없이 닉네임 + 방 코드로 입장하고, 추후 계정 기반 사용자/히스토리 관리로 확장합니다.

### 실시간 인터랙션 구성

Daily는 영상/음성 인프라를 담당하고, Socket.IO는 방 상태와 세션 상태를 관리하는 실시간 control plane으로 둡니다.

| 영역 | 담당 기술 | 설명 |
|---|---|---|
| 영상/음성 | Daily | 최대 4명 화상 스터디룸, 미디어 권한, 참가자 영상 타일 |
| 방 상태 | Socket.IO | 방 입장/퇴장, 참가자 상태, 목표, 루미 메시지 broadcast |
| 세션 기준 시간 | Backend + Socket.IO | 서버 시간을 기준으로 타이머와 공부/휴식/종료 상태 동기화 |
| 영속 데이터 | Database | 방, 목표, 상태 이벤트, 피드백, 요약 저장 |
| 가벼운 통화 중 신호 | Daily app message(선택) | 저장/복구가 필요 없는 임시 UI 신호에만 제한적으로 사용 |

## 설계 문서

### 화면 / 인터페이스 설계

#### IA 구조도

```text
루미(Room-AI)
├─ 온보딩
│  ├─ 닉네임 입력
│  ├─ 방 만들기
│  ├─ 방 코드로 입장
│  └─ 카메라/마이크 권한 확인
├─ 방 생성 / 설정
│  ├─ 세션 시간 설정
│  ├─ 휴식 방식 설정
│  │  ├─ 방 전체 휴식
│  │  └─ 개인 자율 휴식
│  ├─ 점수 공개 기본값 설정
│  ├─ 개인별 점수 숨김 허용
│  ├─ 최대 인원 4명 안내
│  └─ 초대 코드 복사
├─ 대기실
│  ├─ 참가자 목록
│  ├─ 참가자 준비 상태
│  ├─ 개인 목표 입력
│  ├─ 루미 목표 다듬기 제안
│  └─ 세션 시작
├─ 스터디룸
│  ├─ 영상 영역
│  │  ├─ 최대 4명 영상 타일
│  │  └─ 카메라/마이크 제어
│  ├─ 세션 타이머
│  ├─ 참가자 상태
│  ├─ 목표 목록
│  ├─ 루미 운영자 패널
│  ├─ 개인 확인 메시지
│  └─ 감지 일시정지
├─ 휴식 / 복귀
│  ├─ 휴식 타이머
│  ├─ 방 전체 휴식 안내
│  ├─ 개인 자율 휴식 안내
│  └─ 루미 복귀 메시지
└─ 세션 종료 / 회고
   ├─ 개인 요약
   ├─ 방 전체 요약
   ├─ 집중 시간 랭킹
   ├─ 목표 달성 체크
   └─ 다음 세션 액션
```

#### 화면별 핵심 인터랙션

| 화면 | 핵심 목적 | 주요 인터랙션 | 다음 상태 |
|---|---|---|---|
| 온보딩 | 계정 없이 빠르게 방에 들어갈 준비를 합니다. | 닉네임 입력, 방 만들기, 방 코드 입력, 카메라/마이크 권한 확인 | 방 생성 설정 또는 대기실 |
| 방 생성 / 설정 | 스터디룸 운영 규칙을 정합니다. | 세션 시간, 휴식 방식, 점수 공개 기본값 설정, 초대 코드 복사 | 대기실 |
| 대기실 | 참가자와 목표가 준비된 상태인지 확인합니다. | 참가자 준비 상태 확인, 목표 입력, 루미 목표 다듬기, 세션 시작 | 스터디룸 |
| 스터디룸 | 공부 세션을 실시간으로 진행합니다. | 영상 확인, 타이머 확인, 상태 공유, 루미 메시지 확인, 감지 일시정지, 개인 확인 메시지 응답 | 휴식 / 복귀 또는 세션 종료 |
| 휴식 / 복귀 | 휴식 시간을 관리하고 다시 집중 상태로 돌아옵니다. | 휴식 타이머 확인, 루미 복귀 메시지 확인, 공부 재개 | 스터디룸 또는 세션 종료 |
| 세션 종료 / 회고 | 세션 결과를 확인하고 다음 액션을 정합니다. | 개인 요약 확인, 방 전체 요약 확인, 집중 시간 랭킹 확인, 목표 달성 체크, 다음 세션 액션 입력 | 대기실 또는 종료 |

#### 화면 흐름도

추후 그림으로 제작해 첨부합니다.

### 데이터 구조

추후 E-R 다이어그램을 추가합니다.

```ts
type User = {
  id: string;
  nickname: string;
  createdAt: string;
};

type Room = {
  id: string;
  inviteCode: string;
  hostUserId: string;
  settings: RoomSettings;
  status: 'waiting' | 'studying' | 'break' | 'ended';
  createdAt: string;
};

type RoomSettings = {
  sessionMinutes: number;
  breakMode: 'room' | 'individual';
  defaultScoreVisibility: 'public' | 'private';
  maxParticipants: 4;
  authMode: 'nickname_code';
  videoProvider: 'daily';
  lumiTone: 'friendly_casual';
  rankingMetric: 'focus_minutes';
  videoRequired: boolean;
  detectionPauseAllowed: boolean;
};

type Participant = {
  id: string;
  roomId: string;
  userId: string;
  role: 'host' | 'member';
  status: 'online' | 'focused' | 'distracted' | 'away' | 'break' | 'paused';
  scoreVisible: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

type FutureAccount = {
  id: string;
  userId: string;
  email?: string;
  provider?: 'google' | 'github' | 'email';
  createdAt: string;
};

type StudySession = {
  id: string;
  roomId: string;
  startedAt: string;
  endedAt?: string;
  plannedMinutes: number;
  mode: 'study' | 'break' | 'ended';
};

type Goal = {
  id: string;
  sessionId: string;
  userId: string;
  rawText: string;
  refinedText: string;
  status: 'draft' | 'accepted' | 'done' | 'carried_over';
  createdAt: string;
};

type FocusEvent = {
  id: string;
  sessionId: string;
  userId: string;
  type: 'face_missing' | 'eyes_closed' | 'head_turned' | 'head_down' | 'away' | 'manual_pause';
  inferredStatus: 'focused' | 'distracted' | 'away' | 'sleepy' | 'paused';
  confidence: number;
  startedAt: string;
  endedAt?: string;
};

type UserFeedback = {
  id: string;
  focusEventId: string;
  userId: string;
  answer: 'studying' | 'distracted' | 'break' | 'pause_detection';
  createdAt: string;
};

type LumiMessage = {
  id: string;
  roomId: string;
  sessionId?: string;
  target: 'room' | 'user';
  targetUserId?: string;
  eventType: 'goal_refine' | 'session_start' | 'focus_recovery' | 'break_return' | 'session_summary';
  content: string;
  createdAt: string;
};

type SessionSummary = {
  id: string;
  sessionId: string;
  userId?: string;
  scope: 'personal' | 'room';
  focusMinutes: number;
  goalCompletionRate: number;
  returnRate?: number;
  feedbackCorrectionCount?: number;
  summaryText: string;
  createdAt: string;
};
```

### API / 외부 서비스 연동

| Method / 방식 | Endpoint / 서비스 | 설명 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| POST | `/api/rooms` | 방 생성 | `nickname`, `roomSettings` | `roomId`, `inviteCode`, `participant` | 방장은 host로 등록. `maxParticipants`는 4명 |
| POST | `/api/rooms/join` | 초대 코드로 방 입장 | `inviteCode`, `nickname` | `room`, `participant`, `videoToken` | 계정 없이 닉네임 + 방 코드 사용. 4명 초과 입장 제한 |
| GET | `/api/rooms/:roomId` | 방 정보 조회 | `roomId` | `room`, `participants`, `currentSession` | 새로고침/재접속용 |
| POST | `/api/sessions` | 공부 세션 시작 | `roomId`, `plannedMinutes`, `goals` | `sessionId`, `startedAt` | 방장 권한 필요 |
| PATCH | `/api/sessions/:sessionId/mode` | 공부/휴식/종료 상태 전환 | `mode` | `session` | Socket.IO로 broadcast |
| POST | `/api/goals/refine` | LLM 목표 다듬기 | `rawGoal`, `sessionMinutes` | `refinedGoal`, `reason` | LLM 실패 시 템플릿 반환 |
| POST | `/api/focus-events` | 로컬 감지 결과 저장 | `sessionId`, `type`, `inferredStatus`, `confidence`, `duration` | `focusEventId`, `shouldPrompt` | 영상 원본은 전송하지 않음 |
| POST | `/api/focus-events/:id/feedback` | 사용자 확인 응답 저장 | `answer` | `updatedStatus` | 오탐 보정 데이터 |
| POST | `/api/lumi/messages` | 루미 메시지 생성 | `eventType`, `roomId`, `sessionId`, `targetUserId` | `message` | LLM API 서버 호출 |
| GET | `/api/sessions/:sessionId/summary` | 개인/방 전체 요약 조회 | `sessionId` | `personalSummary`, `roomSummary` | 종료 화면에서 사용 |
| Socket.IO | `room:join` | 실시간 방 참가 | `roomId`, `participantId` | `roomState` | 참가자별 socket room 연결 |
| Socket.IO | `participant:status` | 참가자 상태 변경 | `participantId`, `status` | `broadcast participant:update` | 집중/휴식/자리비움 동기화 |
| Socket.IO | `timer:sync` | 세션 타이머 동기화 | `sessionId`, `startedAt`, `mode` | `broadcast timer:update` | 서버 시간을 기준으로 계산 |
| 외부 API | LLM API | 운영자 문구 생성 | event context, tone, user/room state | message text | 키는 서버 환경변수로 관리 |
| 외부 API | Daily | 화상방/참가 토큰 발급 | `roomId`, `participantId` | `dailyRoomUrl`, `token` | MVP 화상 인프라로 확정 |

## 산출물 및 실행 방법

- **산출물 설명:** 루미 데스크톱 MVP. 친구 2명 이상, 최대 4명이 같은 방에서 영상으로 함께 공부하고, AI 운영자가 목표 설정/집중 회복/휴식 복귀/회고를 돕습니다.
- **실행 환경:** Node.js 20+, Electron, React, TypeScript, Socket.IO 서버, SQLite 또는 PostgreSQL, Daily 계정, LLM API 키
- **실행 방법:** 실제 앱 코드와 실행 진입점 확정 후 갱신합니다.
- **시연 영상 / 이미지:** 구현 후 앱 실행 화면, 방 입장 화면, 스터디룸 화면, 회고 화면 캡처 또는 짧은 시연 영상을 첨부합니다.

### 실행 방법

```bash
# server
cd server
npm install
npm run dev

# desktop app
cd app
npm install
npm run dev
```

### 기술 구성

| 분류 | 사용 기술 |
|---|---|
| 핵심 기술 | Electron, React, TypeScript, Socket.IO, MediaPipe |
| 실행 환경 | Node.js 20+, macOS/Windows 데스크톱 앱 |
| 데이터 저장 | MVP: SQLite, 확장 시 PostgreSQL |
| 외부 API / 서비스 | LLM API, Daily |
| 기타 | OS Notification, WebRTC 기반 영상, 서버 환경변수 관리 |

## 회고 문서

### Keep - 잘 된 점, 다음에도 유지할 것

-
-
-

### Problem - 아쉬웠던 점, 개선이 필요한 것

-
-
-

### Try - 다음번에 시도해볼 것

-
-
-

### 팀원별 소감

**박채훈:**

>

**박소요:**

>

## 참고 자료

### 제품/서비스 참고

- [Flow Club](https://www.flow.club/): 사람 호스트 기반 가상 코워킹 서비스
- [Focusmate](https://www.focusmate.com/): 1:1 또는 소규모 온라인 작업 매칭 서비스
- [StudyStream](https://www.studystream.live/): 대규모 온라인 화상 독서실
- [Fomi 관련 Wired 기사](https://www.wired.com/story/fomi-ai-will-tell-you-to-stop-slacking-off/): AI 기반 개인 생산성 감시/피드백 사례
- [Focus+ 논문](https://arxiv.org/abs/2210.04400): 웹캠 기반 산만함 감지 연구

### 핵심 기술 참고

- [MediaPipe](https://developers.google.com/mediapipe): 로컬 카메라 분석 후보 기술
- [Daily](https://www.daily.co/): MVP 화상 통화 인프라
- [Socket.IO](https://socket.io/docs/v4/): 방 상태와 세션 상태 실시간 동기화 후보
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API): 실시간 양방향 통신 기반 개념
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events): 서버 단방향 스트리밍 대안
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API): 브라우저 기반 실시간 미디어/데이터 통신 개념
- [gRPC Core Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/): 스트리밍 RPC 참고
- [WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API): QUIC 기반 실시간 전송 참고

### LLM Wrapper 참고

- https://github.com/teddylee777/openai-api-kr
- https://github.com/teddylee777/langchain-kr

### 배포/네트워크 환경 참고

| 환경 | 사용 가능(권장) 기술 | 포트/조건 | 주의할 기술 |
|---|---|---|---|
| 로컬 / 일반 VM | HTTP/REST, WebSocket, Socket.IO, SSE, TCP Socket, gRPC Streaming, WebRTC, QUIC/WebTransport 등 대부분 가능 | 직접 포트 개방 가능. 예: 3000, 5000, 8000, 8080, 9000 등. 외부 공개 시 방화벽/보안그룹/공인 IP 설정 필요 | WebRTC는 STUN/TURN 필요 가능. QUIC/WebTransport는 HTTP/3, UDP 지원 필요 |
| KCLOUD VM (VPN 내부) | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | 접속 기기 VPN 필요. 기본 허용 포트: 22, 80, 443. 개발 포트(3000, 8000, 8080 등)는 직접 접근 제한 가능 | TCP Socket은 포트 제한 있음. gRPC는 HTTP/2 설정 필요. WebRTC 미디어, UDP, QUIC/WebTransport 비권장 |
| KCLOUD VM + Tunnel | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | VM의 `localhost:<port>`를 도메인에 연결. `localPort`는 1024~65535. 예: 3000, 8000, 8080 가능 | 순수 TCP Socket, UDP, WebRTC 미디어/DataChannel, QUIC/WebTransport 불가. gRPC 보장 어려움 |
| 외부 서비스 + 우리 도메인 | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | Vercel/Netlify/Railway/Render/AWS/GCP 등에 배포 후 CNAME/A 레코드 연결. 보통 외부는 443 사용 | WebSocket/gRPC/TCP/UDP는 플랫폼 지원 여부 확인 필요. 서버리스 플랫폼은 장시간 연결 제한 가능 |
| 서버 없이 외부 SaaS 사용 | Supabase Realtime, Firebase, Pusher/Ably, LLM API Streaming | 직접 포트 관리 불필요. 각 서비스 SDK/API 사용 | 커스텀 TCP/UDP 서버 구현 불가. WebRTC는 STUN/TURN 필요 가능 |
