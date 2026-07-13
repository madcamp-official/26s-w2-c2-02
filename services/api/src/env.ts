import 'dotenv/config';

const localRendererOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):51\d{2}$/;

export function isAllowedClientOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  return env.clientOrigins.includes(origin) || localRendererOriginPattern.test(origin);
}

function parseClientOrigins(value: string | undefined) {
  return (value ?? 'http://localhost:5175')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.API_PORT ?? 4100),
  host: process.env.API_HOST ?? '0.0.0.0',
  clientOrigins: parseClientOrigins(process.env.CLIENT_ORIGIN),
  dailyApiKey: process.env.DAILY_API_KEY,
  dailyDomain: process.env.DAILY_DOMAIN,
  openaiApiKey: process.env.OPENAI_API_KEY
};
