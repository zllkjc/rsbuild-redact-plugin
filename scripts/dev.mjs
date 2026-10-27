import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, startServer } from './utils.mjs';

const file = join(root, 'examples/shared/App.tsx');
const original = await readFile(file, 'utf8');
const browser = await chromium.launch();
try {
  for (const [index, framework] of ['rsbuild', 'modern'].entries()) {
    const server = await startServer(framework, 'redact', 3450 + index, true);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(server.url);
      await page.getByTestId('count').waitFor();
      await page.getByTestId('increment').click();
      await page.evaluate(() => { window.__hmrSentinel = 'preserved'; });
      await writeFile(file, original.replace('Same components. Different runtime.', 'Same components. Fresh update.'));
      await page.getByRole('heading', { name: 'Same components. Fresh update.' }).waitFor({ timeout: 30000 });
      assert.equal(await page.getByTestId('count').textContent(), '1', 'Fast Refresh should preserve state');
      assert.equal(await page.evaluate(() => window.__hmrSentinel), 'preserved', 'Hot update must not reload the page');
      assert.deepEqual(errors, []);
      console.log(`PASS ${framework} development + Fast Refresh`);
    } catch (error) {
      console.error(server.logs());
      throw error;
    } finally {
      await writeFile(file, original);
      await page.close();
      await server.stop();
    }
  }
} finally {
  await writeFile(file, original);
  await browser.close();
}
