import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createRsbuild } from '@rsbuild/core';
import { pluginRedact } from '../dist/index.js';

const require = createRequire(import.meta.url);
async function configs(options = {}, extra = {}) {
  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      plugins: [pluginRedact(options)],
      environments: {
        web: { output: { target: 'web' } },
        rsc: { output: { target: 'web' } },
      },
      resolve: { alias: { react: '/stale-react', 'keep-me': '/untouched' } },
      ...extra,
    },
  });
  return rsbuild.initConfigs();
}

test('browser aliases resolve public subpaths exactly and deduplicate direct Redact imports', async () => {
  const [web] = await configs();
  assert.equal(web.resolve.alias['react$'], require.resolve('@tanstack/redact'));
  assert.equal(web.resolve.alias['react-dom/client$'], require.resolve('@tanstack/redact/dom-client'));
  assert.equal(web.resolve.alias['react/jsx-runtime$'], require.resolve('@tanstack/redact/jsx-runtime'));
  assert.equal(web.resolve.alias['react/compiler-runtime$'], require.resolve('@tanstack/redact/compiler-runtime'));
  assert.equal(web.resolve.alias['use-sync-external-store/shim/with-selector$'], require.resolve('@tanstack/redact'));
  assert.equal(web.resolve.alias['@tanstack/redact$'], web.resolve.alias['react$']);
  assert.equal(web.resolve.alias.react, undefined);
  assert.equal(web.resolve.alias['keep-me'], '/untouched');
});

test('server and RSC environments retain their original React configuration', async () => {
  const [server, rsc] = await configs({}, { environments: {
    server: { output: { target: 'node' } }, rsc: { output: { target: 'web' } },
  } });
  for (const config of [server, rsc]) {
    assert.equal(config.resolve.alias.react, '/stale-react');
    assert.equal(config.resolve.alias['react$'], undefined);
  }
});

test('mixed browser/server configurations reject unsupported native React hydration', async () => {
  await assert.rejects(configs({}, { environments: {
    web: { output: { target: 'web' } }, server: { output: { target: 'node' } },
  } }), /supports client-side rendering only/);
});

test('disabled and filtered configurations do not resolve or replace runtimes', async () => {
  for (const options of [{ enabled: false }, { environments: ['other'] }]) {
    const [web] = await configs({ ...options, resolveFrom: '/missing-application' });
    assert.equal(web.resolve.alias['react$'], undefined);
  }
});

test('react-server conditions are protected even in a custom browser environment', async () => {
  const [web] = await configs({}, { resolve: { conditionNames: ['react-server'] } });
  assert.equal(web.resolve.alias?.['react$'], undefined);
});

test('missing runtime reports an actionable installation error', async () => {
  await assert.rejects(configs({ resolveFrom: '/missing-application' }), /Install @tanstack\/redact/);
});

test('CommonJS export supports config loaders using require', () => {
  const loaded = require('../dist/index.cjs');
  assert.equal(loaded.pluginRedact().name, 'rsbuild-redact-plugin');
});
