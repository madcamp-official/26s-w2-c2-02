# Ollama + Gemma 3 설치·테스트 가이드

> 이 문서는 Roomi 코드베이스 접근 없이도 그대로 따라 할 수 있는 독립 가이드다. ML 서버에 Ollama를 설치하고 Gemma 3 모델을 받아 API로 테스트하는 절차만 다룬다.

## 대상 서버 (확인된 스펙)

| 항목 | 값 |
|---|---|
| OS | Ubuntu 22.04.2 LTS (camp-9) |
| CPU | Intel Xeon Cascadelake, 40 vCPU |
| RAM | 49GB (27GB free) |
| 디스크 | 97GB 중 75GB 여유 |
| GPU | NVIDIA RTX 3090 24GB 장착되어 있으나 **드라이버 미설치 상태로 진행** (설치 안 함, CPU로만 서빙) |
| Docker | 없음 (필요 없음, Ollama는 Docker 없이 네이티브 설치) |
| 외부 접근 | SSH 접속 후 8081 포트 열면 `https://api.llm.madcamp-kaist.org` 로 터널링됨 |

GPU 드라이버 설치 없이 CPU(40 vCPU, RAM 49GB)로만 서빙한다. 이 조건에서는 `gemma3:4b`가 현실적인 기본 선택지. 더 큰 모델(`12b` 이상)은 CPU에서 응답이 눈에 띄게 느려지므로, 데모 응답 지연 요구사항을 감안해 4b로 먼저 검증하고 필요하면 나중에 검토한다.

## 1. Ollama 설치

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

설치 후 확인:

```bash
ollama --version
```

기본 설치 시 `systemd` 서비스(`ollama.service`)로 등록되어 자동 실행됨 — 별도로 `ollama serve`를 안 띄워도 된다. GPU 드라이버가 없으므로 자동으로 CPU 모드로 동작한다.

## 2. 포트를 8081로 맞추기 (터널링된 포트에 맞춤)

기본은 `127.0.0.1:11434`인데, 이미 8081로 터널링해뒀으므로 Ollama가 8081에서 듣도록 바꾼다.

```bash
sudo systemctl edit ollama
```

에디터가 열리면 아래 내용 추가:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:8081"
```

저장 후 재시작:

```bash
sudo systemctl restart ollama
sudo systemctl status ollama
```

`active (running)` 확인. 이제 `https://api.llm.madcamp-kaist.org`로 Ollama API에 바로 접근 가능.

## 3. Gemma 3 모델 받기

```bash
ollama pull gemma3:4b
```

시간 여유 있고 속도 비교해보고 싶으면 추가로:

```bash
ollama pull gemma3:12b
```

CPU라 `12b`는 체감상 확실히 느릴 수 있음 — 참고용으로만 받고, 실제 기준은 `4b` 결과로 잡는다.

받은 모델 목록 확인:

```bash
ollama list
```

## 4. CLI로 빠른 확인

```bash
ollama run gemma3:4b "안녕, 너는 누구야?"
```

정상이면 터미널에 바로 답변 텍스트가 출력된다. 이 단계에서 한국어 응답 품질을 눈으로 먼저 확인.

## 5. HTTP API로 테스트 (실제 연동 방식과 동일한 방식)

서버 안에서 로컬로 확인:

```bash
curl http://localhost:8081/api/generate -d '{
  "model": "gemma3:4b",
  "prompt": "너는 스터디룸 운영자 루미야. 참가자에게 집중 세션 시작을 짧게 반말로 안내해줘.",
  "stream": false
}'
```

터널링된 도메인으로 외부에서 확인 (팀원 아무 PC에서나 실행 가능):

```bash
curl https://api.llm.madcamp-kaist.org/api/generate -d '{
  "model": "gemma3:4b",
  "prompt": "너는 스터디룸 운영자 루미야. 참가자에게 집중 세션 시작을 짧게 반말로 안내해줘.",
  "stream": false
}'
```

응답 예시 (필드만 참고, 값은 실제 실행 결과로 대체됨):

```json
{
  "model": "gemma3:4b",
  "response": "좋아, 지금부터 집중 시작이야. 딴짓 말고 목표 하나에만 집중해보자.",
  "done": true,
  "total_duration": 1234567890,
  "eval_count": 42,
  "eval_duration": 987654321
}
```

확인할 것:
- `response` 필드에 실제로 의미 있는 한국어 문장이 오는가
- `total_duration` (나노초 단위) — 전체 응답까지 걸린 시간, 밀리초로 환산해 기록
- 여러 번 반복 호출했을 때 속도 편차
- 로컬(`localhost:8081`)과 외부 도메인 응답이 같은지, 터널 경유 시 지연이 크게 늘어나는지

## 6. 기록해서 공유할 항목

아래 표를 채워서 팀에 공유하면 이후 연동 결정(모델 최종 선택, timeout 값 설정)에 바로 쓸 수 있다.

| 항목 | 값 |
|---|---|
| 테스트한 모델 태그 (예: `gemma3:4b`) | |
| 응답 시간 (평균, 초 단위, 로컬/터널 각각) | |
| 한국어 응답 품질 (주관 평가: 자연스러움, 반말 톤 유지 여부) | |
| 서버 CPU/메모리 사용량 (`ollama ps` 또는 시스템 모니터) | |
| 동시에 2개 이상 요청 보냈을 때 문제 없는지 | |

동시 요청 테스트는 터미널 2개에서 거의 동시에 curl 실행. 현재 로드된 모델과 리소스 사용량은:

```bash
ollama ps
```

## 다음 단계 (참고용, 이 서버에서 직접 할 필요 없음)

이 테스트 결과가 나오면, API 서버(Node.js) 쪽에서 `https://api.llm.madcamp-kaist.org/api/generate`를 호출하는 클라이언트를 붙이는 작업은 별도로 진행한다. 지금 단계에서는 위 curl 테스트가 잘 되는지만 확인하면 된다.
