import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function captureModules() {
  return {
    name: 'benchmark:capture-modules',
    setup(api) {
      api.onAfterEnvironmentCompile(({ stats, environment }) => {
        if (!stats || environment.config.output.target !== 'web' || process.env.NODE_ENV !== 'production') return;
        const names = [];
        for (const module of stats.compilation.modules) {
          if (module.resource) names.push(module.resource);
        }
        const directory = environment.distPath;
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'module-audit.json'), JSON.stringify({
          nativeReact: [...new Set(names.filter(name => /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(name)))],
          redact: [...new Set(names.filter(name => /[\\/]@tanstack[\\/]redact[\\/]/.test(name)))],
        }, null, 2));
      });
    },
  };
}
