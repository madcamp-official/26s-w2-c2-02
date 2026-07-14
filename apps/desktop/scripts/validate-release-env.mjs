import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const apiUrl = env.VITE_ROOMI_API_URL?.trim();

if (!apiUrl) {
  throw new Error('VITE_ROOMI_API_URL is required for a release build.');
}

const parsedUrl = new URL(apiUrl);
if (parsedUrl.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
  throw new Error('Release VITE_ROOMI_API_URL must be a public HTTPS URL.');
}

console.log(`Release API: ${parsedUrl.origin}`);
