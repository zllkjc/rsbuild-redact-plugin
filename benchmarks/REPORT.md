# 性能报告

同一份页面分别使用原生 React 和 Redact，测试日期为 2026-10-27。两套框架均采用生产 CSR 构建。

## 浏览器 JS 体积

统计全部浏览器 JS（包含懒加载与路由块）逐文件 gzip 后的总量，不代表首屏实际下载量。变化为 Redact 相对 React，负数表示减少。

| 框架 | React | Redact | 变化 |
| --- | ---: | ---: | ---: |
| rsbuild | 71.24 KB | 25.17 KB | -64.7% |
| modern | 110.46 KB | 65.50 KB | -40.7% |

模块图检查确认：React 基线不含 Redact，Redact 构建不含原生 React/ReactDOM/scheduler。

## 交互耗时

| 框架 / 任务 | React | Redact | 变化 |
| --- | ---: | ---: | ---: |
| rsbuild / 20 次同步计数更新 | 3.60 ms | 6.80 ms | 88.9% |
| rsbuild / 20 次 1,000 行列表反转 | 20.40 ms | 10.20 ms | -50.0% |
| rsbuild / 单次点击处理器开始到 layout effect | 0.40 ms | 0.70 ms | 75.0% |
| modern / 20 次同步计数更新 | 3.60 ms | 11.30 ms | 213.9% |
| modern / 20 次 1,000 行列表反转 | 20.70 ms | 16.10 ms | -22.2% |
| modern / 单次点击处理器开始到 layout effect | 0.40 ms | 1.40 ms | 250.0% |

计数状态和列表位于同一个组件，计数更新会重新计算列表。每批 20 次更新分别使用 flushSync；点击计时结束于 useLayoutEffect 开始，不包含后续绘制，也不是 INP。

体积更小，完整反转更快，计数与点击更慢。三项差异的 React / Redact 实现解释见 [源码原因](./ANALYSIS.md)。

构建中位数为 rsbuild 275.2 → 260.7 ms；modern 934.3 → 904.2 ms，包含 CLI 启动。示例耗时不足一秒，小差异不足以推断大型项目的构建收益。

## 测试条件

- Apple M5 Pro，darwin/arm64，Node v24.21.0，Chromium 156.0.8078.4。
- React 19.3.1、Redact 0.2.1、Rsbuild 2.2.14、Modern.js 3.10.3。
- 页面包含 1,000 行 keyed 列表、Context、受控输入、lazy/Suspense 和 Portal；Modern.js 额外包含路由。
- 关闭持久构建缓存。构建预热后交替执行 5 次；浏览器每个变体测 7 个独立 context，每项预热 5 批、采集 20 批，另测 20 次点击。表中为各组中位数的中位数。
- 单机、单浏览器、未 CPU 限速，没有统计显著性检验；结果不能推广为所有应用的性能保证。

## 复现

安装锁文件依赖后，按顺序运行：

```sh
pnpm build
pnpm exec playwright install chromium
pnpm bench
pnpm test:browser
node scripts/report.mjs

# 单独复现源码归因实验
node scripts/investigate.mjs
```

不要并行执行开发模式测试：它会临时编辑共享组件，开发构建也可能覆盖示例的生产输出。CI 使用缩减轮数验证功能，不作为性能结论来源。

原始数据：[构建及体积](./build-results.json)、[浏览器采样](./browser-results.json)、[归因实验](./investigation-results.json)。功能与开发验证见 [开发记录](../DEVELOPMENT.md)，SSR 限制见 [SSR 记录](./SSR-NOTES.md)。
