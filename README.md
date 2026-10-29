# rsbuild-redact-plugin

让 Rsbuild 和 Modern.js 应用使用 [TanStack Redact](https://github.com/TanStack/redact) 运行现有 React 组件，保留 React import、JSX 和 Fast Refresh。

插件在构建阶段映射运行时入口，提供 ESM、CommonJS 和 TypeScript 声明。**默认仅启用客户端渲染（CSR）**，可通过 `ssr: true` 实验性启用服务端运行时映射，属于独立集成项目。

## 安装

```sh
npm install @tanstack/redact@~0.2.1
npm install -D rsbuild-redact-plugin
```

需要 React 19、Rsbuild `^2.2.13`、Node `^20.19.0 || >=22.12.0`。保留应用原有的 `react`、`react-dom` 和对应框架依赖。

## Rsbuild

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [pluginReact(), pluginRedact()],
});
```

`pluginReact` 继续处理 JSX 和 Fast Refresh，`pluginRedact` 将 React 相关入口映射到应用安装的 Redact。

## Modern.js

```ts
import { appTools, defineConfig } from '@modern-js/app-tools';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [appTools()],
  builderPlugins: [pluginRedact()],
  server: { ssr: false },
});
```

## 选项

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用插件 |
| `resolveFrom` | 项目根目录 | 从指定目录解析应用依赖 |
| `environments` | 符合条件的浏览器环境，`ssr: true` 时包含服务端 | 限定环境名；SSR 时需同时包含客户端和服务端 |
| `ssr` | `false` | 实验性为 Node、Worker 等服务端环境应用相同的 Redact 运行时映射 |
| `viewTransitions` | `false` | 启用 Redact 实验性原生 ViewTransition 动画 |

## JS 体积

2026-10-27，在相同的生产 CSR 测试页面中，全部浏览器 JS 逐文件 gzip 后的总量如下（包含懒加载和路由块）：

| 框架 | React | Redact | 减少 |
| --- | ---: | ---: | ---: |
| Rsbuild | 71.24 KB | 25.17 KB | 64.7% |
| Modern.js | 110.46 KB | 65.50 KB | 40.7% |

这是测试页面的历史记录，不代表首屏下载量或所有应用的收益。交互性能取决于任务，详见 [交互耗时与源码原因](https://github.com/zllkjc/rsbuild-redact-plugin/blob/main/docs/performance.md)。

## 支持范围

已验证 state、Context、受控输入、keyed DOM 复用、lazy/Suspense、Portal、Modern.js 路由和状态保留热更新。

默认仍拒绝同一构建中的浏览器/Node 混合环境。需要 SSR 时，可在浏览器和服务端构建中使用 `pluginRedact({ ssr: true })`，让 Node、Worker 与浏览器共享相同的运行时映射，避免原生 React 服务端与 Redact 客户端混用。独立服务端构建也需要启用此选项；如使用 `environments`，请同时包含客户端和服务端环境名。

此选项仅统一构建时的运行时映射，不修复 Redact 自身的 SSR 实现。Redact 0.2.1 的 Streaming SSR 存在 Suspense 下 `useId` 不一致、带 `identifierPrefix` 的后续挂载产生重复 ID，以及表格和 SVG/MathML 中分段标记不正确等问题；流式 SSR 的正确性取决于 Redact 对应修复，启用前请确认所用版本或补丁已包含这些修复。
相关修复：[TanStack/redact#102](https://github.com/TanStack/redact/pull/102)（`useId`）、[TanStack/redact#103](https://github.com/TanStack/redact/pull/103)（表格与 SVG/MathML 插入上下文）、[TanStack/redact#104](https://github.com/TanStack/redact/pull/104)（带前缀的分段 ID）。

仍不支持 RSC 或 Server Actions；插件始终跳过 RSC 命名环境及包含 `react-server` 解析条件的环境。

Redact 仍处于实验阶段，并发渲染行为不能视为与 React 等价。依赖 React 内部实现的库、React Compiler 输出需单独验证。

## 示例与开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --dir examples/rsbuild dev
# 或运行 Modern.js 示例
pnpm --dir examples/modern dev
```

示例默认使用 Redact，在命令前添加 `RUNTIME=react` 可切换原生 React。

功能验证：`pnpm test`、`pnpm typecheck`、`pnpm test:browser`、`pnpm test:dev`、`pnpm test:package`。浏览器测试前运行 `pnpm exec playwright install chromium`；按顺序执行，热更新测试会临时编辑示例并还原。

[MIT](./LICENSE)
