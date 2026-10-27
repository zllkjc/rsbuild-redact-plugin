# rsbuild-redact-plugin

让 Rsbuild 和 Modern.js 应用使用 [TanStack Redact](https://github.com/TanStack/redact) 运行现有 React 组件，保留 React import、JSX 和 Fast Refresh。

**当前版本 0.1.0，仅支持客户端渲染（CSR），尚未发布 npm。** 这是独立集成项目。Redact 仍处于实验阶段，需要按应用验证兼容性。

## 做了什么

- 在构建阶段将 React、ReactDOM、JSX runtime 等入口精确映射到应用安装的 Redact，不引入额外的浏览器适配层。
- 支持 Rsbuild 插件配置和 Modern.js 的 `builderPlugins`；提供两套可运行示例。
- 提供 ESM、CommonJS 和 TypeScript 声明，以及功能测试、包安装验证和性能对比脚本。

开发过程与产物见 [开发记录](./DEVELOPMENT.md)。

## 本地运行

需要 Node `^20.19.0 || >=22.12.0`、pnpm 10。插件要求 React 19、Rsbuild `^2.2.13` 和 Redact `~0.2.1`。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --dir examples/rsbuild dev
# 或运行 Modern.js 示例
pnpm --dir examples/modern dev
```

示例默认使用 Redact。对比原生 React：

```sh
RUNTIME=react pnpm --dir examples/rsbuild dev
RUNTIME=react pnpm --dir examples/modern dev
```

在其他项目试用时，先在本仓库执行 `npm pack`，再安装生成的包：

```sh
npm install @tanstack/redact@~0.2.1
npm install -D /path/to/rsbuild-redact-plugin-0.1.0.tgz
```

保留应用原有的 `react`、`react-dom` 和对应框架依赖。

## 接入配置

**Rsbuild**：`pluginReact` 继续负责 JSX 和 Fast Refresh。

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [pluginReact(), pluginRedact()],
});
```

**Modern.js**：使用 `builderPlugins`，关闭 SSR。

```ts
import { appTools, defineConfig } from '@modern-js/app-tools';
import { pluginRedact } from 'rsbuild-redact-plugin';

export default defineConfig({
  plugins: [appTools()],
  builderPlugins: [pluginRedact()],
  server: { ssr: false },
});
```

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用插件 |
| `resolveFrom` | 项目根目录 | 从指定目录解析应用依赖 |
| `environments` | 符合条件的浏览器环境 | 限定环境名，例如 `web` 或 `client` |
| `viewTransitions` | `false` | 启用 Redact 实验性原生 ViewTransition 动画 |

## 实测结论

同一份包含 1,000 行列表的页面，浏览器 JS gzip 总量在 Rsbuild 中减少 **64.7%**，在 Modern.js 中减少 **40.7%**。

交互性能取决于任务：完整列表反转更快，计数更新和点击到提交更慢。源码原因是 Redact 会检查未变化列表的排列顺序，而 Modern.js 的错误边界还会触发子树回滚快照；完整反转则避开了 React 反复寻找插入位置的开销。

具体数字见 [性能报告](./benchmarks/REPORT.md)，React 与 Redact 的实现差异见 [源码原因](./benchmarks/ANALYSIS.md)。

## 支持范围

已验证 state、Context、受控输入、keyed DOM 复用、lazy/Suspense、Portal，以及 Modern.js 路由和两套示例的状态保留热更新。

当前不支持 SSR、RSC、Streaming 或 Server Actions。Modern.js SSR 实验发现 `useId` 不一致导致服务端 DOM 被重建，因此插件拒绝同一构建中的浏览器/Node 混合环境。独立构建的服务端无法完全检测，也不属于支持范围。详见 [SSR 记录](./benchmarks/SSR-NOTES.md)。

Redact 的并发渲染行为不能视为与 React 等价；依赖 React 内部实现的库、React Compiler 输出仍需单独验证。更小的包体积不代表所有交互更快。

## 验证

```sh
pnpm test
pnpm typecheck
pnpm exec playwright install chromium
pnpm bench
pnpm test:browser
pnpm test:dev
pnpm test:package
```

按顺序运行；开发模式测试会临时修改示例并还原。完整复现说明见 [性能报告](./benchmarks/REPORT.md#复现)。

[MIT](./LICENSE)
