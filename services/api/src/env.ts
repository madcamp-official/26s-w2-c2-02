import 'dotenv/config';

const localRendererOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):51\d{2}$/;

export function isAllowedClientOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  return origin === env.clientOrigin || localRendererOriginPattern.test(origin);
}

export const env = {
  port: Number(process.env.API_PORT ?? 4100),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5175',
  dailyApiKey: process.env.DAILY_API_KEY,
  dailyDomain: process.env.DAILY_DOMAIN,
  openaiApiKey: process.env.OPENAI_API_KEY
};
