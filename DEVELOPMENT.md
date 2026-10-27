# 开发记录

## 目标与实现

本次开发将 TanStack Redact 接入 Rsbuild，并在 Modern.js 中复用同一个插件。应用继续使用 React 的组件写法和 import，替换发生在构建阶段。

插件采用精确入口映射，覆盖 React、ReactDOM、JSX runtime、scheduler 等，并统一直接 Redact import 的解析路径，避免加载两份运行时。默认关闭上游实验性 ViewTransition 动画，保留 Context、Suspense 和 class 等功能；未使用删减语义的 nano 模式。

## 产物

| 位置 | 内容 |
| --- | --- |
| [src/index.ts](./src/index.ts) | 插件实现与选项类型 |
| [examples/rsbuild](./examples/rsbuild)、[examples/modern](./examples/modern) | 两套可运行示例，共用同一份测试页面 |
| [tests](./tests)、[scripts](./scripts) | 配置、浏览器、热更新、包安装验证和性能实验 |
| [benchmarks](./benchmarks) | 测试报告、源码归因和原始采样 |
| [CI](./.github/workflows/ci.yml) | Node 22/24 的自动验证流程 |

`pnpm build` 生成 ESM、CommonJS 和类型声明；`npm pack` 生成 `rsbuild-redact-plugin-0.1.0.tgz`。构建目录和压缩包不纳入 Git，可从源码生成。**当前未发布 npm。**

## 验证与取舍

本地通过了配置测试、类型检查、两套生产示例的浏览器交互验证、状态保留热更新，以及独立项目中的 tarball 安装和构建验证。

SSR 曾尝试保留原生 React 服务端、替换浏览器运行时。构建和页面交互成功，但 `useId` 不匹配导致 hydration 重建服务端 DOM，因此最终限定为 CSR。详见 [SSR 记录](./benchmarks/SSR-NOTES.md)。

性能对比使用生产 CSR 构建和相同页面，关闭示例的持久构建缓存，并检查模块图，确保两边分别只加载目标运行时。后续通过独立插桩构建和拆分实验定位了交互差异，没有修改 Redact 依赖源码或插件的运行时行为。

## 结论与后续

体积收益明确；渲染耗时取决于更新方式。列表反转的收益来自插入位置查找，计数和点击的额外开销来自排列检查及错误边界快照。数字和实现解释分别保存在 [性能报告](./benchmarks/REPORT.md) 与 [源码原因](./benchmarks/ANALYSIS.md)。

后续优化优先关注 Redact 的无变化 placement 跳过与回滚快照范围；SSR 需要修复 ID 兼容并验证 DOM 复用后再考虑支持。当前没有实施这些运行时优化。
