import { readFile } from 'node:fs/promises';

const tag = process.env.GITHUB_REF_NAME;

if (!tag) {
  throw new Error('GITHUB_REF_NAME이 없어 release tag를 검증할 수 없습니다.');
}

const packageUrl = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'));
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  throw new Error(`release tag ${tag}와 desktop version ${packageJson.version}이 일치하지 않습니다. 예상 tag: ${expectedTag}`);
}

console.log(`Release tag ${tag} matches desktop version ${packageJson.version}.`);
