import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, startServer, median } from './utils.mjs';

const browser = await chromium.launch({ headless: true });
const report = { date: new Date().toISOString(), browser: browser.version(), methodology: 'Production builds. Seven fresh browser contexts per variant in alternating order; five warm-up batches followed by twenty batches per workload. Each batch completes twenty synchronous flushSync updates. Medians summarize block medians. These are microbenchmarks, not INP or concurrent rendering measurements.', results: {} };
const servers = [];
try {
  for (const [index, framework] of ['rsbuild', 'modern'].entries()) {
    report.results[framework] = {};
    const variants = {};
    for (const [runtimeIndex, runtime] of ['react', 'redact'].entries()) {
      const server = await startServer(framework, runtime, 3410 + index * 2 + runtimeIndex);
      servers.push(server);
      variants[runtime] = server;
      report.results[framework][runtime] = { counterMs: [], reverseMs: [], clickCommitMs: [], samples: [], checks: [] };
    }
    for (let block = 0; block < Number(process.env.BROWSER_BLOCKS ?? 7); block++) {
      for (const runtime of block % 2 ? ['redact', 'react'] : ['react', 'redact']) {
        const result = report.results[framework][runtime];
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') errors.push(message.text());
        });
        const html = await (await fetch(variants[runtime].url)).text();
        assert.doesNotMatch(html, /data-row-id="999"/, 'Comparison fixtures must use CSR');
        await page.goto(variants[runtime].url);
        await page.waitForFunction(() => window.__bench);
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
        const blocks = await page.evaluate(async () => {
          const output = { counter: [], reverse: [] };
          for (const kind of ['counter', 'reverse']) {
            for (let i = 0; i < 5; i++) window.__bench.run(kind);
            for (let i = 0; i < 20; i++) {
              await new Promise(requestAnimationFrame);
              output[kind].push(window.__bench.run(kind));
            }
          }
          return output;
        });
        result.counterMs.push(median(blocks.counter));
        result.reverseMs.push(median(blocks.reverse));
        const clicks = [];
        for (let i = 0; i < 20; i++) {
          await page.getByTestId('increment').click();
          clicks.push(await page.evaluate(() => window.__lastCommitMs));
        }
        result.clickCommitMs.push(median(clicks));
        result.samples.push({ ...blocks, clickCommit: clicks });
        if (framework === 'modern') {
          await page.evaluate(() => { window.__navigationSentinel = 'preserved'; });
          await page.getByTestId('about-link').click();
          await page.getByRole('heading', { name: 'About this demo' }).waitFor();
          assert.equal(await page.evaluate(() => window.__navigationSentinel), 'preserved');
          await page.getByTestId('home-link').click();
          await page.waitForFunction(() => window.__bench);
          await page.goto(`${variants[runtime].url}/about`);
          await page.getByRole('heading', { name: 'About this demo' }).waitFor();
          await page.getByTestId('home-link').click();
          await page.waitForFunction(() => window.__bench);
        }
        assert.deepEqual(errors, [], `${framework}/${runtime} browser errors`);
        result.checks = ['CSR render', 'state', 'memoized context', 'controlled input', 'keyed DOM reuse', 'lazy/Suspense', 'portal', ...(framework === 'modern' ? ['client navigation', 'direct route request'] : [])];
        if (block === 0) {
          await mkdir(join(root, 'test-results'), { recursive: true });
          await page.screenshot({ path: join(root, `test-results/${framework}-${runtime}.png`) });
        }
        console.log(`PASS ${framework}/${runtime} block ${block + 1}`);
        await context.close();
      }
    }
    for (const result of Object.values(report.results[framework])) {
      result.medianCounterMs = median(result.counterMs);
      result.medianReverseMs = median(result.reverseMs);
      result.medianClickCommitMs = median(result.clickCommitMs);
    }
    await Promise.all(servers.splice(0).map(server => server.stop()));
  }
  await mkdir(join(root, 'benchmarks'), { recursive: true });
  await writeFile(join(root, 'benchmarks/browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.results, null, 2));
} finally {
  await browser.close();
  await Promise.all(servers.map(server => server.stop()));
}
