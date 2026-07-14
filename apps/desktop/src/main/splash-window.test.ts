// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSplashHtml } from './splash-window';

describe('buildSplashHtml', () => {
  it('앱 제목과 캐치프레이즈를 담는다', () => {
    const html = buildSplashHtml('data:image/png;base64,AAAA');

    expect(html).toContain('루미');
    expect(html).toContain('친구들과 함께 켜두는 AI 운영 스터디룸');
  });

  it('전달한 마스코트 이미지를 인라인한다', () => {
    const html = buildSplashHtml('data:image/png;base64,ZZZZ');

    expect(html).toContain('src="data:image/png;base64,ZZZZ"');
  });

  it('통통 튕기는 애니메이션 keyframe을 포함한다', () => {
    const html = buildSplashHtml('data:image/png;base64,AAAA');

    expect(html).toContain('@keyframes roomi-bounce');
    expect(html).toContain('roomi-bounce');
  });

  it('접근성을 위해 prefers-reduced-motion 시 애니메이션을 끈다', () => {
    const html = buildSplashHtml('data:image/png;base64,AAAA');

    expect(html).toContain('prefers-reduced-motion');
  });
});
