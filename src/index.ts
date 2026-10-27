import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';

export interface RedactPluginOptions {
  /** Toggle the plugin without changing the plugin array. Default: true. */
  enabled?: boolean;
  /** Resolve the app's Redact installation from this directory. */
  resolveFrom?: string;
  /** Only apply to these named browser environments. Mixed browser/server builds are rejected. */
  environments?: readonly string[];
  /** Enable experimental native ViewTransition animations. Default: false, as in Redact's Vite plugin. */
  viewTransitions?: boolean;
}

const aliases: Record<string, string> = {
  react: '@tanstack/redact',
  'react/jsx-runtime': '@tanstack/redact/jsx-runtime',
  'react/jsx-dev-runtime': '@tanstack/redact/jsx-dev-runtime',
  'react/compiler-runtime': '@tanstack/redact/compiler-runtime',
  'react-dom': '@tanstack/redact/dom',
  'react-dom/client': '@tanstack/redact/dom-client',
  'react-dom/test-utils': '@tanstack/redact/dom-test-utils',
  'react-dom/server': '@tanstack/redact/server',
  'react-dom/server.browser': '@tanstack/redact/server',
  'react-dom/server.node': '@tanstack/redact/server',
  'react-dom/server.edge': '@tanstack/redact/server',
  'react-dom/server.bun': '@tanstack/redact/server',
  scheduler: '@tanstack/redact/scheduler',
  'use-sync-external-store': '@tanstack/redact',
  'use-sync-external-store/index.js': '@tanstack/redact',
  'use-sync-external-store/shim': '@tanstack/redact',
  'use-sync-external-store/shim/index.js': '@tanstack/redact',
  'use-sync-external-store/with-selector': '@tanstack/redact',
  'use-sync-external-store/with-selector.js': '@tanstack/redact',
  'use-sync-external-store/shim/with-selector': '@tanstack/redact',
  'use-sync-external-store/shim/with-selector.js': '@tanstack/redact',
};

/** Keep normal React imports and JSX transforms; replace only the browser runtime. */
export function pluginRedact(options: RedactPluginOptions = {}): RsbuildPlugin {
  return {
    name: 'rsbuild-redact-plugin',
    setup(api) {
      if (options.enabled === false) return;
      api.modifyRspackConfig({
        order: 'post',
        handler(config, { environment, rspack }) {
          const name = environment.name;
          if (
            environment.config.output.target !== 'web' ||
            /(^|[-_:])rsc($|[-_:])/i.test(name) ||
            config.resolve?.conditionNames?.includes('react-server') ||
            (options.environments && !options.environments.includes(name))
          ) return;

          const environments = api.getNormalizedConfig().environments;
          if (Object.values(environments).some(item => item.output.target === 'node')) {
            throw new Error('[rsbuild-redact-plugin] This release supports client-side rendering only. Mixed browser/server builds are not supported: Redact 0.2.1 can rebuild native React SSR markup when useId differs. Disable server.ssr in Modern.js, or remove pluginRedact from the SSR application.');
          }

          const require = createRequire(resolve(options.resolveFrom ?? api.context.rootPath, 'package.json'));
          let runtimeEntry: string;
          try {
            runtimeEntry = require.resolve('@tanstack/redact');
          } catch {
            throw new Error('[rsbuild-redact-plugin] Install @tanstack/redact in the application, or set resolveFrom to its package directory.');
          }
          const reactVersion: string = require('react/package.json').version;
          if (!reactVersion.startsWith('19.')) {
            throw new Error(`[rsbuild-redact-plugin] React 19 is required; found ${reactVersion}. React 18 element protocol adaptation is not implemented.`);
          }
          const resolved = Object.fromEntries(
            Object.entries(aliases).map(([from, to]) => [`${from}$`, require.resolve(to)]),
          );
          // Canonicalize direct Redact imports too: hooks and the renderer must share one dispatcher.
          for (const to of new Set(Object.values(aliases))) resolved[`${to}$`] = require.resolve(to);
          config.resolve ??= {};
          const previous = config.resolve.alias;
          config.resolve.alias = {
            ...resolved,
            ...Object.fromEntries(Object.entries(previous ?? {}).filter(([key]) => !resolved[`${key.replace(/\$$/, '')}$`])),
          };

          if (!options.viewTransitions) {
            const featureIndex = resolve(dirname(runtimeEntry), '../dom/features/view-transition/index.js');
            const featureStub = resolve(dirname(featureIndex), 'stub.js');
            config.plugins ??= [];
            config.plugins.push(new rspack.NormalModuleReplacementPlugin(
              /[\\/]features[\\/]view-transition[\\/]index\.js$/,
              data => {
                if (data.createData?.resource === featureIndex) data.createData.resource = featureStub;
              },
            ));
          }
        },
      });
    },
  };
}

export default pluginRedact;
