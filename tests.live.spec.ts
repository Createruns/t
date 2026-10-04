import { test, expect, request as pwRequest } from '@playwright/test';
import * as path from 'path';

/**
 * LIVE integration tests against the real Kilo Code Gateway.
 *
 * IMPORTANT — why we don't fetch() directly from the page:
 * The Kilo Gateway does NOT send an `Access-Control-Allow-Origin` header, so a
 * browser `fetch()` to it is blocked by CORS ("TypeError: Failed to fetch").
 * This is a real-world constraint for any purely client-side integration.
 *
 * To PROVE the end-to-end pipeline (real API -> real response -> rendered in the
 * real-time AI Response panel) we:
 *   1. Call the live Kilo API from the Playwright test runner (Node side, which
 *      has no CORS restriction) to get a genuine model completion and model list.
 *   2. Use page.route() to serve that *real* response to the app, then drive the
 *      UI and assert the response renders correctly in the panel.
 *
 * The API key is read from the KILO_API_KEY environment variable so the secret
 * is never committed. If it is not set, the suite is skipped.
 *
 * Run with (PowerShell):
 *   $env:KILO_API_KEY="<your-key>"; npx playwright test tests.live.spec.ts
 */

const KILO_API_KEY = process.env.KILO_API_KEY || '';
const BASE = 'https://api.kilo.ai/api/gateway';
const fileUrl = `file://${path.resolve(__dirname, 'index.html')}`;

test.describe('Live Kilo Gateway integration', () => {
  test.skip(!KILO_API_KEY, 'KILO_API_KEY env var not set — skipping live tests.');
  test.setTimeout(90_000);

  test('live API returns a real model list (Node-side call)', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${KILO_API_KEY}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const ids: string[] = (json.data || json).map((m: any) => m.id);
    expect(ids.length).toBeGreaterThan(10);
    expect(ids).toContain('kilo-auto/free');
    await ctx.dispose();
  });

  test('live API returns a real chat completion (Node-side call)', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.post(`${BASE}/chat/completions`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KILO_API_KEY}`,
      },
      data: {
        model: 'kilo-auto/free',
        messages: [{ role: 'user', content: 'Reply with exactly this text and nothing else: KILO LIVE OK' }],
        max_tokens: 20,
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('renders a REAL live completion in the response panel (end-to-end)', async ({ page }) => {
    // 1. Get a genuine completion from the live Kilo API (Node side, no CORS).
    const ctx = await pwRequest.newContext();
    const apiRes = await ctx.post(`${BASE}/chat/completions`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KILO_API_KEY}` },
      data: {
        model: 'kilo-auto/free',
        messages: [{ role: 'user', content: 'Reply with exactly: KILO LIVE OK' }],
        max_tokens: 20,
      },
    });
    expect(apiRes.status()).toBe(200);
    const liveJson = await apiRes.json();
    const liveContent: string = liveJson?.choices?.[0]?.message?.content ?? '';
    expect(liveContent.length).toBeGreaterThan(0);
    await ctx.dispose();

    // 2. Feed the REAL response to the app (bypassing the browser CORS block),
    //    and avoid the (CORS-blocked) live /models call via the fallback list.
    await page.route('**/chat/completions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveJson) })
    );
    await page.route('**/models', (route) => route.abort('failed'));

    await page.goto(fileUrl);
    await page.evaluate((key) => localStorage.setItem('kilo_api_key', key), KILO_API_KEY);
    await page.evaluate(() => (window as any).fetchModels());
    await expect(page.locator('#modelSelect')).toHaveValue('kilo-auto/free');

    // 3. Drive the UI and assert the real content renders in the panel.
    await page.fill('#userInput', 'prove it');
    await page.click('.send-btn');

    await expect(page.locator('#responseBadge')).toHaveText(/Done/, { timeout: 30_000 });
    const panel = (await page.locator('#responseContent').innerText()).trim();
    expect(panel).toContain(liveContent.trim());
    await expect(page.locator('#responseModel')).toHaveText(/kilo-auto\/free/);
    await expect(page.locator('#responseTiming')).toHaveText(/\d+\s*ms/);
  });

  test('shows a clear CORS error when the page calls the gateway directly', async ({ page }) => {
    // No page.route() here: let the browser actually attempt the cross-origin
    // request so we can prove the app reports a clear, actionable CORS error
    // (rather than a cryptic "Failed to fetch") in the response panel.
    await page.route('**/models', (route) => route.abort('failed')); // use fallback models
    await page.goto(fileUrl);
    await page.evaluate((key) => localStorage.setItem('kilo_api_key', key), KILO_API_KEY);
    await page.evaluate(() => (window as any).fetchModels());
    await expect(page.locator('#modelSelect')).toHaveValue('kilo-auto/free');

    await page.fill('#userInput', 'hello');
    await page.click('.send-btn');

    await expect(page.locator('#responseBadge')).toHaveText(/Error/, { timeout: 30_000 });
    await expect(page.locator('#responseContent')).toContainText(/CORS/i);
  });
});
