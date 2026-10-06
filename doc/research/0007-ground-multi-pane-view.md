# GROUND-0007: 多栏对照面板的布局与状态

**Status:** recorded
**Decision:** 面板区用 flex 容器 + `overflow-x: auto`：每个面板 `flex: 1 1 0` 且 `min-width` 为容器宽度的三分之一减去间距，因此 1–3 个面板自动铺满、第 4 个起整体横向滚动（FR-15）；打开/关闭/焦点状态用纯函数维护（openPane / closePane / focusAfterClose），面板标题栏显示层级徽标（主对话 / 子对话 L2）与 44px 关闭控件；删除对话时关闭其面板并把焦点交回父对话。不引入分栏库。
**Decision ref:** doc/tasks/0007-multi-pane-view.md
**Confidence:** Strong

## Decision and confidence

Happy path：FR-15 要的是「最多平铺 3 栏，超出横向滚动」，这正好是 flexbox 的默认行为——弹性项目默认单行不换行（flex-wrap 默认 nowrap），容器放不下时内容溢出（A1）；给容器 `overflow-x: auto` 即可只在需要时出现横向滚动条（A2）。因此每个面板用 `flex: 1 1 0` 铺满剩余空间，并用 `min-width: calc(100% / 3 - gap)` 保证第 4 个面板出现时每个至少占三分之一宽、把容器撑出滚动，而不是被压成薄片。

打开/关闭/焦点属于纯状态迁移，放进 lib/paneList.ts 用纯函数表达（openPane 追加去重、closePane 移除、focusAfterClose 选邻居），这样多栏行为可以脱离 DOM 测试，App 只负责把它们接到事件上。面板标题的层级徽标复用 lib/grouping.ts（Task 0005 已按 depth 展平），只需补一个 depthOf。

一处具名偏离：

1. **不引入 react-resizable-panels 这类分栏库**（B1）。它解决的是「可拖拽调整大小、并持久化尺寸」的问题；FR-8/FR-15 只要求并列查看、独立滚动、自由开关，没有要求用户改变分栏比例。等到真的需要拖拽分栏时再评估，而不是先背一个依赖（与 GROUND-0005、GROUND-0006 同一取舍标准）。

Axis-2 verdict: Strong。布局行为有官方文档直接对应，状态迁移是纯函数且可测；唯一软化的地方是「三分之一的 min-width 是否在三栏以上仍然好看」，属可调常量而非结构性风险。

## Evidence

### E1 — flex 默认单行溢出，天然适合「三栏 + 横向滚动」

**Strength:** High
**Provenance:** A1

A1 说明弹性项目的 `flex-shrink` 默认为 1、`flex-basis` 默认为 auto，且 All the items will be in a single row (the flex-wrap property's default value is nowrap), overflowing…——即容器放不下时默认溢出而非换行。这正是「最多铺三栏、再多就横向滚动」需要的机制：不需要 JS 计算列数，只需约束每个面板的最小宽度。

### E2 — overflow: auto 只在需要时出现滚动条

**Strength:** High
**Provenance:** A2

A2 列出 `overflow` 的关键字取值，其中 `auto` 与 `scroll` 的区别在于前者按需出现滚动条。面板区用 `overflow-x: auto`，因此 1–3 栏时不会出现多余的滚动条槽，第 4 栏起才滚。

### E3 — 分栏库解决的是另一个问题

**Strength:** Medium
**Provenance:** B1

B1（react-resizable-panels README）把自己定义为 React components for resizable panel groups/layouts，即以拖拽调整面板尺寸为核心能力。本任务的验收条款没有「调整比例」这一项，因此引入它属于为不存在的需求付费；若日后用户要求拖拽分栏，再回到本记录评估。强度记 Medium：这是对库定位的解读，不是对本项目布局的测量。

### E4 — 仓库内已有的可复用结构

**Strength:** High
**Provenance:** C1, C2

C1：lib/grouping.ts 已按 depth 展平对话树并封顶缩进，补一个 depthOf 就能给每个面板算出「子对话 L2」这类徽标文案。C2：ConversationPane / ConversationView 已经把「一个对话的全部状态」封装在组件内部（GROUND-0003 的决定），因此多栏只需要在 App 层维护「哪些面板打开」的 id 列表，不需要改动面板内部的数据流。

### E5 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，属可复现的 no prior attempt found。

## Source register

- **A1:** MDN Basic concepts of flexbox，flex-shrink/flex-basis 默认值与 flex-wrap: nowrap 导致的单行溢出，https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox (accessed 2026-10-04 via curl fetch of official docs page)
- **A2:** MDN overflow，overflow-x 取值与 auto 按需出现滚动条，https://developer.mozilla.org/en-US/docs/Web/CSS/overflow (accessed 2026-10-04 via curl fetch of official docs page)
- **B1:** bvaughn/react-resizable-panels README，定位为可拖拽调整尺寸的面板组，https://github.com/bvaughn/react-resizable-panels (accessed 2026-10-04 via curl fetch of raw.githubusercontent.com)
- **C1:** 仓库内 `src/renderer/src/lib/grouping.ts` 的按 depth 展平实现 (accessed 2026-10-04 via local shell)
- **C2:** 仓库内 `src/renderer/src/components/ConversationPane.tsx` 与 `ConversationView.tsx`，单个对话的消息与流式状态封装在组件内部 (accessed 2026-10-04 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-04 via local shell)

## Limitations and reversal

本记录不能证明：三栏在窄窗口（例如 1280px）下每栏是否仍够用——面板内还有书签栏（156px），三栏时每栏约 400px，书签栏会占掉不少；这一点需要实际走查后决定窄栏下书签栏的形态（收窄、折叠或改为悬浮）。也不能证明横向滚动在大触控板/触屏上的手感。反转条件：若走查发现三栏不可读，则把默认平铺数降为 2，或让面板可拖拽调整宽度（届时回到 B1 评估引入分栏库）。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0007-ground-multi-pane-view.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
