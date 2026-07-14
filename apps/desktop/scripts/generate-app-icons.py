#!/usr/bin/env python3
"""Roomi 앱 아이콘(작업표시줄/Dock/배포용)을 마스코트 스프라이트에서 생성한다.

소스: src/renderer/src/assets/mascot/<mood>.png (mascot.png에서 잘라낸 컬러 스프라이트)
출력: resources/roomi-icon.png, resources/roomi-icon.ico, resources/roomi-icon.icns

- ICO는 Windows 작업표시줄이 작은 크기로 다운스케일하므로 여러 사이즈를 함께 담는다.
- 모든 출력은 RGBA 컬러를 그대로 유지한다(과거 grayscale ICO 문제 방지).

사용법:  python scripts/generate-app-icons.py [mood]   (기본 mood: wink)
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MOOD = sys.argv[1] if len(sys.argv) > 1 else "wink"
SRC = ROOT / "src/renderer/src/assets/mascot" / f"{MOOD}.png"
RES = ROOT / "resources"

# 아이콘 프레임 안에서 마스코트가 차지할 비율(여백 확보).
FILL = 0.88
MASTER = 1024


def build_master() -> Image.Image:
    sprite = Image.open(SRC).convert("RGBA")
    # 실제 불투명 픽셀 기준으로 타이트하게 자른 뒤 정사각형 중앙 배치.
    bbox = sprite.getbbox()
    sprite = sprite.crop(bbox)
    target = int(MASTER * FILL)
    w, h = sprite.size
    scale = target / max(w, h)
    sprite = sprite.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    ox = (MASTER - sprite.width) // 2
    oy = (MASTER - sprite.height) // 2
    canvas.alpha_composite(sprite, (ox, oy))
    return canvas


def main() -> None:
    master = build_master()
    RES.mkdir(exist_ok=True)

    # 런타임 창/작업표시줄 아이콘 + macOS Dock(런타임).
    master.resize((512, 512), Image.LANCZOS).save(RES / "roomi-icon.png")

    # Windows 배포용 멀티 사이즈 컬러 ICO.
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    master.save(
        RES / "roomi-icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )

    # macOS 배포용 ICNS (Pillow가 필요한 사이즈를 생성).
    master.save(RES / "roomi-icon.icns", format="ICNS")

    print(f"generated icons from mood '{MOOD}':")
    for f in ("roomi-icon.png", "roomi-icon.ico", "roomi-icon.icns"):
        print(f"  resources/{f}  ({(RES / f).stat().st_size} bytes)")


if __name__ == "__main__":
    main()
