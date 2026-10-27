import { readFile, writeFile } from 'node:fs/promises';

const build = JSON.parse(await readFile(new URL('../benchmarks/build-results.json', import.meta.url), 'utf8'));
const browser = JSON.parse(await readFile(new URL('../benchmarks/browser-results.json', import.meta.url), 'utf8'));
const percent = (a, b) => `${(100 * (b / a - 1)).toFixed(1)}%`;
const sizeRows = Object.entries(build.results).map(([name, { react, redact }]) =>
  `| ${name} | ${(react.raw / 1000).toFixed(1)} → ${(redact.raw / 1000).toFixed(1)} KB | ${(react.gzip / 1000).toFixed(2)} → ${(redact.gzip / 1000).toFixed(2)} KB | ${percent(react.gzip, redact.gzip)} | ${(react.brotli / 1000).toFixed(2)} → ${(redact.brotli / 1000).toFixed(2)} KB |`,
).join('\n');
const buildRows = Object.entries(build.results).map(([name, { react, redact }]) =>
  `| ${name} | ${react.medianBuildMs.toFixed(1)} ms | ${redact.medianBuildMs.toFixed(1)} ms | ${percent(react.medianBuildMs, redact.medianBuildMs)} |`,
).join('\n');
const labels = { medianCounterMs: '20 次同步计数更新', medianReverseMs: '20 次 1,000 行列表反转', medianClickCommitMs: '单次点击处理开始到 DOM 提交' };
const runtimeRows = Object.entries(browser.results).flatMap(([name, { react, redact }]) =>
  Object.entries(labels).map(([key, label]) => `| ${name} / ${label} | ${react[key].toFixed(2)} ms | ${redact[key].toFixed(2)} ms | ${percent(react[key], redact[key])} |`),
).join('\n');

const report = `# Rsbuild / Modern.js：React 与 Redact 实测

测试日期：2026-10-27。插件版本：0.1.0。**发布范围为 CSR，SSR 未通过兼容验证。**

最确定的收益是浏览器下载体积减少。渲染耗时取决于具体任务，不能把体积收益解释为所有交互更快。Redact 采用同步渲染，没有 React 的并发调度、时间切片和可中断渲染。

## 环境与方法

- 机器：${build.system.cpu}，${build.system.platform}/${build.system.arch}，Node ${build.system.node}。
- React / ReactDOM ${build.versions.react}；Redact ${build.versions['@tanstack/redact']}；Rsbuild ${build.versions['@rsbuild/core']}；Modern.js ${build.versions['@modern-js/app-tools']}（内部使用 Rsbuild 2.2.13）；Chromium ${browser.browser}。
- 两组均使用生产构建、相同的共享页面、相同依赖和构建配置，只切换插件。两框架均为 CSR；Modern.js 额外包含文件路由。
- 页面包含 1,000 行 keyed 列表、state、memo + Context、受控表单、lazy/Suspense 与 Portal。插件使用默认功能配置，关闭上游实验性原生 ViewTransition 动画；没有使用删减语义的 nano 模式。
- 构建：关闭持久缓存，每个变体先预热一次，再交替执行 5 次独立 CLI 构建。表中是中位数；文件系统/操作系统缓存没有清空。耗时包含 CLI 启动。
- 体积：统计全部浏览器 JavaScript，包括懒加载模块和路由块；不含 HTML、CSS、source map、license 文本或服务端代码。各文件分别压缩后求和，KB = 1,000 bytes，不代表单页首屏实际下载量。
- 浏览器：同一 Chromium 进程，按相反顺序交替创建 7 组独立 context；每项先预热 5 个 batch，再采集 20 个 batch，每个 batch 完成 20 次 flushSync 更新。表中取每组中位数的中位数。另测每组 20 次实际点击的处理器开始到 layout effect 提交耗时。
- 浏览器未限速，只有一个机器和一种浏览器。没有做统计显著性检验，不把小差异当成确定收益。同步微基准不代表并发输入体验、首屏、绘制、INP、内存或服务端吞吐。

## 浏览器 JS 体积

箭头为 React → Redact，变化为 Redact 相对 React。

| 框架 | 原始 JS | gzip | gzip 变化 | Brotli |
| --- | --- | --- | --- | --- |
${sizeRows}

模块图检查确认：React 基线含原生 React，不含 Redact；Redact 变体含 Redact，不含原生 React/ReactDOM/scheduler。所有检查都会在不满足时终止脚本。

## 构建耗时

| 框架 | React 中位数 | Redact 中位数 | 变化 |
| --- | --- | --- | --- |
${buildRows}

这些微小示例的构建时间不足一秒，CLI 启动占比很大；不能由此推断大型项目的构建加速比例。

## 浏览器运行耗时

负数表示该任务耗时减少，正数表示增加。计数更新也会重新计算父组件中的 1,000 行列表，因此不是孤立的 useState 成本。

| 框架 / 任务 | React | Redact | 变化 |
| --- | --- | --- | --- |
${runtimeRows}

## 正确性与开发体验

- 两个框架 × 两个运行时 × 7 组生产浏览器检查通过：渲染、state、穿过 memo 的 Context、输入回显、keyed DOM 复用、懒加载/Suspense、Portal；无浏览器运行异常或 console error。
- Modern.js 额外通过客户端跳转、直接访问二级路由、返回首页；跳转保留窗口标记，确认没有整页刷新。
- 两个框架的 Redact 开发模式通过 Fast Refresh：修改组件标题后计数状态保留，窗口未刷新。
- TypeScript 类型检查、配置行为测试与独立 npm tarball 安装/构建验证均通过。

## SSR 尝试与明确限制

初始尝试采用原生 React SSR + Redact hydration。构建通过、HTML 包含完整列表、页面能交互，但服务端 DOM 被重建。useId 造成 label/htmlFor 不一致，加入上游 React ID 策略仍未解决。详见 [SSR 调查记录](./SSR-NOTES.md)。

因此发布版本只支持 CSR，检测到同一构建内混合浏览器和 Node 环境时直接报错。没有宣称 SSR、Streaming、Server Actions、RSC 或 React Compiler 全面兼容。SSR 失败实验不计入上面的 CSR 性能数字。

## 复现

${'```'}sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm exec playwright install chromium
pnpm bench
pnpm test:browser
pnpm test:dev
pnpm test:package
node scripts/report.mjs
${'```'}

按顺序执行；dev 测试会短暂编辑共享组件并在 finally 中还原。CI 使用缩小的轮数进行功能验证，不作为性能结论来源。

原始记录：[构建](./build-results.json)、[浏览器各组和每次采样](./browser-results.json)、[开发模式](./dev-results.json)。
`;
await writeFile(new URL('../benchmarks/REPORT.md', import.meta.url), report);
console.log(report);
