import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

// win32: 아티팩트가 exe 하나뿐이라 기존 관례대로 확장자를 뗀 이름을 쓴다.
// darwin: dmg/zip이 arch당 같은 base 이름을 공유하므로 확장자를 남겨 충돌을 막는다.
const ARTIFACTS_BY_PLATFORM = {
  win32: { extensions: ['.exe'], keepExtension: false },
  darwin: { extensions: ['.dmg', '.zip'], keepExtension: true }
};

const platformConfig = ARTIFACTS_BY_PLATFORM[process.platform];

if (!platformConfig) {
  throw new Error(`write-release-checksum.mjs는 ${process.platform} 플랫폼을 지원하지 않습니다.`);
}

const { extensions, keepExtension } = platformConfig;
const releaseDir = resolve('release');
const entries = await readdir(releaseDir);
const artifacts = entries.filter((name) => extensions.some((ext) => name.endsWith(ext)));

if (artifacts.length === 0) {
  throw new Error(`release/ 폴더에서 ${extensions.join(', ')} 파일을 찾지 못했습니다.`);
}

for (const fileName of artifacts) {
  const filePath = resolve(releaseDir, fileName);
  const digest = createHash('sha256').update(await readFile(filePath)).digest('hex');
  const baseName = keepExtension ? fileName : fileName.slice(0, -extname(fileName).length);
  const checksumPath = resolve(releaseDir, `${baseName}.sha256`);

  await writeFile(checksumPath, `${digest}  ${fileName}\n`, 'utf8');
  console.log(`SHA-256: ${checksumPath}`);
}
