// Diagnostic-only instrumentation. Never included by the shipping plugin.
import assert from 'node:assert/strict';

const tick = key => `if(globalThis.__diag)globalThis.__diag.${key}=(globalThis.__diag.${key}||0)+1;`;
function replaceOnce(code, from, to) {
  assert.equal(code.split(from).length, 2, `Expected exactly one instrumentation target: ${from}`);
  return code.replace(from, to);
}

export function investigationPlugin() {
  return {
    name: 'diagnostic-runtime-counters',
    setup(api) {
      api.transform({ test: /(?:redact\/dist\/dom\/(?:reconcile|commit)\.js|react-dom[\\/]cjs[\\/]react-dom-client\.production\.js)$/ }, ({ code, resourcePath }) => {
        if (resourcePath.endsWith('/dom/reconcile.js')) {
          for (const [signature, key] of [
            ['function renderHost(fiber) {', 'renderHost'],
            ['function applyHostProps(el, props, prev, isSvg, isInput, isTextarea, deferValue) {', 'applyHostProps'],
          ]) code = replaceOnce(code, signature, `${signature}${tick(key)}`);
          const selection = 'const boundary = root.eb && findErrorBoundary(fiber);';
          code = replaceOnce(code, selection, `${selection}if(globalThis.__diag&&boundary){${tick('errorBoundarySelections')}globalThis.__diag.boundarySource=String(boundary.type).slice(0,800);}`);
        } else if (resourcePath.endsWith('/dom/commit.js')) {
          for (const [signature, key] of [
            ['function checkpointCommit(fiber) {', 'checkpointCommit'],
            ['function rememberFiber(fiber) {', 'rememberFiber'],
          ]) code = replaceOnce(code, signature, `${signature}${tick(key)}`);
        } else {
          const start = code.indexOf('function getHostSibling(fiber) {');
          const end = code.indexOf('function insertOrAppendPlacementNodeIntoContainer(', start);
          assert.ok(start >= 0 && end > start);
          let fragment = code.slice(start, end);
          fragment = replaceOnce(fragment, 'function getHostSibling(fiber) {', `function getHostSibling(fiber) {${tick('getHostSibling')}`);
          fragment = replaceOnce(fragment, 'fiber.sibling.return = fiber.return;', `${tick('hostSiblingSteps')}fiber.sibling.return = fiber.return;`);
          code = code.slice(0, start) + fragment + code.slice(end);
        }
        return { code };
      });
    },
  };
}
