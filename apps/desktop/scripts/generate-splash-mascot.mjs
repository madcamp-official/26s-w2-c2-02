// 윙크하는 루미 스프라이트(wink.png)를 base64 data URI 상수로 굽는다.
// 스플래시 창은 렌더러 번들이 로드되기 전에 메인 프로세스에서 즉시 떠야 하므로,
// 렌더러 asset 파이프라인을 거치지 않고 이미지를 소스에 인라인해 둔다.
//
// 사용법: node scripts/generate-splash-mascot.mjs
// 마스코트 아트가 바뀌면 다시 실행해 src/main/splash-mascot.ts 를 갱신한다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../src/renderer/src/assets/mascot/wink.png');
const target = join(here, '../src/main/splash-mascot.ts');

const base64 = readFileSync(source).toString('base64');

const contents = `// 이 파일은 자동 생성되었습니다. scripts/generate-splash-mascot.mjs 로 재생성하세요.
// 원본: src/renderer/src/assets/mascot/wink.png (윙크하는 루미 스프라이트)
// 스플래시는 메인 프로세스에서 렌더러 번들 없이 즉시 떠야 하므로 이미지를 인라인한다.

export const winkMascotDataUri =
  'data:image/png;base64,${base64}';
`;

writeFileSync(target, contents);
console.log(`generated ${target} (base64 length: ${base64.length})`);
