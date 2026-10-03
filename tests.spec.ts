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

    // Check if dropdown is populated with fallbacks
    const options = await page.locator('#modelSelect option').allInnerTexts();
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContain('google/gemini-3.8-flash');
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
});