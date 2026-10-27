// Reproduce the causal checks in benchmarks/ANALYSIS.md without changing the
// shared app, original results, dependency sources, or published plugin.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, extname, resolve } from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { chromium } from 'playwright';
import { pluginRedact } from '../dist/index.js';
import { investigationPlugin } from './investigation-plugin.mjs';
import { root, command, median } from './utils.mjs';

const work = join(root, 'test-results/investigation');
await mkdir(work, { recursive: true });
const original = await readFile(join(root, 'examples/shared/App.tsx'), 'utf8');
const list = '<ol data-testid="rows">{rows.map(row => <li key={row.id} data-row-id={row.id}>{row.label}</li>)}</ol>';
const variants = [];
for (const runtime of ['react', 'redact']) {
  for (const mode of ['baseline', 'memo-list', 'zero-list', 'boundary', 'boundary-memo']) {
    // React's boundary is a useful control as well as Redact's reproduction.
    variants.push({ id: `rsbuild-${runtime}-${mode}`, framework: 'rsbuild', runtime, mode });
  }
  variants.push({ id: `rsbuild-${runtime}-diagnostic`, framework: 'rsbuild', runtime, mode: 'baseline', diagnostic: true });
  variants.push({ id: `modern-${runtime}`, framework: 'modern', runtime, mode: 'baseline' });
  variants.push({ id: `modern-${runtime}-diagnostic`, framework: 'modern', runtime, mode: 'baseline', diagnostic: true });
}

for (const variant of variants) {
  if (variant.dist) continue;
  variant.dist = join(work, variant.id, 'dist');
  const dir = join(work, variant.id);
  await mkdir(dir, { recursive: true });
  if (process.env.SKIP_INVESTIGATION_BUILD === '1' && await stat(variant.dist).catch(() => null)) continue;
  if (variant.framework === 'modern') {
    const config = `import original from ${JSON.stringify(join(root, 'examples/modern/modern.config.ts'))};
import { investigationPlugin } from ${JSON.stringify(join(root, 'scripts/investigation-plugin.mjs'))};
export default { ...original, builderPlugins: [...original.builderPlugins${variant.diagnostic ? ', investigationPlugin()' : ''}], output: {...original.output, distPath: { root: ${JSON.stringify(variant.dist)} } } };
`;
    const configPath = join(dir, 'modern.config.ts');
    await writeFile(configPath, config);
    await command(['exec', 'modern', 'build', '--config', configPath], { cwd: join(root, 'examples/modern'), env: { RUNTIME: variant.runtime, SSR: '0', NODE_ENV: 'production' } });
  } else {
    let app = original.replace("'./style.css'", JSON.stringify(join(root, 'examples/shared/style.css')))
      .replace("'./LazyMessage'", JSON.stringify(join(root, 'examples/shared/LazyMessage.tsx')));
    if (variant.mode.endsWith('memo') || variant.mode === 'memo-list') {
      app = app.replace(list, '<Rows rows={rows} />');
      app += `\nconst Rows = memo(({ rows }: { rows: typeof initialRows }) => ${list});\n`;
    }
    if (variant.mode === 'zero-list') app = app.replace('length: 1000', 'length: 0');
    await writeFile(join(dir, 'App.tsx'), app);
    await writeFile(join(dir, 'index.tsx'), `import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import App from './App';
class Boundary extends Component<any, any> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <p>Failed</p> : this.props.children; } }
createRoot(document.getElementById('root')!).render(${variant.mode.startsWith('boundary') ? '<Boundary><App /></Boundary>' : '<App />'});
`);
    const rsbuild = await createRsbuild({ cwd: root, rsbuildConfig: {
      mode: 'production',
      plugins: [pluginReact(), ...(variant.runtime === 'redact' ? [pluginRedact()] : []), ...(variant.diagnostic ? [investigationPlugin()] : [])],
      source: { entry: { index: join(dir, 'index.tsx') } },
      output: { distPath: { root: variant.dist }, polyfill: 'off' },
      performance: { buildCache: false },
    } });
    await rsbuild.build();
  }
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const servers = [];
for (const variant of variants) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let path = resolve(variant.dist, `.${pathname}`);
      assert.ok(path.startsWith(`${variant.dist}/`) || path === variant.dist);
      try { if (!(await stat(path)).isFile()) throw new Error(); }
      catch { path = join(variant.dist, variant.framework === 'modern' ? 'html/index/index.html' : 'index.html'); }
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  variant.url = `http://127.0.0.1:${server.address().port}`;
  servers.push(server);
}

const report = { date: new Date().toISOString(), methodology: 'Independent production builds, original warm-up state (lazy loaded, input filled, one reversal, portal toggled). Five alternating fresh-context blocks; five warm-up and twenty measured batches of twenty flushSync updates, plus twenty actual clicks. Instrumentation builds are excluded from timing; diagnostic counts are per one update. Generated fixtures are ignored under test-results/investigation.', timings: {}, diagnostics: {} };
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
async function prepare(variant) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(variant.url);
  await page.waitForFunction(() => window.__bench);
  assert.equal(await page.getByTestId('rows').locator('li').count(), variant.mode === 'zero-list' ? 0 : 1000);
  await page.getByTestId('increment').click();
  await page.getByLabel('Controlled input').fill('React imports, Redact runtime');
  await page.getByTestId('reverse').click();
  await page.getByTestId('lazy').click();
  await page.getByTestId('lazy-content').waitFor();
  await page.getByTestId('portal').click();
  await page.getByTestId('portal-content').waitFor();
  await page.getByTestId('portal').click();
  return { context, page, errors };
}
try {
  for (let block = 0; block < Number(process.env.INVESTIGATION_BLOCKS ?? 5); block++) {
    const timed = variants.filter(variant => !variant.diagnostic);
    // Alternate runtime and variant order, rather than timing all React first.
    timed.sort((a, b) => a.mode.localeCompare(b.mode) || a.framework.localeCompare(b.framework) || a.runtime.localeCompare(b.runtime));
    if (block % 2) timed.reverse();
    for (const variant of timed) {
      const { context, page, errors } = await prepare(variant);
      const samples = await page.evaluate(async () => {
        const result = { counter: [], reverse: [] };
        for (const kind of ['counter', 'reverse']) {
          for (let i = 0; i < 5; i++) window.__bench.run(kind);
          for (let i = 0; i < 20; i++) {
            await new Promise(requestAnimationFrame);
            result[kind].push(window.__bench.run(kind));
          }
        }
        return result;
      });
      samples.click = [];
      for (let i = 0; i < 20; i++) {
        await page.getByTestId('increment').click();
        samples.click.push(await page.evaluate(() => window.__lastCommitMs));
      }
      assert.equal(await page.getByTestId('count').textContent(), '521');
      assert.equal(await page.getByTestId('context-count').textContent(), '521');
      if (variant.mode !== 'zero-list') assert.equal(await page.getByTestId('rows').locator('li').first().textContent(), 'Row 999');
      assert.deepEqual(errors, []);
      const result = report.timings[variant.id] ??= { samples: [], blockMedians: [] };
      result.samples.push(samples);
      result.blockMedians.push(Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, median(values)])));
      await context.close();
      console.log(`TIMING ${variant.id} block ${block + 1}: ${JSON.stringify(result.blockMedians.at(-1))}`);
    }
  }
  for (const variant of variants.filter(variant => variant.diagnostic)) {
    const { context, page, errors } = await prepare(variant);
    await page.evaluate(() => {
      for (const method of ['appendChild', 'insertBefore', 'compareDocumentPosition']) {
        const originalMethod = Node.prototype[method];
        Node.prototype[method] = function (...args) {
          if (window.__diag) {
            const key = `dom_${method}`;
            window.__diag[key] = (window.__diag[key] || 0) + 1;
            const list = method === 'compareDocumentPosition' ? this.parentNode : this;
            if (list?.getAttribute?.('data-testid') === 'rows') window.__diag[`list_${method}`] = (window.__diag[`list_${method}`] || 0) + 1;
          }
          return originalMethod.apply(this, args);
        };
      }
    });
    const counts = {};
    for (const kind of ['counter', 'reverse']) counts[kind] = await page.evaluate(kind => {
      window.__diag = {};
      window.__bench.run(kind, 1);
      const result = window.__diag;
      window.__diag = null;
      return result;
    }, kind);
    assert.deepEqual(errors, []);
    report.diagnostics[variant.id] = counts;
    await context.close();
    console.log(`DIAGNOSTIC ${variant.id}: ${JSON.stringify(counts)}`);
  }
  for (const result of Object.values(report.timings)) result.medians = Object.fromEntries(['counter', 'reverse', 'click'].map(key => [key, median(result.blockMedians.map(block => block[key]))]));
  await writeFile(join(root, 'benchmarks/investigation-results.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
  await Promise.all(servers.map(server => new Promise(done => server.close(done))));
}
