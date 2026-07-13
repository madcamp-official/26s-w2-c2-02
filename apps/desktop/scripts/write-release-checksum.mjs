import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };

const fileName = `Roomi-Setup-${packageJson.version}.exe`;
const installerPath = resolve('release', fileName);
const digest = createHash('sha256').update(await readFile(installerPath)).digest('hex');
const checksumPath = resolve('release', `Roomi-Setup-${packageJson.version}.sha256`);

await writeFile(checksumPath, `${digest}  ${fileName}\n`, 'utf8');
console.log(`SHA-256: ${checksumPath}`);
