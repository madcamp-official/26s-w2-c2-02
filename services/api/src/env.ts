import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serviceRoot, '..', '..');

loadEnv({ path: resolve(repoRoot, '.env') });
loadEnv({ path: resolve(serviceRoot, '.env'), override: true });

const localRendererOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):51\d{2}$/;

export function isAllowedClientOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  return (
    localRendererOriginPattern.test(origin) ||
    env.clientOrigins.some((allowedOrigin) => originMatchesAllowedPattern(origin, allowedOrigin))
  );
}

function parseClientOrigins(value: string | undefined) {
  return (value ?? 'http://localhost:5175')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originMatchesAllowedPattern(origin: string, allowedOrigin: string) {
  if (!allowedOrigin.includes('*')) {
    return origin === allowedOrigin;
  }

  if (allowedOrigin === '*') {
    return false;
  }

  const escapedPattern = allowedOrigin.split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${escapedPattern}$`).test(origin);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const env = {
  port: Number(process.env.API_PORT ?? 4100),
  host: process.env.API_HOST ?? '0.0.0.0',
  clientOrigins: parseClientOrigins(process.env.CLIENT_ORIGIN),
  dailyApiKey: process.env.DAILY_API_KEY,
  dailyDomain: process.env.DAILY_DOMAIN,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
  ollamaModel: process.env.OLLAMA_MODEL
};
