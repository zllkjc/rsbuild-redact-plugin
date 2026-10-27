import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { command, startServer } from './utils.mjs';

const browser = await chromium.launch({ headless: true });
try {
  for (const [index, framework] of ['rsbuild', 'modern'].entries()) {
    for (const [runtimeIndex, runtime] of ['react', 'redact'].entries()) {
      await command(['--dir', `examples/${framework}`, 'build'], {
        env: { RUNTIME: runtime, NODE_ENV: 'production' },
      });
      const server = await startServer(framework, runtime, 3410 + index * 2 + runtimeIndex);
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') errors.push(message.text());
        });
        const html = await (await fetch(server.url)).text();
        assert.doesNotMatch(html, /data-row-id="999"/, 'Examples must use CSR');
        await page.goto(server.url);
        await page.getByTestId('count').waitFor();
        assert.equal(await page.getByTestId('rows').locator('li').count(), 1000);
        await page.getByTestId('increment').click();
        assert.equal(await page.getByTestId('count').textContent(), '1');
        assert.equal(await page.getByTestId('context-count').textContent(), '1');
        await page.getByLabel('Controlled input').fill('React imports, Redact runtime');
        assert.equal(await page.getByTestId('input-value').textContent(), 'React imports, Redact runtime');
        await page.evaluate(() => { window.__lastRow = document.querySelector('[data-row-id="999"]'); });
        await page.getByTestId('reverse').click();
        assert.equal(await page.getByTestId('rows').locator('li').first().textContent(), 'Row 999');
        assert.ok(await page.evaluate(() => window.__lastRow === document.querySelector('[data-testid="rows"] li')), 'Keyed reversal must reuse DOM');
        await page.getByTestId('lazy').click();
        await page.getByTestId('lazy-content').waitFor();
        await page.getByTestId('portal').click();
        await page.getByTestId('portal-content').waitFor();
        await page.getByTestId('portal').click();
        assert.equal(await page.getByTestId('portal-content').count(), 0);
        if (framework === 'modern') {
          await page.evaluate(() => { window.__navigationSentinel = 'preserved'; });
          await page.getByTestId('about-link').click();
          await page.getByRole('heading', { name: 'About this demo' }).waitFor();
          assert.equal(await page.evaluate(() => window.__navigationSentinel), 'preserved');
          await page.getByTestId('home-link').click();
          await page.getByTestId('count').waitFor();
          await page.goto(`${server.url}/about`);
          await page.getByRole('heading', { name: 'About this demo' }).waitFor();
          await page.getByTestId('home-link').click();
          await page.getByTestId('count').waitFor();
        }
        assert.deepEqual(errors, [], `${framework}/${runtime} browser errors`);
        console.log(`PASS ${framework}/${runtime}: state, context, input, keyed DOM reuse, lazy, portal${framework === 'modern' ? ', routing' : ''}`);
      } finally {
        await context.close();
        await server.stop();
      }
    }
  }
} finally {
  await browser.close();
}
