# GROUND-0005: 树状侧栏的展开折叠与性能路径

**Status:** recorded
**Decision:** 侧栏用「折叠状态参与展平」的方式渲染：由 groupConversations 先按科目分组，再在展平时跳过已折叠节点的子树，因此渲染成本与「可见节点数」成正比而不是与整棵树成正比；折叠状态按对话 id 存进 localStorage（与草稿、主题同一套模式）；列表 key 一律用对话 id。暂不引入虚拟化——React 官方要求先解决根因再谈优化，且要求性能测量在生产模式下进行；本任务先用折叠把可见节点数压下来，并用一个基准测试记录纯函数与渲染路径的耗时，真实交互耗时说明见 Limitations。
**Decision ref:** doc/tasks/0005-tree-sidebar.md
**Confidence:** Strong

## Decision and confidence

Happy path：列表渲染按 React 官方要求使用来自数据的稳定 key（A1 原文：Rather than generating keys on the fly, you should include them in your data），本项目的对话 id 天然满足；折叠状态复用仓库既有的 localStorage 模式（草稿与主题已经这么做，见 C2）。展平逻辑放进已有的 lib/grouping.ts（C1 已按 depth 展平并封顶缩进），只是多接一个「已折叠集合」参数：遇到折叠节点就不再递归其子节点。这样点击折叠后，DOM 里只剩可见节点，交互成本随可见规模走。同类树组件（如 react-arborist）也把 Open/close folders 与 Virtualized rendering 列为两项独立能力（B1），说明先做展开折叠、把虚拟化留作规模化时的升级是通行做法。

一处具名偏离（性能验收的实现方式）：

1. **不引入虚拟化库**。React 官方对 memo 的说明是：memoization is a performance optimization, not a guarantee；You should only rely on `memo` as a performance optimization. If your code doesn't work without it, find the underlying problem and fix it first（A2）。当前树的问题不是「节点太多必须裁窗口」，而是「折叠了还要渲染整棵树」——折叠修正后可见节点通常只有几十个，一次性渲染完全没有压力。此外 A2 明确要求 When you do performance measurements, make sure that React is running in the production mode，而 vitest 跑的是非生产模式，所以自动化计时只能当烟雾信号，不能当作 NFR-4 的最终证据（见 Limitations）。

Axis-2 verdict: Strong。列表 key 与优化时机都有官方文档直接支撑，折叠展平是纯函数且可测；唯一软化的是「1000 节点 < 500ms」的取证方式，已具名说明并给出可行的后续取证路径。

## Evidence

### E1 — 列表必须使用来自数据的稳定 key

**Strength:** High
**Provenance:** A1

A1 原文：You need to give each array item a `key` … Keys tell React which array item each component corresponds to, so that it can match them up later. This becomes important if your array items can move (e.g. due to sorting), get inserted, or get deleted；并进一步要求 Rather than generating keys on the fly, you should include them in your data。侧栏节点会因折叠/展开而移动、插入与消失，因此 key 必须取对话 id（现实现已如此），不能用下标。

### E2 — 优化的前提是先解决根因，且测量要在生产模式

**Strength:** High
**Provenance:** A2

A2 原文：You should only rely on `memo` as a performance optimization. If your code doesn't work without it, find the underlying problem and fix it first. Then you may add `memo` to improve performance；同页另有 When you do performance measurements, make sure that React is running in the production mode。这两条共同支撑本记录的两个决定：先修折叠这个根因，以及在非生产模式下的计时只能当烟雾信号。

### E3 — 仓库内已有可复用的展平与持久化模式

**Strength:** High
**Provenance:** C1, C2

C1：lib/grouping.ts 已经产出 `{conversation, depth}` 的展平结果，并按科目分组、缩进在第 5 层封顶；加入折叠只需在递归前判断该节点是否在折叠集合里。C2：lib/drafts.ts 与 lib/theme.ts 已经确立「用 localStorage 存界面偏好、storage 不可用时静默降级」的写法，折叠状态照此实现即可，不需要新增依赖或 IPC。

### E4 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，无历史提交可检索，属可复现的 no prior attempt found。

### E5 — 成熟树组件把展开折叠与虚拟化当作两项独立能力

**Strength:** Medium
**Provenance:** B1

B1（react-arborist）在特性列表中把 Open/close folders 与 Virtualized rendering 并列，并把自身定位为「Build the equivalent of a VSCode sidebar」的方案。这说明展开折叠是树组件的基本盘，虚拟化是应对规模的独立升级项——与本记录「先用折叠压低可见节点数、按测量结果决定是否虚拟化」的取舍一致。强度记 Medium：这是同类库的设计取舍佐证，不是对本项目性能的直接证明。

## Source register

- **A1:** React 官方文档 Rendering Lists，key 的作用与「key 要来自数据而非临时生成」，https://react.dev/learn/rendering-lists (accessed 2026-10-04 via curl fetch of the react.dev source repository markdown)
- **A2:** React 官方文档 memo，memo 只是优化而非保证、先修根因、性能测量需在生产模式，https://react.dev/reference/react/memo (accessed 2026-10-04 via curl fetch of the react.dev source repository markdown)
- **B1:** brimdata/react-arborist README，成熟树组件同时提供 Open/close folders 与 Virtualized rendering，定位为 VSCode 式侧栏，https://github.com/brimdata/react-arborist (accessed 2026-10-04 via curl fetch of raw.githubusercontent.com)
- **C1:** 仓库内 `src/renderer/src/lib/grouping.ts`，既有按科目分组与按 depth 展平（缩进封顶）的实现 (accessed 2026-10-04 via local shell)
- **C2:** 仓库内 `src/renderer/src/lib/drafts.ts` 与 `src/renderer/src/lib/theme.ts`，localStorage 持久化 + 不可用时静默降级 (accessed 2026-10-04 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-04 via local shell)

## Limitations and reversal

本记录不能证明：1000 节点规模下真实交互耗时是否低于 500ms（vitest 跑在非生产模式，计时偏悲观且与浏览器事件循环不同；真实取证需要在打包产物里用 1000 个节点实测，或用开发者工具的 Performance 面板记录一次「点击到绘制」）。反转条件：若在生产模式实测中发现折叠后仍达不到 500ms，则回到本记录引入虚拟化（窗口化渲染）并重新取证；届时应优先选择与 React 19 兼容且维护活跃的方案，而不是手写滚动窗口。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0005-ground-tree-sidebar.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
