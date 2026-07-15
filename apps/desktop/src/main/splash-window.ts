import { BrowserWindow } from 'electron';
import { winkMascotDataUri } from './splash-mascot';

/** 스플래시 창 크기. 상단바 없이 아담하게, 디스코드 로딩 창처럼. */
export const SPLASH_WIDTH = 340;
export const SPLASH_HEIGHT = 380;

/**
 * 스플래시(로딩) 창의 HTML 문서를 만든다.
 * 렌더러 번들·vite 서버와 무관하게 메인 프로세스에서 즉시 띄우기 위해,
 * 이미지·스타일·애니메이션을 모두 한 문서 안에 인라인한다.
 *
 * 화면: 통통 튕기며 윙크하는 루미 → 앱 제목 "루미" → 캐치프레이즈.
 */
export function buildSplashHtml(mascotDataUri: string = winkMascotDataUri): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"
    />
    <style>
      :root {
        --purple-700: #7c6fe8;
        --purple-600: #8a7df0;
        --purple-100: #edebfb;
        --card: #ffffff;
        --heading: #26262e;
        --text-muted: #8a9099;
        --font: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic',
          system-ui, 'Segoe UI', Roboto, sans-serif;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
        /* 프레임리스 투명 창을 드래그로 옮길 수 있게. */
        -webkit-app-region: drag;
        user-select: none;
        cursor: default;
      }

      .splash {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 22px;
        background: linear-gradient(160deg, #ffffff 0%, #f4f2ff 100%);
        border: 1px solid var(--purple-100);
        box-shadow: 0 24px 60px rgba(79, 70, 150, 0.28);
      }

      .splash__stage {
        width: 132px;
        height: 132px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        margin-bottom: 10px;
      }

      .splash__mascot {
        width: 116px;
        height: 116px;
        object-fit: contain;
        transform-origin: 50% 88%;
        will-change: transform;
        -webkit-user-drag: none;
        /* 통통 튕기는 애니메이션. 착지에서 살짝 눌리는(squash) 맛을 준다. */
        animation: roomi-bounce 1.15s cubic-bezier(0.3, 0, 0.2, 1) infinite;
      }

      .splash__title {
        font-family: var(--font);
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 0.5px;
        color: var(--heading);
      }

      .splash__tagline {
        font-family: var(--font);
        font-size: 13px;
        font-weight: 500;
        color: var(--text-muted);
      }

      .splash__dots {
        margin-top: 14px;
        display: flex;
        gap: 6px;
      }

      .splash__dots span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--purple-600);
        opacity: 0.35;
        animation: roomi-dot 1.2s ease-in-out infinite;
      }

      .splash__dots span:nth-child(2) {
        animation-delay: 0.18s;
      }

      .splash__dots span:nth-child(3) {
        animation-delay: 0.36s;
      }

      @keyframes roomi-bounce {
        0% {
          transform: translateY(0) scaleX(1) scaleY(1);
        }
        18% {
          transform: translateY(-30%) scaleX(0.97) scaleY(1.03);
        }
        40% {
          transform: translateY(0) scaleX(1.06) scaleY(0.94);
        }
        52% {
          transform: translateY(-9%) scaleX(0.99) scaleY(1.01);
        }
        70% {
          transform: translateY(0) scaleX(1.03) scaleY(0.97);
        }
        100% {
          transform: translateY(0) scaleX(1) scaleY(1);
        }
      }

      @keyframes roomi-dot {
        0%,
        100% {
          opacity: 0.3;
          transform: translateY(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-3px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .splash__mascot,
        .splash__dots span {
          animation: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="splash" role="img" aria-label="루미 로딩 중">
      <div class="splash__stage">
        <img class="splash__mascot" src="${mascotDataUri}" alt="" draggable="false" />
      </div>
      <div class="splash__title">루미</div>
      <div class="splash__tagline">친구들과 함께 켜두는 AI 플레이룸</div>
      <div class="splash__dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * 디스코드 로딩 창처럼 상단바 없이 작고 투명한 스플래시 창을 만들어 즉시 보여준다.
 * 메인 창이 준비되면 호출자가 이 창을 닫는다.
 */
export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // 투명 창이므로 불투명 배경색을 주지 않는다.
    backgroundColor: '#00000000',
    webPreferences: {
      // 스플래시는 정적 문서만 렌더링하므로 별도 preload가 필요 없다.
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const html = buildSplashHtml();
  splash.loadURL(`data:text/html;base64,${Buffer.from(html, 'utf-8').toString('base64')}`);

  splash.once('ready-to-show', () => {
    splash.show();
  });

  return splash;
}
