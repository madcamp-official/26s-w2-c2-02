import { expect, test, _electron as electron } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('opens the LumI desktop shell with preload API available', async () => {
  const app = await electron.launch({
    args: [appRoot]
  });

  const page = await app.firstWindow();

  await expect(page).toHaveTitle('LumI');
  await expect(page.getByRole('heading', { level: 1, name: '루미' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Q4M2XD/ })).toBeVisible();
  await expect(page.getByLabel('참가자 영상 영역')).toBeVisible();

  const preloadApi = await page.evaluate(() => window.lumi);
  expect(preloadApi).toEqual({
    platform: expect.any(String)
  });

  await app.close();
});
