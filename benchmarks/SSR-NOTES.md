# SSR 兼容性记录

本次测试使用 Modern.js 3.10.3、React 19.3.1 和 Redact 0.2.1。

## 尝试与结果

服务端保留原生 React，浏览器改用 Redact。生产构建通过，HTML 包含完整列表，页面可以交互；但 hydration 后服务端 DOM 被重建，未通过节点复用检查。

错误定位到 `useId` 生成的 label/input 关联：服务端得到 `_modern-js-R_4l_`，Redact 首次 hydration 得到 `_modern-js-R_15_`，触发 `htmlFor` 不一致。尝试上游的 `identifierStrategy: 'react'` 后仍未解决，临时适配代码没有保留。

## 当前处理

0.1.0 仅支持 CSR。同一次配置中出现浏览器和 Node 构建时，插件直接报错；独立构建的服务端无法完全检测，也不属于支持范围。

```sh
pnpm build
SSR=1 pnpm --dir examples/modern build
# 预期报错：This release supports client-side rendering only.
```

该结论针对本次页面，不代表所有 Redact hydration 场景都失败。后续恢复 SSR 支持，需要实际修复并验证 DOM 复用、useId、流式渲染和导航。性能报告中的两边均为 CSR。
