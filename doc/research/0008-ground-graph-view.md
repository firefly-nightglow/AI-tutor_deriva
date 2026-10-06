# GROUND-0008: 单对话链路图的渲染与布局

**Status:** recorded
**Decision:** 用 @xyflow/react（React Flow 12）渲染可缩放、可平移的节点图，用 @dagrejs/dagre 做树布局；布局在纯函数里完成（输入对话列表与根 id，输出 React Flow 的 nodes/edges），因此可脱离 DOM 测试；节点点击复用既有的 showConversation 打开对应面板；视图在 App 头部切换（对话视图 / 链路图），链路图只画当前主对话的子树（全局跨对话图按 PRD 推迟到 v3）。
**Decision ref:** doc/tasks/0008-graph-view.md
**Confidence:** Strong

## Decision and confidence

Happy path：React Flow 官方文档明确说明**它自身不提供布局**（We have not implemented our own layouting solution yet, but will present some viable external libraries），并按复杂度把可选方案排开：dagre 基本是 drop-in，elkjs 是全功能可配置的布局引擎（A1）。因此渲染交给 React Flow、布局交给 dagre，是官方推荐的组合，而不是自造。dagre 侧用 `@dagrejs/dagre`（3.1.1，包描述为 Graph layout for JavaScript，B1）：建图 → 设 `rankdir: 'TB'` → 逐节点设尺寸 → 逐边连接 → 布局 → 取回中心坐标转成 React Flow 的左上角坐标。

把布局逻辑放进纯函数（lib/graphLayout.ts）而不是组件里，理由与 GROUND-0003 一致：树的形状、节点数量、边的连通性都能用单元测试断言，而 React Flow 在 jsdom 里没有尺寸、渲染断言价值很低。布局只依赖数据，不依赖 DOM。

一处具名偏离：

1. **不引入 elkjs**。A1 把 elkjs 描述为「full-blown highly configurable」的方案，而本任务要画的是一棵普通树（单根、无环、无子流程），dagre 的默认分层布局足够；elkjs 的配置面与包体积换不来本任务需要的能力。若将来要画跨主对话的全局图（v3）或在节点内含子流程，再回到 A1 评估。另注意 A1 记录的 dagre 已知限制（子流程内节点连到子流程外时布局不正确）——本任务的图没有 sub-flow，不受影响。

Axis-2 verdict: Strong。官方文档直接给出「React Flow + 外部布局库」这一结构并点名 dagre；布局作为纯函数可测；唯一的取舍（不用 elkjs）有官方对两者定位的描述支撑。

## Evidence

### E1 — React Flow 不负责布局，官方推荐接外部布局库

**Strength:** High
**Provenance:** A1

A1 原文：We regularly get asked how to handle layouting in React Flow. We have not implemented our own layouting solution yet, but will present some viable external libraries on this page；并在同一页把 dagre 与 elkjs 并列，说明 We've loosely ordered these options from simplest to most complex, where dagre is largely a drop-in solution and elkjs is a full-blown highly configurable layouting engine。这直接决定本任务的结构：React Flow 负责交互与渲染，布局交给第三方。

### E2 — dagre 是这次够用的布局引擎

**Strength:** Medium
**Provenance:** A1, B1

B1（@dagrejs/dagre 3.1.1，包描述 Graph layout for JavaScript）提供分层图布局；A1 把它列为最简方案，并记录其已知限制在于 sub-flow。本任务的图是单根树、无 sub-flow、无环，正好落在 dagre 的适用范围内。强度记 Medium：这是对适用范围的判断，真实观感仍需实操确认。

### E3 — 仓库内已有可复用的树数据与面板联动

**Strength:** High
**Provenance:** C1, C2

C1：`conversations.listAll()` 返回全部对话（含子对话），`lib/grouping.ts` 已有 `ancestorIds` / `depthOf` 等按父子关系遍历的工具，链路图的节点与该主对话的子树可以直接由这些数据算出，不需要新的 IPC 或查询。C2：多栏面板的打开动作已经收敛为 `showConversation(id)`（GROUND-0007），节点点击复用它即可实现「点击节点跳转对应对话（与多栏面板联动打开）」。

### E4 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，属可复现的 no prior attempt found。

## Source register

- **A1:** React Flow 官方文档 Layouting，说明其自身不实现布局、dagre 为最简 drop-in 方案、elkjs 为全功能方案，以及 dagre 的 sub-flow 限制，https://reactflow.dev/learn/layouting/layouting (accessed 2026-10-04 via curl fetch of official docs page)
- **B1:** @dagrejs/dagre 3.1.1，npm registry 元数据（描述 Graph layout for JavaScript），https://www.npmjs.com/package/@dagrejs/dagre (accessed 2026-10-04 via curl fetch of registry.npmjs.org)
- **C1:** 仓库内 `src/main/db/repositories/conversations.ts` 的 `listAll()` 与 `src/renderer/src/lib/grouping.ts` 的父子遍历工具 (accessed 2026-10-04 via local shell)
- **C2:** 仓库内 `src/renderer/src/App.tsx` 的 `showConversation(id)` 面板打开逻辑与多栏 `openIds` 状态 (accessed 2026-10-04 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-04 via local shell)

## Limitations and reversal

本记录不能证明：300 节点下 React Flow 的交互帧率是否达标（验收里 NFR-4 要求流畅，需要在真实数据上实测；React Flow 对可视区域外的节点是否裁剪需按其 API 文档确认并用性能记录验证）；dagre 的分层布局在深而窄的对话树（例如 5 层单链）下图幅是否过窄或过宽，需要走查调 `nodesep`/`ranksep`。反转条件：若 300 节点实测不流畅，则启用 React Flow 的可视区域裁剪或按子树懒加载（任务里已列为待办）；若 dagre 的分层结果不适合树形阅读，则改用 d3-hierarchy（A1 同页列出的另一方案）。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0008-ground-graph-view.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
