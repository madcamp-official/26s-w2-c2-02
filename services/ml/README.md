# Roomi ML 서버 (로컬 LLM) — 계획 문서

> 상태: 초안. `services/ml` 코드는 아직 없음. 이 문서는 구현 전 방향 정리용이며, 확정되는 대로 실제 서비스 구조에 맞춰 갱신한다.

## 목적

현재 `services/api`는 `GeminiClient` (`services/api/src/roomi/gemini-client.ts`)를 통해 Google Gemini API로 텍스트를 생성한다. 이 문서는 Gemini API 대신, 공용 ML 서버에서 서빙하는 로컬(자체 호스팅) LLM을 붙이는 계획을 정리한다.

동기는 아래 중 하나 이상 (최종 우선순위는 팀 확인 필요):

- 외부 API 비용/쿼터 의존 제거
- 네트워크 불안정 환경(발표/데모)에서 안정성 확보
- 응답 데이터를 외부로 보내지 않는 데이터 프라이버시

## 아키텍처

```
apps/desktop (renderer)
      │ Socket.IO / REST
      ▼
services/api (Node/Express)
      │ HTTP (LLM_ENDPOINT)
      ▼
공용 ML 서버 (services/ml 또는 별도 호스트)
      │ 서빙 런타임 (Ollama / vLLM 등, 아래 참고)
      ▼
로컬/자체 호스팅 LLM 모델
```

핵심 전제: `services/api`는 seam 하나(`TextGenerator.generateText(prompt)`, `services/api/src/roomi/roomi-orchestrator.ts`)만 바라본다. `GeminiClient`와 동일한 인터페이스를 구현하는 `LocalLlmClient`를 추가하면, orchestrator나 호출부는 변경할 필요 없음.

ML 서버는 팀원 개인 PC가 아니라 **공용 서버 1대**에서 서빙한다는 전제로 정리한다. `services/api`는 `localhost`가 아니라 해당 서버의 endpoint를 호출한다.

## 서빙 스택 (미확정 — ML 서버 GPU 스펙 확인 필요)

| 스택 | 적합 상황 | 비고 |
|---|---|---|
| **Ollama** | 단일 서버, 낮은~중간 동시 요청, 빠른 설치 | REST API 기본 제공, GGUF quantized 모델 pull만 하면 됨. 가장 실용적인 기본 선택지 |
| **vLLM / TGI** | GPU 서버, 여러 참가자 동시 호출 시 처리량 필요 | 배치 처리, PagedAttention 등으로 동시 요청에 강함. 서버 GPU/VRAM 스펙 확정 후 재검토 |

우선 Ollama로 시작하고, 데모 중 동시 접속(최대 4명 방)에서 지연 문제가 확인되면 vLLM 전환을 검토한다.

## 모델 후보 (미확정 — 실측 필요)

기존 `gemma-3-27b-it` (Gemini API 경유) 대응:

- `gemma3:4b` / `gemma3:12b`
- `qwen2.5:7b`
- `llama3.1:8b`

선택 기준: 한국어 반말 톤(루미 캐릭터) 품질, 응답 속도, ML 서버 메모리/VRAM 한도. 후보별로 `roomi-orchestrator.ts`의 실제 프롬프트(목표 다듬기, 시작 멘트, 집중 회복 메시지)로 테스트해 결정한다.

## 통합 지점

- 신규 파일: `services/api/src/roomi/local-llm-client.ts`
  - `GeminiClient`와 동일하게 `TextGenerator` 구현
  - `AbortController` 기반 timeout 유지 (기존 `DEFAULT_TIMEOUT_MS = 8000` 패턴 참고)
  - 실패 시 예외를 던져 orchestrator의 template fallback으로 자연스럽게 이어지게 함 (신규 fallback 로직 추가하지 않음)
- provider 스위치: 환경 변수로 Gemini/local 중 선택
  - `LLM_PROVIDER=gemini|local`
  - `LOCAL_LLM_ENDPOINT` (예: `http://<ml-server-host>:11434/api/generate`)
  - `LOCAL_LLM_MODEL`
- 조립 지점: `services/api/src/index.ts`에서 `LLM_PROVIDER` 값에 따라 `GeminiClient` 또는 `LocalLlmClient` 중 하나를 `RoomiOrchestrator`에 주입

## API 계약

`services/api` ↔ ML 서버 사이 계약은 `TextGenerator`와 동일하게 단순 유지: prompt 문자열을 보내고 텍스트 문자열을 받는다. Ollama 사용 시 `/api/generate` 응답의 스트리밍 여부(`stream: false`로 고정), 필드 매핑은 `LocalLlmClient` 내부에서만 처리하고 orchestrator에는 노출하지 않는다.

## 실패 처리

기존 `GeminiClient` 패턴을 그대로 따른다: ML 서버 다운/timeout/네트워크 오류 시 예외를 던지고, `RoomiOrchestrator`가 이미 가진 템플릿 fallback으로 세션 진행이 끊기지 않게 한다. 로컬 LLM이라고 별도의 재시도/큐잉 로직을 새로 만들지 않는다.

## 테스트

`services/api/src/roomi/gemini-client.test.ts` 패턴을 따라 `local-llm-client.test.ts` 작성: 성공 응답 파싱, timeout, 빈 응답, HTTP 에러 케이스.

## 마일스톤

1. ML 서버 GPU/VRAM 스펙 확인, Ollama 또는 vLLM 중 서빙 스택 확정
2. 후보 모델 pull 후 루미 프롬프트로 수동 품질/속도 확인
3. `LocalLlmClient` 구현 + 단위 테스트
4. `LLM_PROVIDER` 환경 변수 스위치를 `index.ts`에 연결
5. Gemini 대비 응답 시간/품질 실측 비교
6. `docs/ai_workflows.md`, 필요 시 `docs/architecture.md`, `docs/api.md`에 반영 여부 확인 (`AGENTS.md` 문서 동기화 규칙)

## Open Questions

- [ ] ML 서버 GPU/VRAM 스펙 → Ollama vs vLLM 결정
- [ ] 모델 최종 선택 (한국어 톤 품질 실측 후)
- [ ] ML 서버 접근 방식: 팀 내부망 직접 접속인지, 외부 노출(Cloudflare Tunnel 등, `docs/api.md`의 기존 사례 참고) 필요한지
- [ ] 서버 다운 시 Gemini로 자동 fallback할지, 아니면 template fallback만으로 충분한지
