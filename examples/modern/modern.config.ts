import { appTools, defineConfig } from '@modern-js/app-tools';
import { pluginRedact } from '../../dist/index.js';

export default defineConfig({
  plugins: [appTools()],
  builderPlugins: process.env.RUNTIME === 'react' ? [] : [pluginRedact()],
  server: { ssr: process.env.SSR === '1', port: Number(process.env.PORT ?? 3200) },
  output: { distPath: { root: `dist-${process.env.RUNTIME ?? 'redact'}` }, polyfill: 'off' },
  html: { title: 'Modern.js · React / Redact' },
  performance: { buildCache: false },
  runtime: { router: true },
});
