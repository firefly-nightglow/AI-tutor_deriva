# Task 0005: 实现树状侧栏

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0005-ground-tree-sidebar.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

树状侧栏（FR-5）是用户在对话树中定向的主要导航件，按 OQ-6 决议常驻显示。深层嵌套的展示策略：缩进第 5 层封顶，更深层级以层级角标（L6、L7…）标识。是"20 轮对话树内 2 次点击定位任意内容"成功标准的承载件之一。

## Acceptance Criteria

- [x] 侧栏完整渲染当前主对话的对话树，节点可展开/折叠
- [x] 点击节点打开或定位对应对话面板；当前查看中的节点有视觉标记
- [x] 第 5 层后缩进封顶，更深层级显示层级角标
- [x] 含 1000 条消息的对话树从点击到可交互 < 500ms（NFR-4）

## Plan

- [x] 树组件（折叠展平，虚拟化按需）
- [x] 展开/折叠状态管理与持久化
- [x] 深层级缩进封顶 + 角标样式
- [x] 与对话面板联动（点击打开、当前节点高亮）
- [x] 1000 消息基准数据性能验证

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0004（子对话数据）。

### 2026-10-04

完成 /ad-ground：doc/research/0005-ground-tree-sidebar.md（校验 valid: true，A2/B1/C2/D1，5 条 claim）。结论：折叠状态参与展平——遇到已折叠节点就不再递归其子树，因此渲染成本与「可见节点数」成正比；折叠状态按对话 id 存 localStorage（复用草稿与主题那一套模式）；列表 key 一律用对话 id（React 官方要求 key 来自数据）。具名偏离：**暂不引入虚拟化**，依据是 React 官方「memo 与优化不是保证，先修根因再优化」以及同类树组件（react-arborist）把 Open/close folders 与 Virtualized rendering 列为两项独立能力——本任务的根因是「折叠了仍渲染整棵树」，折叠修正后可见节点通常只有几十个。同一份官方文档还要求性能测量在生产模式下进行，因此自动化计时只能作烟雾信号。

实现落点：lib/grouping.ts 的展平增加 collapsed 集合参数并输出 hasChildren；新增 lib/collapse.ts（readCollapsed / saveCollapsed / toggleCollapsed，storage 不可用时静默降级）；SubjectSidebar 为有子节点的行增加折叠按钮（aria-expanded 与中文 aria-label，无子节点用等宽占位保持对齐）；App 持有折叠集合并持久化，随分组计算一起下传。

验证：121 项测试通过。新增用例覆盖——折叠后子树从可见项中消失且 hasChildren 标记正确；1000 节点（4 叉树）展平耗时远低于 500ms；折叠按钮只出现在有子节点的行、默认 aria-expanded=true、折叠后为 false 且文案切换；深度 7 的节点缩进停在第 5 层（padding-left:76px）而角标仍显示 L7。typecheck 与 build 通过，dev 启动自检正常（sidebarMounted:true）。

**第 4 条验收（1000 节点点击到可交互 < 500ms）尚未取证完成。** 现有证据只有纯函数展平的烟雾计时与结构测试，而 GROUND-0005 记录了两点限制：vitest 跑在非生产模式，且缺少真实的 1000 节点数据可供点击验证。要达到验收标准，需要在打包产物里以生产模式实测一次「点击到绘制」（或灌入基准树后用开发者工具 Performance 记录）。该条与代码评审一并留待下一步；若实测超标，按 GROUND-0005 的反转条件引入虚拟化。

### 2026-10-04（关闭）

按用户选择走取证路径 1：新增 scripts/seed-benchmark-tree.cjs，一次性播种一棵 1000 节点（1 根 + 999 子节点，4 叉）的基准树到独立科目「性能基准」下，并写明清理方式是删除该科目（级联删除整棵树）。用户已在真实应用中实测 1000 节点对话树的交互并确认通过，第 4 条验收据此勾选。

需要如实记录的一点：**这次没有留下具体毫秒数**——用户确认了「验证完毕」但没有把开发者工具里的数字贴给我。因此本条的证据是「产品所有者实操确认」，而不是一份可复核的测量记录；若日后需要把这个数字写进文档，重跑 scripts/seed-benchmark-tree.cjs 即可复现该场景。GROUND-0005 的反转条件（实测超标则引入虚拟化）依然有效。

代码评审已于同日完成，留痕 .agentic/reviews/2026-10-04T03-39-41-task-0005-tree-sidebar.md：0 Blocker / 1 Standards Concern / 4 Note / 1 Spec Concern，Concern（折叠祖先藏住被选中的新子对话）已当轮修复并补测。4 条验收标准、5 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
