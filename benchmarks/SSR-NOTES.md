# Modern.js SSR investigation

Tested on 2026-10-27 with Modern.js 3.10.3, React 19.3.1 and Redact 0.2.1 (upstream source inspected at `20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff`).

The initial integration kept the Node environment on native React and replaced only browser imports. The Modern.js fixture used `server.ssr: true`. Both variants built successfully, and all eight emitted server JavaScript bundles were byte-identical. HTML responses contained all 1,000 rows.

However, a browser test captured the server-rendered counter node before hydration and compared it with the hydrated node. Native React preserved it; Redact replaced it. The page looked correct and interactive, so a screenshot or a successful build alone would have missed this failure.

The detailed development diagnostic was `Hydration mismatch on <label> for "htmlFor".` The shared component uses `useId` to connect a label and input. We also tried a small `react-dom/client` adapter forwarding `identifierStrategy: 'react'`, as used by Redact's upstream native React server integrations. In this fixture, the server generated `_modern-js-R_4l_`, while Redact's initial hydration generated `_modern-js-R_15_`. Recovery then rendered `_modern-js-r_0_` and replaced the server DOM. That adapter did not resolve the problem and is not shipped.

This establishes an incompatibility for the tested tree; it does not establish that every Redact hydration scenario fails, or that a general ID-mapping workaround would be correct. The plugin does not patch framework internals, suppress the mismatch, or claim SSR compatibility.

Version 0.1 therefore supports **CSR only** and rejects eligible browser builds when the same normalized Rsbuild configuration also has a Node target. Server-only and excluded RSC environments are left unchanged. Independently built servers cannot always be detected; do not use this version for SSR applications.

To exercise the guard:

```sh
pnpm build
SSR=1 pnpm --dir examples/modern build
# Expected: build fails with "This release supports client-side rendering only."
```

The published size/performance comparison uses CSR in **both** runtime variants and is not an SSR benchmark. Restoring SSR support requires a real compatibility fix plus DOM reuse, `useId`, streaming and navigation regression tests.
