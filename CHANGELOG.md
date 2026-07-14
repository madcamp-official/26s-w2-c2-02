# Changelog

이 파일은 Roomi의 주요 변경 사항을 impact 먼저, 내부 세부사항은 뒤에 정리합니다.
루트 `README.md`는 별도 조율 전까지 안정적인 프로젝트 개요로 유지합니다.

## Unreleased

### Changed

- 사용자 관점의 제품 설명을 스터디룸에서 face party games로 전환했습니다. 문서에서는 방, 초대 코드, 플레이어, 라운드, 인터미션, 얼굴 기반 파티 게임 흐름을 기준으로 설명합니다.
- 기존 구현과 연결되는 재사용 인프라 설명은 유지했습니다: Roomi 방/초대 코드, Daily 비디오 방과 참가자 토큰, Socket.IO 실시간 동기화, 서버 기준 라운드 타이머, 로컬 얼굴 분석 개인정보 보호 원칙.
- `docs/api.md`는 현재 코드의 REST/Socket.IO 계약을 유지하되, `sessions`, `goals`, `focus` 같은 레거시 스터디룸 이름을 호환 API로 명시했습니다. 새 제품 카피는 party-game 용어를 사용하고, 실제 라우트명은 코드와 맞춰 보존합니다.
- `docs/architecture.md`는 desktop-first face party games MVP 구조로 다시 정리했습니다. Electron 렌더러의 로컬 얼굴 분석, 중앙 API 서버의 room/invite source of truth, Daily의 미디어 전용 역할, 서버 소유 타이머 경계를 명확히 했습니다.
- mojibake 상태였던 `CHANGELOG.md`를 유효한 UTF-8 한국어/영어 문서로 교체했습니다.

### Manual Steps

- 없음.
