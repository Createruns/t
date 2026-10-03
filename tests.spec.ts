import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Mobile AI Sheet & Editor Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the local file
    const fileUrl = `file://${path.resolve(__dirname, 'index.html')}`;
    await page.goto(fileUrl);
  });

  test('should render table view by default with initial data', async ({ page }) => {
    // Check if table view is active
    await expect(page.locator('#btnGrid')).toHaveClass(/active/);
    await expect(page.locator('#gridContainer')).toBeVisible();

    // Check table headers and first row
    const headers = await page.locator('th input').all();
    const headerTexts = await Promise.all(headers.map(async h => h.inputValue()));
    expect(headerTexts).toEqual(['Item', 'Category', 'Quantity', 'Price']);

    const firstRowInputs = await page.locator('tr:nth-child(2) td input').all();
    expect(await firstRowInputs[0].inputValue()).toBe('Widget A');
  });

  test('should switch to text/csv view and sync data', async ({ page }) => {
    // Switch to text view
    await page.locator('#btnText').click();
    await expect(page.locator('#btnText')).toHaveClass(/active/);
    await expect(page.locator('#textEditor')).toBeVisible();

    // Verify content
    const textValue = await page.locator('#textEditor').inputValue();
    expect(textValue).toContain('Widget A,Hardware,15,120');

    // Edit text
    await page.locator('#textEditor').fill('Item,Category,Quantity,Price\nTest Item,Test Category,1,10');

    // Switch back to grid view
    await page.locator('#btnGrid').click();

    // Verify table updated
    const headerInputs = await page.locator('th input').all();
    const headerTexts = await Promise.all(headerInputs.map(async h => h.inputValue()));
    expect(headerTexts).toEqual(['Item', 'Category', 'Quantity', 'Price']);

    const firstRowInputs = await page.locator('tr:nth-child(2) td input').all();
    expect(await firstRowInputs[0].inputValue()).toBe('Test Item');
  });

  test('should display debug panel and allow toggling', async ({ page }) => {
    const debugContent = page.locator('#debugContent');

    // Initial state (hidden)
    await expect(debugContent).toBeHidden();

    // Click to toggle
    await page.locator('.debug-header').click();
    await expect(debugContent).toBeVisible();

    // Click to toggle again
    await page.locator('.debug-header').click();
    await expect(debugContent).toBeHidden();
  });

  test('should prompt for API key and save it', async ({ page }) => {
    // Click API key button
    await page.locator('.config-btn').click();
    await expect(page.locator('#keyModal')).toBeVisible();

    // Enter key and save
    await page.locator('#apiKeyInput').fill('test-api-key');
    await page.locator('button', { hasText: 'Save Key' }).click();

    // Modal should close
    await expect(page.locator('#keyModal')).toBeHidden();

    // Verify localStorage
    const savedKey = await page.evaluate(() => localStorage.getItem('nv_api_key'));
    expect(savedKey).toBe('test-api-key');
  });

  test('should fall back to hardcoded models when API fails', async ({ page }) => {
    // Intercept API call to simulate failure
    await page.route('**/v1/models', route => route.abort('failed'));

    // Save key to trigger model fetch
    await page.evaluate(() => localStorage.setItem('nv_api_key', 'test-key'));
    await page.evaluate(() => window.fetchModels());

    // Wait for the fallback process to complete
    await expect(page.locator('#statusBar')).toHaveText(/Using fallback models/);

    // Check if dropdown is populated with fallbacks
    const options = await page.locator('#modelSelect option').allInnerTexts();
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContain('llama-3.1-70b-instruct');
  });
});