# 개발 확인과 배포

이 문서는 Roomi를 로컬에서 확인하는 방법과 Windows production 설치 파일을 만드는 방법을 함께 설명합니다.

## 1. 로컬 개발 및 확인

### 준비

- Node.js 20 이상
- pnpm 9.15.0
- 카메라와 마이크를 사용할 수 있는 Windows 또는 macOS 환경

저장소를 처음 받은 뒤 루트에서 의존성을 설치합니다.

```bash
pnpm install --frozen-lockfile
```

### 실행

로컬 기능 확인에는 다음 명령 하나를 사용합니다.

```bash
pnpm dev
```

이 명령은 API 서버와 Electron 데스크톱 앱을 함께 실행합니다. 별도의 renderer 실행이나 Electron E2E 명령은 일반적인 수동 확인 과정에 필요하지 않습니다.

앱에서 다음 핵심 흐름을 직접 확인합니다.

1. 방을 만들고 초대 코드를 복사합니다.
2. 다른 PC에서 같은 방에 입장합니다.
3. 대기실에서 참여자 상태와 공부 중 상태를 확인합니다.
4. 세션을 시작하고 양쪽 영상이 표시되는지 확인합니다.
5. 카메라 끄기·켜기와 휴식 후 복귀를 확인합니다.
6. 방 퇴장 후 다시 입장할 수 있는지 확인합니다.

## 2. Windows production 배포

Roomi production 앱은 `electron-builder`로 Windows x64 NSIS 설치 파일을 만듭니다. 설치 파일에는 API 서버가 포함되지 않으며, 빌드 시 지정한 중앙 Roomi API에 연결합니다.

### production API 설정

`apps/desktop/.env`에 외부에서 접근 가능한 HTTPS API 주소를 설정합니다.

```dotenv
VITE_ROOMI_API_URL=https://api.roomi.madcamp-kaist.org
```

release 빌드는 이 값이 비어 있거나 `localhost` 또는 HTTP 주소이면 실패합니다. Daily와 Gemini secret은 데스크톱 앱에 넣지 않고 API 서버 환경변수로만 관리합니다.

배포 전에 API 상태를 확인합니다.

```text
GET https://api.roomi.madcamp-kaist.org/health
```

정상 응답은 HTTP 200과 `ok: true`를 포함해야 합니다.

### 로컬에서 설치 파일 생성

저장소 루트에서 실행합니다.

```bash
pnpm install --frozen-lockfile
pnpm dist:win
```

생성되는 주요 파일은 다음과 같습니다.

- `apps/desktop/release/Roomi-Setup-<version>.exe`: 사용자에게 전달할 설치 파일
- `apps/desktop/release/Roomi-Setup-<version>.sha256`: 설치 파일 무결성 확인값
- `apps/desktop/release/win-unpacked/Roomi.exe`: 패키징 결과를 빠르게 실행해 볼 수 있는 앱

설치 프로그램은 현재 사용자 범위로 설치되며 관리자 권한이 필요하지 않습니다. 설치 경로를 선택할 수 있고 바탕화면·시작 메뉴 바로가기와 제거 항목을 생성합니다.

### GitHub Actions에서 생성

`.github/workflows/windows-installer.yml`의 `Windows installer` workflow는 다음 경우 실행됩니다.

- GitHub Actions 화면에서 수동 실행
- `v*` 형식의 tag push

workflow가 성공하면 실행 결과의 Artifacts에서 Windows installer와 SHA-256 파일을 받을 수 있습니다. 저장소 변수 `ROOMI_API_URL`을 설정하면 기본 production API 주소를 대체합니다.

### 출시 전 확인

1. `.sha256` 파일과 installer의 SHA-256 값이 일치하는지 확인합니다.
2. 깨끗한 Windows 사용자 환경에서 설치·실행·재설치·제거를 확인합니다.
3. 두 PC에서 같은 방에 접속해 Daily 영상을 확인합니다.
4. 카메라 끄기·켜기, 휴식 복귀, 퇴장 후 재입장을 확인합니다.
5. 최종 installer에 코드 서명이 적용됐는지 확인합니다.

```powershell
Get-AuthenticodeSignature apps/desktop/release/Roomi-Setup-0.1.0.exe
```

현재 installer는 unsigned입니다. 코드 서명 전 파일은 Windows SmartScreen 또는 알 수 없는 게시자 경고가 표시될 수 있으므로 내부 확인용으로만 사용합니다. 외부 배포 전에는 코드 서명 인증서를 CI secret에 연결해야 합니다.

## 3. macOS 참고

macOS 개발 실행에서는 Windows 앱과 같은 Roomi 아이콘이 Dock에 표시됩니다. macOS 설치 파일 배포는 아직 자동화하지 않았으며, 현재 production 배포 대상은 Windows x64입니다.
