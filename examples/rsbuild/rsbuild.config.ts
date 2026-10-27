import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginRedact } from '../../dist/index.js';
import { captureModules } from '../../scripts/capture-modules.mjs';

export default defineConfig({
  plugins: [pluginReact(), pluginRedact({ enabled: process.env.RUNTIME !== 'react' }), captureModules()],
  source: { entry: { index: './src/index.tsx' } },
  output: { distPath: { root: `dist-${process.env.RUNTIME ?? 'redact'}` }, polyfill: 'off' },
  html: { title: 'Rsbuild · React / Redact' },
  performance: { buildCache: false },
  server: { port: Number(process.env.PORT ?? 3100), host: '127.0.0.1' },
});
