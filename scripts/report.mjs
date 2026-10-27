import { readFile, writeFile } from 'node:fs/promises';

const build = JSON.parse(await readFile(new URL('../benchmarks/build-results.json', import.meta.url), 'utf8'));
const browser = JSON.parse(await readFile(new URL('../benchmarks/browser-results.json', import.meta.url), 'utf8'));
const percent = (a, b) => `${(100 * (b / a - 1)).toFixed(1)}%`;
const sizeRows = Object.entries(build.results).map(([name, { react, redact }]) =>
  `| ${name} | ${(react.gzip / 1000).toFixed(2)} KB | ${(redact.gzip / 1000).toFixed(2)} KB | ${percent(react.gzip, redact.gzip)} |`,
).join('\n');
const labels = {
  medianCounterMs: '20 次同步计数更新',
  medianReverseMs: '20 次 1,000 行列表反转',
  medianClickCommitMs: '单次点击处理器开始到 layout effect',
};
const runtimeRows = Object.entries(browser.results).flatMap(([name, { react, redact }]) =>
  Object.entries(labels).map(([key, label]) => `| ${name} / ${label} | ${react[key].toFixed(2)} ms | ${redact[key].toFixed(2)} ms | ${percent(react[key], redact[key])} |`),
).join('\n');
const buildSummary = Object.entries(build.results).map(([name, { react, redact }]) =>
  `${name} ${react.medianBuildMs.toFixed(1)} → ${redact.medianBuildMs.toFixed(1)} ms`,
).join('；');

const report = `# 性能报告

同一份页面分别使用原生 React 和 Redact，测试日期为 ${browser.date.slice(0, 10)}。两套框架均采用生产 CSR 构建。

## 浏览器 JS 体积

统计全部浏览器 JS（包含懒加载与路由块）逐文件 gzip 后的总量，不代表首屏实际下载量。变化为 Redact 相对 React，负数表示减少。

| 框架 | React | Redact | 变化 |
| --- | ---: | ---: | ---: |
${sizeRows}

模块图检查确认：React 基线不含 Redact，Redact 构建不含原生 React/ReactDOM/scheduler。

## 交互耗时

| 框架 / 任务 | React | Redact | 变化 |
| --- | ---: | ---: | ---: |
${runtimeRows}

计数状态和列表位于同一个组件，计数更新会重新计算列表。每批 20 次更新分别使用 flushSync；点击计时结束于 useLayoutEffect 开始，不包含后续绘制，也不是 INP。

体积更小，完整反转更快，计数与点击更慢。三项差异的 React / Redact 实现解释见 [源码原因](./ANALYSIS.md)。

构建中位数为 ${buildSummary}，包含 CLI 启动。示例耗时不足一秒，小差异不足以推断大型项目的构建收益。

## 测试条件

- ${build.system.cpu}，${build.system.platform}/${build.system.arch}，Node ${build.system.node}，Chromium ${browser.browser}。
- React ${build.versions.react}、Redact ${build.versions['@tanstack/redact']}、Rsbuild ${build.versions['@rsbuild/core']}、Modern.js ${build.versions['@modern-js/app-tools']}。
- 页面包含 1,000 行 keyed 列表、Context、受控输入、lazy/Suspense 和 Portal；Modern.js 额外包含路由。
- 关闭持久构建缓存。构建预热后交替执行 5 次；浏览器每个变体测 7 个独立 context，每项预热 5 批、采集 20 批，另测 20 次点击。表中为各组中位数的中位数。
- 单机、单浏览器、未 CPU 限速，没有统计显著性检验；结果不能推广为所有应用的性能保证。

## 复现

安装锁文件依赖后，按顺序运行：

${'```'}sh
pnpm build
pnpm exec playwright install chromium
pnpm bench
pnpm test:browser
node scripts/report.mjs

# 单独复现源码归因实验
node scripts/investigate.mjs
${'```'}

不要并行执行开发模式测试：它会临时编辑共享组件，开发构建也可能覆盖示例的生产输出。CI 使用缩减轮数验证功能，不作为性能结论来源。

原始数据：[构建及体积](./build-results.json)、[浏览器采样](./browser-results.json)、[归因实验](./investigation-results.json)。功能与开发验证见 [开发记录](../DEVELOPMENT.md)，SSR 限制见 [SSR 记录](./SSR-NOTES.md)。
`;
await writeFile(new URL('../benchmarks/REPORT.md', import.meta.url), report);
console.log('Updated benchmarks/REPORT.md');
