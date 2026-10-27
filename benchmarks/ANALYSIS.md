# 三项交互耗时的源码原因

针对 React / ReactDOM **19.3.1**、Redact **0.2.1** 和本仓库的生产 CSR 示例。实测数字见 [性能报告](./REPORT.md)。

## 1. 计数更新为什么慢

**React** 在协调时用 `Placement` 标记新增或需要移动的节点，`commitReconciliationEffects` 只对带标记的节点执行位置操作。

**Redact** 的 `renderChildChain` 每次都会登记 `queuePlacement`；`commitPlacements` 再收集子 DOM，由 `placeDomsInOrder` 检查排列顺序。即使节点位置没变，也会做这项检查。

本例的计数和 1,000 行列表处于同一组件，计数变化会重新创建列表元素。因此 Redact 每次计数更新还会执行 999 次列表顺序检查。这是 React 在此场景中没有的额外工作，不代表 React 跳过了整个列表的协调。

## 2. 完整列表反转为什么快

**React** 的 `getHostSibling` 向后扫描，寻找没有 `Placement` 标记的节点作为插入参照。完整反转时，后面的节点几乎全部需要移动，导致反复扫描，这条查找路径呈 O(n²) 增长。

**Redact** 的 `placeDomsInOrder` 从目标数组末尾向前处理，直接使用目标数组中的下一个 DOM 作为位置参照，避免上述重复扫描。

单次反转中，两者都移动 999 个 DOM 节点；React 额外进行了 498,501 次兄弟 fiber 扫描，Redact 进行了 999 次列表 DOM 顺序检查。收益来自寻找位置的成本差异，不能推广成所有列表操作都同样更快。

## 3. 点击到提交为什么慢

点击计数走的仍是第 1 项更新路径。Modern.js 还增加了一项成本：路由带有错误边界。

**React** 通过 `current / workInProgress` Fiber 保留当前状态、计算待提交状态，不需要因为祖先存在错误边界，就额外预存整棵待更新子树的回滚快照。

**Redact** 更新已有 Fiber。`renderUpdates` 找到祖先错误边界后，会先执行 `checkpointCommit → walkRetained → rememberFiber`，遍历并复制待更新子树的 Fiber、hooks 等状态，以便失败时回滚。正常更新也要付出这次遍历和对象分配。

单次更新中，Rsbuild 示例保存 4 个内部节点的快照，来自已加载的 lazy/Suspense 小子树；Modern.js 保存 2,039 个，增加的部分来自 App 子树。这解释了 Modern.js 的额外耗时，也抵消了部分反转收益。

## 对照验证

下表是独立补充实验的中位数，单位 ms；与原报告分开采样。

| Redact 场景 | 20 次计数更新 | 单次点击 |
| --- | ---: | ---: |
| Rsbuild 原页面 | 6.90 | 0.80 |
| 将列表提取为 memo 组件 | 0.90 | 0.20 |
| 原页面外层增加错误边界 | 11.10 | 1.40 |
| Modern.js 原页面 | 11.40 | 1.30 |

加 memo 验证了重复处理列表的影响；给 Rsbuild 加错误边界复现了 Modern.js 的开销。快照发生在 memo 判断之前，因此 memo 不能完全消除错误边界带来的成本。

计时点是点击处理器开始到 `useLayoutEffect` 开始，包含更新调度，不包含后续绘制，不能等同于 INP。实验也没有量化 GC 或各函数的独占耗时。

## 依据与复现

Redact 对应实现见固定源码版本的 [位置处理](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/reconcile.ts#L1173)、[反转处理](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/reconcile.ts#L434) 和 [回滚快照](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/dom/commit.ts#L23)。React 对照为安装包 `react-dom@19.3.1/cjs/react-dom-client.production.js` 中的 `commitReconciliationEffects`、`getHostSibling` 和 `createWorkInProgress`。

执行 `pnpm build && node scripts/investigate.mjs`：12 个生产变体各测 5 组，另用 4 个插桩构建记录调用次数。插桩构建不参与计时。结果保存在 [investigation-results.json](./investigation-results.json)，脚本见 [investigate.mjs](../scripts/investigate.mjs) 和 [investigation-plugin.mjs](../scripts/investigation-plugin.mjs)。
