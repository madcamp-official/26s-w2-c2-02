# Changelog

Roomi의 주요 변경 사항은 사용자 영향부터 적고, 내부 구현 세부사항은 그 뒤에 정리합니다.
루트 `README.md`는 안정적인 프로젝트 개요로 유지합니다.

## Unreleased

### Changed

- 스터디룸 화면을 표정 파티 게임 중심 경험으로 전환했습니다. 사용자는 숨은 표정 미션, 점수판, Roomi 진행 메시지, 참가자 비디오 타일을 한 화면에서 확인할 수 있습니다.
- 중앙 API가 일시적으로 응답하지 않는 개발 환경에서도 데스크톱 앱이 로컬 데모 방을 만들어 표정 게임 UI와 로컬 카메라 흐름을 실행할 수 있게 했습니다. 다중 PC 초대, Daily 토큰, Socket.IO 동기화, 서버 권위 점수 계산은 여전히 중앙 API가 필요합니다.
- 공유 타입과 Socket.IO 계약에 `hidden_mission`, `poker_bluff`, `copycat_relay` 게임 상태, 비공개 미션 배정, 표정 결과 보고, 게임 공개 이벤트를 추가했습니다.
- API 서버가 게임 시작, 미션 결과 기록, 블러프 베팅/결과, 릴레이 진행, 공개 시점 점수 계산을 처리하도록 확장했습니다. 공개 전 숨은 미션은 대상 참가자에게만 전달됩니다.
- 데스크톱 렌더러가 MediaPipe blendshape 결과를 표정 신호로 변환하고, 숨은 미션 진행도를 로컬에서 계산한 뒤 서버 또는 로컬 데모 상태에 보고하도록 연결했습니다.
- 데스크톱 스터디룸에 `hidden_mission`, `poker_bluff`, `copycat_relay` 선택 UI와 게임별 기본 조작을 추가했습니다. 방장은 게임 모드를 선택해 시작할 수 있고, 플레이어는 블러프 베팅/표정 판정과 릴레이 진행을 보낼 수 있습니다.
- `docs/api.md`와 `docs/architecture.md`를 표정 파티 게임 이벤트 계약과 중앙 API 장애 시 로컬 개발 fallback에 맞춰 갱신했습니다.

### Fixed

- Secret mission progress now keeps a local camera analysis fallback when Daily has not exposed the local video track yet, so mission counts can advance during live rooms.

### Manual Steps

- 없음.
