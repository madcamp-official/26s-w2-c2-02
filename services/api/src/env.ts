import 'dotenv/config';

export const env = {
  port: Number(process.env.API_PORT ?? 4100),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  dailyApiKey: process.env.DAILY_API_KEY,
  dailyDomain: process.env.DAILY_DOMAIN,
  openaiApiKey: process.env.OPENAI_API_KEY
};
