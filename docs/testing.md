# Testing Guide

이 문서는 현재 루미 monorepo 에서 테스트를 실행하고 결과를 해석하는 방법을 정리합니다.

## 빠른 확인

```bash
npx pnpm@9.15.0 test
npx pnpm@9.15.0 test:e2e
npx pnpm@9.15.0 test:e2e:local
npx pnpm@9.15.0 typecheck
```

- `test`: Electron desktop 패키지의 Vitest 단위 테스트를 실행합니다.
- `test:e2e`: Linux/headless 기준으로 Electron 앱을 build 한 뒤 Playwright 로 실제 앱 shell 을 실행해 확인합니다.
- `test:e2e:local`: macOS, Windows, 로컬 Linux 처럼 GUI 세션이 있는 환경에서 Electron E2E 를 실행합니다. Windows 에도 없는 Unix `env -u` 대신 Node runner 로 `ELECTRON_RUN_AS_NODE` 를 제거합니다.
- `typecheck`: workspace 전체 TypeScript 검사를 실행합니다.

## React renderer 테스트

목적은 Electron 창 없이 React renderer UI 를 빠르게 검증하는 것입니다. 현재는 jsdom 환경에서 Testing Library 로 컴포넌트를 렌더링합니다.

```bash
npx pnpm@9.15.0 --filter @lumi/desktop test
```

정상 결과는 Vitest 가 `src/renderer/**/*.test.tsx` 테스트를 통과시키는 것입니다. 이 테스트는 브라우저나 Electron 창을 띄우지 않습니다.

화면을 직접 보며 renderer 만 확인하려면 다음 명령을 실행하고, 로컬 브라우저에서 forwarded `5175` 포트를 엽니다.

```bash
npx pnpm@9.15.0 --filter @lumi/desktop dev:renderer
```

원격 SSH 환경에서는 이 방식이 React 화면을 눈으로 확인하기 가장 단순합니다.

## Electron main/preload 단위 테스트

목적은 Electron main process 의 창 생성 옵션과 preload bridge 노출 값을 빠르게 검증하는 것입니다. 실제 `BrowserWindow` 를 띄우지 않고 mock 으로 확인합니다.

```bash
npx pnpm@9.15.0 --filter @lumi/desktop test
```

renderer 테스트와 같은 명령어를 쓰는 이유는 현재 renderer, main, preload 단위 테스트를 모두 `apps/desktop` 패키지의 Vitest suite 하나로 묶어두었기 때문입니다. 정상 결과는 다음 성격의 테스트가 함께 통과하는 것입니다.

```text
src/renderer/src/ui/App.test.tsx
src/main/create-window.test.ts
src/preload/index.test.ts
```

이 테스트도 실제 창을 띄우지 않습니다. 창이 뜨는지까지 보고 싶다면 Electron dev 실행 또는 E2E 테스트를 사용합니다.

## Electron E2E 테스트

목적은 build 된 Electron 앱을 Playwright 로 실제 실행해서 renderer, main, preload 연결이 함께 동작하는지 확인하는 것입니다.

```bash
npx pnpm@9.15.0 test:e2e
```

정상 결과는 Playwright list reporter 에서 E2E 테스트가 `passed` 로 끝나는 것입니다. 현재 테스트는 앱 제목, 기본 shell UI, preload API 노출 여부를 확인합니다.

Linux/headless 서버에서는 실제 사용자가 볼 수 있는 데스크톱 창이 뜨지 않습니다. `test:e2e` script 는 `xvfb-run` 으로 가상 디스플레이를 만들어 Electron 창을 그 안에서 실행합니다. CI 나 원격 서버에서 자동 검증하기에는 좋은 방식이지만, 사람이 앱 창을 보며 조작하는 용도는 아닙니다.

macOS 또는 로컬 GUI 환경에서는 `xvfb-run` 이 필요하지 않습니다. 다음 명령을 사용합니다.

```bash
npx pnpm@9.15.0 test:e2e:local
```

Linux/headless 서버나 CI 에서는 다음 명령을 사용합니다.

```bash
npx pnpm@9.15.0 test:e2e:linux
```

현재 루트의 `test:e2e` 는 Linux/headless 기본값으로 `test:e2e:linux` 를 실행합니다. 로컬 mac 에서는 `test:e2e:local` 을 명시해서 실행하는 편이 안전합니다.

Windows 에서도 같은 `test:e2e:local` 명령을 사용합니다. desktop package 의 Node runner 가 `ELECTRON_RUN_AS_NODE` 를 제거한 뒤 `electron-vite build` 와 `playwright test` 를 순서대로 실행하므로 PowerShell/CMD 에서 별도 `env` 명령을 설치할 필요가 없습니다.

## 실제 Electron 창을 보고 싶을 때

로컬 GUI 환경에서 다음 명령을 실행하는 방식이 가장 좋습니다.

```bash
npx pnpm@9.15.0 --filter @lumi/desktop dev
```

Windows 에서도 같은 명령을 사용합니다. desktop package 의 dev runner 가 `ELECTRON_RUN_AS_NODE` 와 기존 `ELECTRON_RENDERER_URL` 을 제거한 뒤 빈 renderer 포트를 골라 `electron-vite dev` 를 실행하므로 PowerShell/CMD 에서 별도 `env` 명령을 설치할 필요가 없습니다. renderer dev server 는 5175 포트를 먼저 시도하고, 이미 점유되어 있으면 다음 사용 가능한 포트를 Electron 에 전달합니다.

원격 SSH 환경에서 실제 창까지 보려면 X11 forwarding, VNC, noVNC 같은 별도 데스크톱 전달 환경이 필요합니다. 단순 포트 포워딩으로 볼 수 있는 것은 `dev:renderer` 로 띄운 React renderer 화면뿐입니다.

## Electron 설치 문제

`Electron failed to install correctly` 오류가 나면 Electron postinstall 이 실행되지 않았거나 실행 파일 압축 해제가 실패한 상태일 수 있습니다.

```bash
npx pnpm@9.15.0 install
```

`--ignore-scripts` 를 붙이면 Electron 실행 파일이 설치되지 않을 수 있습니다. 이 저장소는 `electron` 과 `esbuild` 의 install script 를 허용하도록 루트 `package.json` 의 `pnpm.onlyBuiltDependencies` 를 설정해둡니다.

Codex, VS Code remote, 일부 headless 셸에서 `ELECTRON_RUN_AS_NODE=1` 이 설정돼 있으면 Electron 이 앱 런타임이 아니라 Node 처럼 실행될 수 있습니다. desktop package 의 Electron 실행 script 는 이 환경변수를 제거하고 실행하도록 구성되어 있습니다.

## 아직 없는 테스트 영역

현재 `apps/api` 패키지는 아직 생성되지 않았습니다. backend 가 추가되면 API 단위 테스트, 통합 테스트, database migration 검증을 별도 script 로 추가하고 이 문서에 이어서 정리합니다.
