import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Mobile AI Sheet & Editor Tests', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, 'index.html')}`;
    await page.goto(fileUrl);
  });

  test('should render table view by default with initial data', async ({ page }) => {
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
    await page.locator('header .config-btn').click();
    await expect(page.locator('#keyModal')).toBeVisible();

    // Enter key and save
    await page.locator('#apiKeyInput').fill('test-api-key');
    await page.locator('button', { hasText: 'Save Settings' }).click();

    // Modal should close
    await expect(page.locator('#keyModal')).toBeHidden();

    // Verify localStorage
    const savedKey = await page.evaluate(() => localStorage.getItem('kilo_api_key'));
    expect(savedKey).toBe('test-api-key');
  });

  test('should fall back to hardcoded models when API fails', async ({ page }) => {
    // Intercept API call to simulate failure
    await page.route('**/models', route => route.abort('failed'));

    // Save key to trigger model fetch
    await page.evaluate(() => localStorage.setItem('kilo_api_key', 'test-key'));
    await page.evaluate(() => window.fetchModels());

    // Wait for the fallback process to complete
    await expect(page.locator('#statusBar')).toHaveText(/Using fallback models/);

    // The category defaults to "free", so the dropdown should be populated with
    // the free fallback models. Assert on option VALUES (clean ids, no 🆓 badge).
    const values = await page.locator('#modelSelect option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value)
    );
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain('kilo-auto/free');
    expect(values).toContain('stepfun/step-3.7-flash:free');
    // Non-free models must be filtered out while the Free category is active.
    expect(values).not.toContain('openai/gpt-5.3-codex');
  });

  test('should default to a free model with the Free category selected', async ({ page }) => {
    await page.route('**/models', route => route.abort('failed'));
    await page.evaluate(() => localStorage.setItem('kilo_api_key', 'test-key'));
    await page.evaluate(() => window.fetchModels());
    await expect(page.locator('#statusBar')).toHaveText(/Using fallback models/);

    // The category filter defaults to "free".
    await expect(page.locator('#modelCategory')).toHaveValue('free');

    // The pre-selected model should be the default free model, and every option
    // shown must be a free model (value ends with :free or is a known free id).
    await expect(page.locator('#modelSelect')).toHaveValue('kilo-auto/free');

    const values = await page.locator('#modelSelect option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value)
    );
    const knownFree = new Set([
      'kilo-auto/free', 'openrouter/free', 'stealth/space-bunny-alpha',
      'inclusionai/ling-3.1-flash', 'google/lyria-3-pro-preview', 'google/lyria-3-clip-preview',
    ]);
    for (const v of values) {
      expect(v.includes(':free') || knownFree.has(v)).toBeTruthy();
    }

    // Free options should be badged with the 🆓 marker in their visible label.
    const labels = await page.locator('#modelSelect option').allInnerTexts();
    expect(labels.every((l) => l.includes('🆓'))).toBeTruthy();
  });

  test('should evaluate spreadsheet formulas (=SUM and arithmetic)', async ({ page }) => {
    // Insert a formula in cell Quantity for row 2
    await page.evaluate(() => {
      window.currentData[1][2] = '=SUM(C3:C4)';
      window.renderTable();
    });

    const qtyInput = page.locator('tr:nth-child(2) td:nth-child(4) input');
    expect(await qtyInput.inputValue()).toBe('27');

    // Test arithmetic expression =C3*D3 (5 * 300 = 1500)
    await page.evaluate(() => {
      window.currentData[1][3] = '=C3*D3';
      window.renderTable();
    });

    const priceInput = page.locator('tr:nth-child(2) td:nth-child(5) input');
    expect(await priceInput.inputValue()).toBe('1500');
  });

  test('should support cell formatting and toolbar controls', async ({ page }) => {
    // Select cell and apply bold
    await page.evaluate(() => {
      window.setActiveCell(1, 0);
      window.toggleFormat('bold');
    });

    const cell = page.locator('tr:nth-child(2) td:nth-child(2)');
    await expect(cell).toHaveCSS('font-weight', '700');
  });

  test('should insert and delete rows dynamically', async ({ page }) => {
    const initialRows = await page.locator('tr').count();
    await page.locator('button[title="Add Row Below"]').click();
    expect(await page.locator('tr').count()).toBe(initialRows + 1);

    await page.locator('button[title="Delete Row"]').click();
    expect(await page.locator('tr').count()).toBe(initialRows);
  });

  test('should open Chart modal and render Chart.js canvas', async ({ page }) => {
    await page.locator('#btnChart').click();
    await expect(page.locator('#chartModal')).toBeVisible();

    const canvas = page.locator('#chartCanvas');
    await expect(canvas).toBeVisible();

    // Verify close button
    await page.locator('#chartModal .modal-close-btn').click();
    await expect(page.locator('#chartModal')).toBeHidden();
  });

  test('should switch providers to Google Gemini Direct and update UI badge', async ({ page }) => {
    // Switch provider to Gemini Direct
    await page.locator('#providerSelector').selectOption('gemini_direct');
    const badge = page.locator('#activeProviderBadge');
    await expect(badge).toHaveText('Google Gemini Direct');

    // Verify Gemini models are loaded in dropdown
    const options = await page.locator('#modelSelect option').allInnerTexts();
    expect(options).toContain('gemini-3.8-flash');
  });

  test('should execute smart data cleanup and normalization', async ({ page }) => {
    await page.evaluate(() => {
      window.currentData[1][0] = '   Widget A   ';
      window.currentData[1][2] = '';
      window.smartCleanData();
    });

    const cleanedItem = await page.locator('tr:nth-child(2) td:nth-child(2) input').inputValue();
    expect(cleanedItem).toBe('Widget A');

    const filledQty = await page.locator('tr:nth-child(2) td:nth-child(4) input').inputValue();
    expect(filledQty).toBe('0');
  });

  test('should provide AI Chart Recommendations with automatic axis selection', async ({ page }) => {
    await page.locator('#btnChart').click();
    await expect(page.locator('#chartModal')).toBeVisible();

    await page.locator('button:has-text("💡 Recommend Chart")').click();

    const recommendationHint = page.locator('#chartRecommendationHint');
    await expect(recommendationHint).toBeVisible();
    await expect(recommendationHint).toContainText('Recommended');
  });

  test('should evaluate extended formulas: IF, VLOOKUP, ROUND, and CONCATENATE', async ({ page }) => {
    // Test IF formula: =IF(C2>10, "High", "Low") -> 15 > 10 => "High"
    const ifVal = await page.evaluate(() => window.evaluateFormula('=IF(C2>10, "High", "Low")'));
    expect(ifVal).toBe('High');

    // Test VLOOKUP formula: =VLOOKUP("Widget A", A2:D4, 4, FALSE) -> Price is "120"
    const vlookupVal = await page.evaluate(() => window.evaluateFormula('=VLOOKUP("Widget A", A2:D4, 4, FALSE)'));
    expect(vlookupVal).toBe('120');

    // Test ROUND formula: =ROUND(125.456, 1) -> "125.5"
    const roundVal = await page.evaluate(() => window.evaluateFormula('=ROUND(125.456, 1)'));
    expect(roundVal).toBe('125.5');

    // Test CONCATENATE formula: =CONCATENATE("Item: ", A2) -> "Item: Widget A"
    const concatVal = await page.evaluate(() => window.evaluateFormula('=CONCATENATE("Item: ", A2)'));
    expect(concatVal).toBe('Item: Widget A');
  });

  test('should support multi-sheet workbooks and sheet tab creation', async ({ page }) => {
    // Add new sheet
    await page.evaluate(() => window.addNewSheet('Q4_Summary'));
    
    // Check if new tab is displayed in DOM
    const newTab = page.locator('#tab-Q4_Summary');
    await expect(newTab).toBeVisible();
    await expect(newTab).toHaveClass(/active/);

    // Switch back to Sheet1
    await page.locator('#tab-Sheet1').click();
    await expect(page.locator('#tab-Sheet1')).toHaveClass(/active/);
  });

  test('should sort columns ascending and descending', async ({ page }) => {
    // Sort Price column (col 3) descending
    await page.evaluate(() => {
      window.setActiveCell(1, 3);
      window.sortActiveColumn(false);
    });

    // Row 2 should now be Service B ($300 is max price)
    const topRowItem = await page.locator('tr:nth-child(2) td:nth-child(2) input').inputValue();
    expect(topRowItem).toBe('Service B');
  });

  test('should support Undo and Redo operations', async ({ page }) => {
    const initialItem = await page.locator('tr:nth-child(2) td:nth-child(2) input').inputValue();
    
    // Change value
    await page.evaluate(() => {
      window.saveHistory && window.saveHistory();
      window.currentData[1][0] = 'Changed Item';
      window.renderTable();
    });

    const changedItem = await page.locator('tr:nth-child(2) td:nth-child(2) input').inputValue();
    expect(changedItem).toBe('Changed Item');

    // Trigger undo
    await page.locator('#btnUndo').click();
    const undoneItem = await page.locator('tr:nth-child(2) td:nth-child(2) input').inputValue();
    expect(undoneItem).toBe(initialItem);
  });

  test('should execute autonomous agent structured actions', async ({ page }) => {
    await page.evaluate(() => {
      window.executeAgentActions([
        { type: 'add_column', header: 'Total Value', formula: '=C{row}*D{row}' }
      ]);
    });

    const headers = await page.locator('th input').all();
    const headerTexts = await Promise.all(headers.map(h => h.inputValue()));
    expect(headerTexts).toContain('Total Value');
  });

  test('should robustly parse JSON actions with conversational wrapper and without warnings', async ({ page }) => {
    // Conversational wrapper with ```json codeblock
    const conversationalOutput = `Here are the steps to add your profit column and sort the data:
\`\`\`json
{
  "actions": [
    { "type": "add_column", "header": "Profit" },
    { "type": "sort", "column": 2, "ascending": false }
  ]
}
\`\`\`
I have applied the changes for you.`;

    await page.evaluate((out) => window.handleAgentOutput(out), conversationalOutput);

    const headers = await page.locator('th input').all();
    const headerTexts = await Promise.all(headers.map(h => h.inputValue()));
    expect(headerTexts).toContain('Profit');
  });

  test('should seamlessly fall back to CSV when model outputs raw or block CSV', async ({ page }) => {
    const rawCsvOutput = `Item,Category,Quantity,Price
Widget Premium,Hardware,50,450
Software Ultimate,Software,10,999`;

    await page.evaluate((out) => window.handleAgentOutput(out), rawCsvOutput);

    const firstRowInputs = await page.locator('tr:nth-child(2) td input').all();
    expect(await firstRowInputs[0].inputValue()).toBe('Widget Premium');
  });

  test('Agent output handling of mixed JSON actions and CSV data', async ({ page }) => {
    // 1. Send mixed output
    const mixedOutput = `
      Here is the data and the requested actions:
      \`\`\`json
      {
        "actions": [
          {"type": "create_sheet", "name": "Mixed Data"},
          {"type": "add_column", "header": "Status", "formula": "=IF(C{row}>50, 'High', 'Low')"}
        ]
      }
      \`\`\`
      And here is the data:
      \`\`\`csv
      ID,Item,Quantity
      1,Apples,100
      2,Bananas,20
      \`\`\`
    `;

    await page.evaluate((out) => window.handleAgentOutput(out), mixedOutput);

    // 2. Check that the new sheet was created and is active
    const activeTab = await page.locator('.sheet-tab.active').textContent();
    expect(activeTab).toContain('Mixed Data');

    // 3. Check that the data is populated properly
    const row2Inputs = await page.locator('tr:nth-child(2) td input').all();
    expect(await row2Inputs[1].inputValue()).toBe('Apples');
    expect(await row2Inputs[2].inputValue()).toBe('100');

    // 4. Check that the column was added
    const headerInputs = await page.locator('th input').all();
    expect(await headerInputs[3].inputValue()).toBe('Status');
    // 5. Check that the formula in the new column evaluated correctly
    // For row 2 (Apples, 100), Status should be 'High'
    expect(await row2Inputs[3].inputValue()).toBe('High');

    const row3Inputs = await page.locator('tr:nth-child(3) td input').all();
    // For row 3 (Bananas, 20), Status should be 'Low'
    expect(await row3Inputs[3].inputValue()).toBe('Low');
  });

  test('should extract Kilo Gateway error messages across all response shapes', async ({ page }) => {
    // Regression test for the defect where only `err.error.message` was read,
    // which silently hid errors returned in the Kilo Gateway's other shapes.
    // Shapes below are taken from the live api.kilo.ai gateway responses.
    const results = await page.evaluate(() => {
      const fn = (window as any).extractApiErrorMessage;
      return {
        // 1. Nested object error (auth / paid-model errors from chat/completions)
        nested: fn(
          { error: { code: 'INVALID_TOKEN', message: 'Your authentication token is invalid. Please sign in again.' }, error_type: 'authentication_required' },
          'fallback'
        ),
        // 2. String error + top-level message (validation errors)
        stringWithMessage: fn(
          { error: 'Malformed JSON', error_type: 'invalid_request', message: 'Request body is not valid JSON' },
          'fallback'
        ),
        // 3. Simple string-only error
        stringOnly: fn({ error: 'Rate limit exceeded' }, 'fallback'),
        // 4. Top-level message only
        topLevelMessage: fn({ message: 'Service unavailable' }, 'fallback'),
        // 5. Empty / unknown payload falls back
        empty: fn({}, 'fallback-used'),
      };
    });

    expect(results.nested).toBe('Your authentication token is invalid. Please sign in again.');
    expect(results.stringWithMessage).toBe('Malformed JSON: Request body is not valid JSON');
    expect(results.stringOnly).toBe('Rate limit exceeded');
    expect(results.topLevelMessage).toBe('Service unavailable');
    expect(results.empty).toBe('fallback-used');
  });

  test('should surface the real Kilo API error when model fetch is unauthorized', async ({ page }) => {
    // Simulate a 401 from the Kilo /models endpoint with the gateway's real
    // error shape and verify the actual message is shown (not a generic one).
    await page.route('**/models', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVALID_TOKEN', message: 'Your authentication token is invalid. Please sign in again.' },
          error_type: 'authentication_required',
        }),
      })
    );

    await page.evaluate(() => localStorage.setItem('kilo_api_key', 'bad-key'));
    await page.evaluate(() => (window as any).fetchModels());

    // The debug log should contain the real error message from the gateway.
    await page.locator('.debug-header').click();
    await expect(page.locator('#debugContent')).toContainText(
      'Your authentication token is invalid'
    );
  });

  test('should render conversational/analysis output in the response panel (no alert)', async ({ page }) => {
    // Regression test for the defect where conversational agent output was shown
    // via a blocking alert() and never persisted to the DOM. It must now appear
    // in the real-time AI Response panel.
    let alertFired = false;
    page.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });

    const analysis = 'Summary: Revenue grew 12% QoQ. Top product: Widgets. Action: restock SKU-42.';
    await page.evaluate((out) => (window as any).handleAgentOutput(out, { elapsedMs: 123 }), analysis);

    // The panel shows the raw output and a success badge.
    await expect(page.locator('#responseContent')).toHaveText(analysis);
    await expect(page.locator('#responseBadge')).toHaveText(/Done/);
    await expect(page.locator('#responseTiming')).toHaveText(/123\s*ms/);
    await expect(page.locator('#statusBar')).toHaveText(/Analysis complete/);

    // Critically, no blocking alert() should have been used.
    expect(alertFired).toBe(false);
  });

  test('should flag an empty agent response in the panel', async ({ page }) => {
    await page.evaluate(() => (window as any).handleAgentOutput('', {}));
    await expect(page.locator('#responseBadge')).toHaveText(/Error/);
    await expect(page.locator('#responseContent')).toHaveText(/empty response/i);
    await expect(page.locator('#statusBar')).toHaveText(/empty response/i);
  });

  test('should clear the response panel back to its placeholder state', async ({ page }) => {
    await page.evaluate(() => (window as any).showResponse('Some output', { elapsedMs: 50 }));
    await expect(page.locator('#responseBadge')).toHaveText(/Done/);

    await page.locator('.response-clear-btn').click();
    await expect(page.locator('#responseBadge')).toHaveText(/Idle/);
    await expect(page.locator('#responseContent .placeholder')).toBeVisible();
  });

  test('should run a full agent request (mocked API) and show the response in real time', async ({ page }) => {
    // End-to-end pipeline test without a live key: mock the Kilo chat endpoint
    // with a realistic OpenAI-compatible payload and verify the response panel
    // renders the model content, a Done badge, timing and the model name.
    await page.route('**/chat/completions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'chatcmpl-test',
          model: 'kilo-auto/free',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'Here is my analysis: everything looks good. MOCKED OK' }, finish_reason: 'stop' },
          ],
        }),
      })
    );

    // Avoid the real /models call — go straight to the hardcoded fallback list.
    await page.route('**/models', (route) => route.abort('failed'));

    await page.evaluate(() => localStorage.setItem('kilo_api_key', 'test-key'));
    await page.evaluate(() => (window as any).fetchModels());
    await expect(page.locator('#modelSelect')).toHaveValue('kilo-auto/free');

    await page.fill('#userInput', 'Analyse my data please');
    await page.click('.send-btn');

    await expect(page.locator('#responseBadge')).toHaveText(/Done/);
    await expect(page.locator('#responseContent')).toContainText('MOCKED OK');
    await expect(page.locator('#responseModel')).toHaveText(/kilo-auto\/free/);
    await expect(page.locator('#responseTiming')).toHaveText(/\d+\s*ms/);
  });

  test('should show a request failure in the response panel (mocked 500)', async ({ page }) => {
    await page.route('**/chat/completions', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'server_error', message: 'Upstream model timed out' } }),
      })
    );
    await page.route('**/models', (route) => route.abort('failed'));

    await page.evaluate(() => localStorage.setItem('kilo_api_key', 'test-key'));
    await page.evaluate(() => (window as any).fetchModels());
    await expect(page.locator('#modelSelect')).toHaveValue('kilo-auto/free');

    await page.fill('#userInput', 'do something');
    await page.click('.send-btn');

    await expect(page.locator('#responseBadge')).toHaveText(/Error/);
    await expect(page.locator('#responseContent')).toContainText('Upstream model timed out');
    await expect(page.locator('#statusBar')).toHaveText(/Upstream model timed out/);
  });
});