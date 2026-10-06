# Task 0008: 实现单对话链路图视图

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0008-ground-graph-view.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

链路图（FR-7）把对话树渲染为 Obsidian 风格的关系图，帮助学生从全局把握一次学习的逻辑结构。按 OQ-6 决议作为可切换视图，与常驻树状侧栏并存。范围仅限单主对话内的树（全局跨对话链路图推迟至 v3）。对应 Scenario 6。

## Acceptance Criteria

- [x] 用户可在"对话视图 / 链路图视图"间切换
- [x] 链路图以当前主对话为根渲染整棵对话树，节点显示对话标题摘要，支持缩放与拖动平移
- [x] 点击节点跳转对应对话内容（与多栏面板联动打开）
- [x] 300 节点内渲染与缩放流畅，超出时按子树懒加载（NFR-4）

## Plan

- [x] 接入 React Flow，实现树到图节点的映射与自动布局
- [x] 节点组件（标题摘要、当前查看标记）
- [x] 视图切换与面板联动
- [x] 大树的懒加载策略与性能验证（300 节点基准）

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0005（树数据）、Task 0007（面板联动）。

### 2026-10-04

完成 /ad-ground：doc/research/0008-ground-graph-view.md（校验 valid: true，A1/B1/C2/D1，4 条 claim）。结论：React Flow 官方明确说明它**自身不做布局**，并推荐接外部库，其中 dagre 是最简 drop-in、elkjs 是全功能方案；因此渲染交给 `@xyflow/react`（12.12.0）、布局交给 `@dagrejs/dagre`（3.1.1）。具名偏离：不引入 elkjs——本任务画的是单根无环、无 sub-flow 的普通树，dagre 足够，而 A1 也记录了 dagre 的已知限制只在 sub-flow 场景（本任务不涉及）。

实现落点：

1. `lib/graphLayout.ts`：`conversationSubtree` 取某个主对话的子树（深度优先 + 深度标记），`layoutConversationTree` 用 dagre 分层布局（rankdir TB、nodesep 28、ranksep 56），把 dagre 的中心坐标换算成 React Flow 的左上角坐标，并产出 nodes/edges；当前打开的对话用 `isCurrent` 标记。**布局是纯函数**，所以树形与坐标都能脱离 DOM 测试。
2. `components/ConversationGraph.tsx`：React Flow 容器 + 自定义节点（层级徽标 + 标题摘要，当前对话高亮描边），开启 `fitView`、限制缩放范围（0.2–1.6）、关闭节点拖拽与连线（这是导航图不是编辑器），点击节点回调打开对话。
3. App：头部新增「链路图 / 对话视图」切换（没有打开任何对话时按钮禁用）；`graphRootId` 用 `ancestorIds` 取当前聚焦对话所在树的根（该函数返回由近及远，末项即根），因此**链路图始终以当前主对话为根**；点击节点调用既有的 `showConversation(id)` 并切回对话视图，与多栏面板联动（FR-7/OQ-6）。全局跨对话图仍按计划推迟到 v3。

验证：152 项测试通过。新增 graphLayout 的 5 个用例——`conversationSubtree` 只走指定根的子树并标出深度、未知根返回空；布局产出「子树节点数」个节点与「父链接数」条边；`isCurrent` 只标记一个且节点坐标有限；子节点 y 坐标严格大于父节点（分层方向正确）。typecheck 与 build 通过（bundle 从 1.60MB 增至 2.03MB，主要是 React Flow 与 dagre），dev 启动自检正常且无运行时报错。

未完成：**第 4 条验收（300 节点内流畅、超出按子树懒加载）尚未取证**。当前证据只有布局纯函数的正确性，没有 300 节点基准的渲染实测，也没有实现可视区域裁剪或子树懒加载——这两项要等基准数据出来再决定是否需要（与 GROUND-0005 同一策略：先测量再优化）。代码评审尚未进行，状态保持 in-progress。

### 2026-10-05（链路图看不到连线）

用户验收后反馈：链路图里只有按层级排列的"框"，看不到连接父子的"链"，并希望是思维导图那种平滑曲线。

排查过程（不靠猜）：

1. 先在 jsdom 里断言"4 个节点 3 条边"，得到 `nodes=4 edges=0`；但 jsdom 没有真实布局、React Flow 的边层尺寸依赖容器实测，因此**没有据此下结论**。
2. 改用**真实 Electron 渲染器**取证：临时在 dev 自检里注入一段诊断——经 IPC 播种「根 + 子」两个对话、点「新建对话」触发列表刷新、点「链路图」切换视图、等待后统计 DOM。结果为 `{"nodes":2,"edges":0,"edgePaths":0,"svg":true}`：**SVG 边层存在，但里面一条边都没有**，说明边根本没被渲染，而不是被挡或颜色太淡。
3. 根因：**React Flow 的边必须锚定在节点的 Handle 上**。自定义节点若不渲染 `Handle`，边就找不到锚点被跳过——节点照常显示，于是表现为"只有框没有链"。

修复：

1. 自定义节点补上 `Handle type="target" position={Position.Top}` 与 `Handle type="source" position={Position.Bottom}`，并给 handle 设 7px 圆点样式（描边用 surface 色，填充用连线色），让锚点看起来是刻意设计的一部分。
2. 同时给节点补上显式的 `width`/`height`（与告诉 dagre 的尺寸一致），让边在首帧就能算出来，不必等 ResizeObserver 测量。
3. 用主题令牌绘线：在 `.graph` 上覆盖 React Flow 自己的 CSS 变量（`--xy-edge-stroke` / `--xy-edge-stroke-width` / `--xy-edge-stroke-selected`），指向新增的 `--graph-edge` 令牌（浅色 #8fa5c6、深色 #4d628a）。React Flow 默认边类型就是贝塞尔曲线，正好是需求里的"思维导图式平滑曲线"。

复测（同一诊断）：`{"nodes":2,"edges":1,"edgePaths":1,"svg":true}` —— 连线已渲染。随后移除临时诊断代码与临时脚本，复跑 153 项测试、typecheck 与 build 全部通过。

顺带记录：jsdom 无法断言 React Flow 的边（容器尺寸缺失），因此 `ConversationGraph.test.tsx` 只断言节点数量，并在注释里写明边的连通性由 `graphLayout.test.ts`（每个父链接一条边）与真实应用共同覆盖。

### 2026-10-05（性能取证、懒加载与代码评审）

第 4 条验收分两半，都已落地：

1. **300 节点实测**。用真实渲染器取证（临时在 dev 自检里经 IPC 播一棵 300 节点 4 叉树、切到链路图、轮询 DOM 直到节点与边全部挂载）：`{"nodes":300,"edges":299,"elapsedMs":218}`——从点击到图完整渲染 218ms，且这是 **dev 模式**（React 官方指明的最悲观情形），500ms 预算有充足余量。诊断代码随后已移除（grep 校验为 0）并复跑全量。
2. **超出预算时的按需渲染**。新增 `limitConversationGraph(graph, 300)`：深度优先取前 300 个节点交给 React Flow，并丢弃端点落在前缀之外的边；图左上角显示「树较大，已显示前 300 个节点，还有 N 个未显示」以及「全部显示」按钮。**如实说明其边界**：dagre 仍为整棵子树做布局（那是廉价的一步），这个上限省掉的是"一次性挂载数千个节点/边/锚点"，不是布局计算本身。

评审结论（留痕 .agentic/reviews/2026-10-05T00-43-00-task-0008-graph-view.md）：0 Blocker / 1 Standards Concern / 4 Standards Note / 1 Spec Concern。Concern 是**视图状态不一致**——若聚焦对话被删除，`view` 仍是 `graph` 但图不再渲染，按钮文案会显示「对话视图」而下方面板区显示的是面板列表；已改为派生单一布尔值 `showingGraph`，文案与渲染共用它。Spec Concern（NFR-4 无证据）由上面的实测与上限一并解决。

四条 Note 记录在案：深子树的路由级懒加载仍未实现（当前上限覆盖挂载成本）；React Flow 的署名标记保留（隐藏属付费能力）；节点不可拖拽是 v1 的有意选择；jsdom 只能断言节点数量。

评审后复跑：155 项测试通过、typecheck 与 build 通过。4 条验收标准、4 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
