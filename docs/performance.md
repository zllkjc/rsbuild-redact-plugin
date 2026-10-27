# 交互耗时与源码原因

以下为 2026-10-27 的生产 CSR 测试记录：Apple M5 Pro、Chromium 156、React 19.3.1、Redact 0.2.1、Rsbuild 2.2.14、Modern.js 3.10.3。两边使用相同的 1,000 行列表页面，Modern.js 额外包含路由。

## 交互耗时

| 任务 | Rsbuild React | Rsbuild Redact | Modern.js React | Modern.js Redact |
| --- | ---: | ---: | ---: | ---: |
| 20 次同步计数更新 | 3.60 ms | 6.80 ms | 3.60 ms | 11.30 ms |
| 20 次 1,000 行列表反转 | 20.40 ms | 10.20 ms | 20.70 ms | 16.10 ms |
| 单次点击处理器开始到 layout effect | 0.40 ms | 0.70 ms | 0.40 ms | 1.40 ms |

每个变体使用 7 个独立浏览器 context；每项预热 5 批、采集 20 批，每批分别执行 20 次 flushSync 更新，另测 20 次点击。表中为各组中位数的中位数。点击计时不包含后续绘制，不等同于 INP；单机结果不能推广为所有应用的性能保证。

## 计数更新为什么慢

React 用 `Placement` 标记新增或需要移动的节点，提交时只对带标记的节点执行位置操作。

Redact 的 `renderChildChain` 每次登记 `queuePlacement`，再由 `commitPlacements` 收集子 DOM、检查排列顺序。本例的计数和列表位于同一组件，即使列表位置没变，计数更新仍会触发 999 次列表顺序检查。这是额外开销，不代表 React 跳过了整个列表的协调。

## 完整列表反转为什么快

React 的 `getHostSibling` 向后寻找不需要移动的节点作为插入参照。完整反转时，后续节点几乎都有 `Placement` 标记，导致反复扫描，这条查找路径呈 O(n²) 增长。

Redact 的 `placeDomsInOrder` 从目标数组末尾向前处理，直接使用下一个目标 DOM 作为参照。单次反转两边都移动 999 个 DOM，但 React 额外进行了 498,501 次兄弟 fiber 扫描，Redact 进行了 999 次列表 DOM 顺序检查。收益来自定位成本，不能推广成所有列表操作都同样更快。

## 点击到提交为什么慢

点击计数沿用上面的更新路径。Modern.js 路由中的错误边界还会增加回滚准备成本。

React 通过 `current / workInProgress` Fiber 保留当前状态并计算待提交状态。Redact 更新已有 Fiber；遇到祖先错误边界时，先通过 `checkpointCommit → walkRetained → rememberFiber` 遍历、复制待更新子树的 Fiber 和 hooks 等状态，供失败时回滚。正常更新也需要这次遍历和对象分配。

单次更新，Rsbuild 示例保存 4 个内部节点的快照，Modern.js 保存 2,039 个。给普通 Rsbuild 示例增加错误边界，也复现了接近 Modern.js 的开销。快照发生在 memo 判断之前，仅加 memo 无法完全消除这部分成本。

## 源码依据

Redact 固定版本源码：[位置检查](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/reconcile.ts#L1173)、[插入位置处理](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/reconcile.ts#L434)、[回滚快照](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/commit.ts#L23)。React 对照为 `react-dom@19.3.1/cjs/react-dom-client.production.js` 中的 `commitReconciliationEffects`、`getHostSibling` 和 `createWorkInProgress`。

这些是历史采样及独立插桩验证的结论。性能实验脚本、原始采样 JSON 和示例中的计时埋点已移除，仓库只保留功能验证。
