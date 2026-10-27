# rsbuild-redact-plugin

Use [TanStack Redact](https://github.com/TanStack/redact) as the browser runtime for React applications built with **Rsbuild** or **Modern.js**. Keep your existing React imports, JSX transforms and Fast Refresh.

This is an independent integration, not an official TanStack, Rsbuild or Modern.js package. Redact is experimental and renders synchronously; a smaller bundle does not imply equivalent React concurrent behavior or universally faster rendering.

**Version 0.1 supports client-side rendering (CSR) only.** Modern.js native React SSR → Redact hydration failed the DOM reuse check with `useId`; mixed browser/Node builds are rejected rather than silently shipping that incompatibility. See [SSR investigation](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/benchmarks/SSR-NOTES.md).

## Install

```sh
npm install @tanstack/redact@~0.2.1
npm install -D rsbuild-redact-plugin
```

Requires React 19, Rsbuild 2.2.13+ within v2, and Node 20.19+ or 22.12+. Keep `react` and `react-dom` installed for ecosystem dependencies and tooling. Tested with React 19.3.1, Redact 0.2.1, Rsbuild 2.2.14 and Modern.js 3.10.3. React 18 is rejected with an explanatory error because its element protocol requires a separate adaptation.

## Rsbuild

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [pluginReact(), pluginRedact()],
});
```

`pluginReact` still handles JSX and Fast Refresh. `pluginRedact` resolves the application's Redact installation and redirects exact React import specifiers to it, including JSX, compiler runtime, ReactDOM, scheduler and external store shims. Direct Redact imports resolve to the same installation to avoid duplicate hook dispatchers.

```tsx
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

createRoot(document.getElementById('root')!).render(<Counter />);
```

## Modern.js

```ts
// modern.config.ts
import { appTools, defineConfig } from '@modern-js/app-tools';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [appTools()],
  builderPlugins: [pluginRedact()],
  server: { ssr: false },
});
```

Register it in [`builderPlugins`](https://modernjs.dev/configure/app/builder-plugins.html), which accepts Rsbuild plugins. The included Modern.js example verifies CSR, file-based routes, client navigation and state-preserving Fast Refresh.

## Options

```ts
pluginRedact({
  enabled: true,
  // resolveFrom: '/absolute/path/to/app',
  // environments: ['web'],
  viewTransitions: false,
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Disable all plugin hooks when false. |
| `resolveFrom` | Rsbuild project root | Directory from which to resolve the application's dependencies. Useful for monorepos. |
| `environments` | All eligible browser environments | Optional allowlist of environment names. Modern.js normally uses `client`; Rsbuild normally uses `web`. |
| `viewTransitions` | `false` | Enable Redact's experimental native ViewTransition animations. The default replaces that feature with its upstream stub, matching Redact's Vite default. |

Only environments with `output.target: 'web'` are changed. Server-only builds retain native React; mixed browser/Node builds are rejected. Environments named `rsc` (including separated prefixes/suffixes) and configs using the `react-server` resolve condition are excluded. This is **not an SSR or RSC/Flight integration**. A separately deployed server or mixed-layer RSC setup cannot always be detected by this guard and remains unsupported.

The integration preserves Redact's default runtime features, including context, Suspense and classes. Upstream hydration code is not forcibly removed, but SSR integration is unsupported. It does not expose the behavior-removing `nano` preset. Unmapped React internal/subpath imports are not redirected by prefix matching. React internals-dependent libraries still need application-specific validation.

## Examples and reproducible comparison

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build

pnpm --dir examples/rsbuild dev
pnpm --dir examples/modern dev

# Native React baseline (POSIX shell)
RUNTIME=react pnpm --dir examples/rsbuild dev
RUNTIME=react pnpm --dir examples/modern dev
```

Both examples use CSR and render the same shared 1,000-row component with state, memoized context, controlled input, keyed reordering, a lazy module and a portal. Modern.js additionally includes routing. Persistent build caching is disabled in these comparison fixtures; this prevents cached outputs from contaminating environment-variable switches.

```sh
pnpm test
pnpm typecheck
pnpm exec playwright install chromium
pnpm bench
pnpm test:browser
pnpm test:dev
pnpm test:package
```

Run these sequentially: the development test temporarily edits the shared component and restores it in `finally`. Build comparisons alternate variants after warm-up, measure five builds per variant and count all emitted browser JavaScript, including lazy chunks. Browser tests alternate seven fresh contexts per variant and check correctness before measuring completed synchronous updates. The script fails if the React baseline contains Redact or the Redact browser build contains native React.

See [the measured report](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/benchmarks/REPORT.md), [build data](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/benchmarks/build-results.json), [browser data](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/benchmarks/browser-results.json), and [development checks](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/benchmarks/dev-results.json). Results describe this fixture on one machine, not a general application speedup. Browser timing is not field INP or paint latency, and this integration does not optimize server-side rendering.

Measured on an Apple M5 Pro with Chromium 156:

| CSR fixture | React browser JS gzip | Redact browser JS gzip | Reduction |
| --- | --- | --- | --- |
| Rsbuild | 71.24 KB | 25.17 KB | 64.7% |
| Modern.js | 110.46 KB | 65.50 KB | 40.7% |

The keyed reversal workload was faster with Redact, while counter updates and handler-to-commit timings were slower. Review the complete measurements before drawing conclusions about your application.

## Compatibility and tradeoffs

- Redact has no React concurrent scheduler, time slicing or interruptible component rendering. Review the upstream [compatibility table](https://github.com/TanStack/redact#compatibility) before adopting it.
- React Compiler imports are redirected, but this repository does not validate every compiler output pattern.
- Modern.js SSR was investigated and failed native server DOM reuse with `useId`. SSR, streaming, Server Actions and RSC are unsupported by this release.
- Feature pruning uses the published Redact 0.2.x module layout. The peer range is deliberately narrow so newer incompatible versions are not selected silently.
- ESM, CommonJS and TypeScript declarations are shipped. There is no bundled copy of the runtime inside this plugin.

MIT.
