# Desktop Distribution

Roomi 데스크톱 앱은 `electron-builder`로 Windows x64 NSIS 설치 파일을 생성합니다. 설치 앱은 API 서버를 포함하지 않으며, 빌드할 때 지정한 중앙 Roomi API에 연결합니다.

## Windows 설치 파일 만들기

1. `apps/desktop/.env` 또는 실행 환경에 배포 API 주소를 설정합니다.

   ```dotenv
   VITE_ROOMI_API_URL=https://api.roomi.madcamp-kaist.org
   ```

2. 저장소 루트에서 의존성을 설치하고 패키징합니다.

   ```powershell
   pnpm install --frozen-lockfile
   pnpm dist:win
   ```

3. 산출물을 확인합니다.

   - `apps/desktop/release/Roomi-Setup-<version>.exe`
   - `apps/desktop/release/Roomi-Setup-<version>.sha256`
   - `apps/desktop/release/win-unpacked/Roomi.exe`

Release 빌드는 `VITE_ROOMI_API_URL`이 없거나 localhost 또는 HTTP 주소이면 실패합니다. Daily와 Gemini secret은 설치 파일에 넣지 않고 API 서버 환경변수로만 관리합니다.

## 설치 동작

- 설치 대상: Windows x64
- 형식: NSIS assisted installer
- 기본 범위: 현재 사용자(관리자 권한 불필요)
- 설치 경로 변경 가능
- 바탕화면과 시작 메뉴에 `Roomi` 바로가기 생성
- 앱 제거 항목에 `Roomi` 등록

## GitHub Actions

`.github/workflows/windows-installer.yml`은 다음 경우 Windows 설치 파일을 만듭니다.

- Actions 화면에서 `Windows installer` workflow 수동 실행
- `v*` 형식의 tag push

workflow는 API·desktop 테스트와 타입 검사를 통과한 후 installer와 SHA-256 파일을 artifact로 업로드합니다. 저장소 변수 `ROOMI_API_URL`을 설정하면 기본 API 주소를 대체할 수 있습니다.

## macOS 아이콘

개발 실행에서는 Electron의 `app.dock.setIcon()`으로 Roomi 아이콘을 Dock에 적용합니다. 패키징 시에도 같은 PNG를 macOS 앱 번들 아이콘 원본으로 사용합니다.

## 코드 서명

현재 installer는 unsigned입니다. Windows에서 실행하면 SmartScreen 또는 알 수 없는 게시자 경고가 나타날 수 있습니다. 외부 배포 전에는 코드 서명 인증서를 준비하고 CI secret으로 연결해야 합니다.

인증서 없이 생성된 파일은 내부 테스트용으로만 취급합니다. 서명 적용 후에는 다음 명령으로 상태를 확인합니다.

```powershell
Get-AuthenticodeSignature apps/desktop/release/Roomi-Setup-0.1.0.exe
```

## 수동 릴리스 확인

- 깨끗한 Windows 사용자 환경에서 설치·실행·재설치·제거
- 카메라와 마이크 권한 허용
- 두 PC에서 같은 방 입장 및 Daily 영상 확인
- 카메라 끄기·켜기, 휴식 복귀, 방 퇴장 후 재입장
- installer SHA-256과 `.sha256` 파일 값 비교
