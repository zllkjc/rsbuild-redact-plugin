import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './utils.mjs';

const directory = await mkdtemp(join(tmpdir(), 'rsbuild-redact-package-'));
async function run(command, args, cwd = directory) {
  await new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', code => code === 0 ? ok() : fail(new Error(`${command} exited ${code}`)));
  });
}
try {
  await run('npm', ['pack', '--ignore-scripts', '--pack-destination', directory, '--cache', join(directory, 'npm-cache')], root);
  const tarball = (await readdir(directory)).find(file => file.endsWith('.tgz'));
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    name: 'redact-package-smoke', private: true, type: 'module',
    dependencies: {
      'rsbuild-redact-plugin': `file:./${tarball}`,
      '@rsbuild/core': '2.2.14', '@rsbuild/plugin-react': '2.1.1',
      '@tanstack/redact': '0.2.1', react: '19.3.1', 'react-dom': '19.3.1',
    },
  }));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--cache', join(directory, 'npm-cache')]);
  await writeFile(join(directory, 'rsbuild.config.mjs'), `import { pluginReact } from '@rsbuild/plugin-react';
import pluginRedact from 'rsbuild-redact-plugin';
export default { plugins: [pluginReact(), pluginRedact()], source: { entry: { index: './index.jsx' } } };\n`);
  await writeFile(join(directory, 'index.jsx'), `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
function App() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>{count}</button>; }
createRoot(document.getElementById('root')).render(<App />);\n`);
  await run('node', ['--input-type=module', '-e', `import { createRequire } from 'node:module'; import plugin from 'rsbuild-redact-plugin'; const cjs=createRequire(import.meta.url)('rsbuild-redact-plugin'); if(plugin().name !== cjs.pluginRedact().name) throw new Error('Export mismatch');`]);
  await run('node', ['node_modules/@rsbuild/core/bin/rsbuild.js', 'build']);
  const html = await readFile(join(directory, 'dist/index.html'), 'utf8');
  assert.match(html, /<script/);
  console.log('PASS isolated npm tarball install, ESM/CJS exports and production build');
} finally {
  await rm(directory, { recursive: true, force: true });
}
