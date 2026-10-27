import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { cpus, platform, arch } from 'node:os';
import { command, distPath, root, median } from './utils.mjs';

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}
async function size(framework, runtime) {
  const dist = distPath(framework, runtime);
  // All emitted browser JS, including lazy routes; excludes server bundles and source maps.
  const js = (await files(join(dist, 'static/js'))).filter(path => path.endsWith('.js'));
  const totals = { raw: 0, gzip: 0, brotli: 0, files: js.length };
  for (const path of js) {
    const data = await readFile(path);
    totals.raw += data.length;
    totals.gzip += gzipSync(data).length;
    totals.brotli += brotliCompressSync(data).length;
  }
  const audit = JSON.parse(await readFile(join(dist, 'module-audit.json'), 'utf8'));
  if (runtime === 'redact') {
    assert.equal(audit.nativeReact.length, 0, `Native React leaked into ${framework} browser output`);
    assert.ok(audit.redact.length > 0, `Redact missing from ${framework} module graph`);
    assert.ok(audit.redact.some(name => name.endsWith('/view-transition/stub.js')), 'Default feature pruning missing');
    assert.ok(!audit.redact.some(name => name.endsWith('/view-transition/full.js')), 'Experimental animation was bundled');
  } else {
    assert.ok(audit.nativeReact.length > 0);
    assert.equal(audit.redact.length, 0);
  }
  return { ...totals, nativeReactModules: audit.nativeReact.length, redactModules: audit.redact.length };
}

const rounds = Number(process.env.BUILD_ROUNDS ?? 5);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const versions = {};
for (const name of Object.keys(pkg.devDependencies)) {
  versions[name] = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
}
const report = { date: new Date().toISOString(), system: { platform: platform(), arch: arch(), cpu: cpus()[0].model, node: process.version }, versions, methodology: 'CSR in both frameworks. Persistent build cache disabled. One unrecorded warm-up per variant, then alternating sequential clean builds. Wall time includes CLI startup. Gzip/Brotli sum separately compressed browser JS assets, including lazy chunks.', results: {} };
for (const framework of ['rsbuild', 'modern']) {
  report.results[framework] = {};
  for (const runtime of ['react', 'redact']) {
    console.log(`Warm-up: ${framework}/${runtime}`);
    await command(['--dir', `examples/${framework}`, 'build'], { env: { RUNTIME: runtime, NODE_ENV: 'production' } });
    report.results[framework][runtime] = { buildsMs: [] };
  }
  for (let round = 0; round < rounds; round++) {
    for (const runtime of round % 2 ? ['redact', 'react'] : ['react', 'redact']) {
      const start = performance.now();
      await command(['--dir', `examples/${framework}`, 'build'], { env: { RUNTIME: runtime, NODE_ENV: 'production' } });
      report.results[framework][runtime].buildsMs.push(performance.now() - start);
    }
  }
  for (const runtime of ['react', 'redact']) {
    Object.assign(report.results[framework][runtime], await size(framework, runtime));
    report.results[framework][runtime].medianBuildMs = median(report.results[framework][runtime].buildsMs);
  }
}
await mkdir(join(root, 'benchmarks'), { recursive: true });
await writeFile(join(root, 'benchmarks/build-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.results, null, 2));
