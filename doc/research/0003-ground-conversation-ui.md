# GROUND-0003: 主对话界面与科目管理的实现路径

**Status:** recorded
**Decision:** 渲染层沿用 React 本地状态与「按需上提」策略：App 持有科目列表、主对话列表与当前选中的对话，对话面板自持消息与流式状态；不引入状态管理库，复用 Task 0002 的 MarkdownContent 渲染组件与 onChatEvent 订阅模式，新增的科目/对话写操作经既有类型化 IPC 契约暴露。
**Decision ref:** doc/tasks/0003-main-conversation-subjects-ui.md
**Confidence:** Strong

## Decision and confidence

Happy path：状态按 React 官方原则组织——「state 不应包含冗余或重复的信息」，两处必须同步变化时把 state 上提到最近的共同父组件（A1、A2）。因此科目列表、主对话列表与当前选中对话放在 App，消息与流式状态放在对话面板内部，二者只通过 props 与既有 `window.api` 契约交互。这一取舍有同栈参考实现佐证：Specter-AI（Electron + React + TS，与本项目技术形态相同）把渲染层按界面切成 `src/renderer/<surface>/pages/*.tsx`，逐个页面组件自持状态，`package.json` 中没有任何状态管理依赖（B1、B2）。仓库内既有代码也是这一形态：Task 0001/0002 的 App.tsx 用 useState/useEffect 持有全部界面状态，经类型化桥接读写数据，流式订阅以「订阅返回退订函数」的方式挂载（C1、C2）。数据侧不需要新查询形状：按科目分组所需的 listRoots / listBySubject、改名 rename、改挂 moveToSubject、删除 remove 与消息 listByConversation 都已存在，本任务只是把它们接上 IPC（C3）。

一处具名偏离：

1. **暂不引入状态管理库**（早期技术路线里提过 Zustand）。理由：React 官方把 reducer + context 列为「随着应用变大」的扩展路径，而不是默认起点（A1）；参考实现在同等规模下用纯本地状态（B1、B2）；当前只有「科目/对话列表」与「当前对话」需要在两处之间同步，属于官方所述的「上提到最近共同父组件」即可解决的情形。**重新评估的触发点已经明确**：Task 0007 的多栏对照需要多个面板共享「哪些对话被打开」这一状态，那时若 props 传递开始穿透多层，就改用 context + reducer 或引入 store，而不是提前引入。

Axis-2 verdict: Strong。这是可逆的界面组织决策，官方原则与同栈参考实现一致指向同一方向，且保留了具名的重新评估触发点。

## Evidence

### E1 — 状态不应冗余，且应上提到最近的共同父组件

**Strength:** High
**Provenance:** A1, A2

A1 原文：The most important principle is that state shouldn't contain redundant or duplicated information. If there's unnecessary state, it's easy to forget to update it, and introduce bugs。A1 同时给出共享状态的处置方式：remove state from both of them, move it to their closest common parent, and then pass it down to them via props。A2 以同样措辞把这一动作命名为 lifting state up。这直接支撑「科目/对话列表与当前选中对话放在 App」的决定，也解释了为什么选中态不应同时存在列表与面板两边。

### E2 — reducer + context 是规模扩大后的路径，不是默认起点

**Strength:** High
**Provenance:** A1

A1 的章节结构把 Passing data deeply with context 与 Scaling up with reducer and context 放在 Choosing the state structure、Sharing state between components、Preserving and resetting state、Extracting state logic into a reducer 之后，即先本地状态与上提，再考虑跨层传递。据此，当前规模直接引入 store 属于跳过前序步骤。

### E3 — 同栈参考实现用页面级组件自持状态，无状态库

**Strength:** Medium
**Provenance:** B1, B2

B1 显示 Specter-AI 的渲染层按界面切分为 `src/renderer/dashboard/pages/*.tsx`（History/Interview/Models/Playbooks/Settings）与 `src/renderer/onboarding/steps/*.tsx`，每个页面一个组件文件。B2（其 package.json）的 dependencies 只有 electron-store / electron-updater / koffi / lucide-react / openai / pdfjs-dist / react / react-dom / react-markdown / rehype-sanitize / screenshot-desktop / tesseract.js，没有任何 redux / zustand / jotai / mobx，说明同等规模的已发布应用确实未引入状态库。强度记为 Medium 而非 High：这是单个社区的单个实现，只能证明该做法可行，不能证明它是最优。

### E4 — 仓库内既有渲染层形态与可复用的订阅模式

**Strength:** High
**Provenance:** C1, C2

C1：`src/renderer/src/App.tsx` 用 useState/useEffect 持有科目、密钥状态、模型配置与流式答案，未使用任何 store；数据读写一律经 `window.api`（类型化契约，见 `src/shared/api.ts`）。C2：流式事件以 `window.api.llm.onChatEvent(listener)` 订阅、返回退订函数，在 useEffect 中直接返回该函数完成清理；Task 0003 的对话面板沿用同一模式，不新增订阅机制。

### E5 — 数据层已具备本任务所需全部查询与写操作

**Strength:** High
**Provenance:** C3

C3：`src/main/db/repositories/conversations.ts` 已提供 create/get/listRoots/listBySubject/listChildren/listTree/rename/moveToSubject/touch/remove；`subjects.ts` 提供 create/get/list/rename/remove；`messages.ts` 提供 append/get/listByConversation/listChildren/updateContent/remove。因此本任务只需在 `src/shared/ipc-channels.ts`、`src/main/ipc.ts`、`src/preload/index.ts` 三处把尚未暴露的写操作接上，不在数据层引入新形状。

### E6 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，无历史提交或分支可检索，属可复现的 no prior attempt found。

## Source register

- **A1:** React 官方文档 Managing State，状态不应冗余、共享状态上提到最近共同父组件、context 与 reducer 作为规模化路径，https://react.dev/learn/managing-state (accessed 2026-10-03 via curl fetch of the react.dev source repository markdown)
- **A2:** React 官方文档 Sharing State Between Components，lifting state up 的定义与做法，https://react.dev/learn/sharing-state-between-components (accessed 2026-10-03 via curl fetch of the react.dev source repository markdown)
- **B1:** umairinayat/Specter-AI 仓库文件树，渲染层按界面切分为 dashboard/pages 与 onboarding/steps 的页面级组件，https://github.com/umairinayat/Specter-AI (accessed 2026-10-03 via GitHub API tree endpoint)
- **B2:** umairinayat/Specter-AI package.json，依赖中不含任何状态管理库，https://github.com/umairinayat/Specter-AI/blob/main/package.json (accessed 2026-10-03 via curl fetch of raw.githubusercontent.com)
- **C1:** 仓库内 `src/renderer/src/App.tsx`，全部界面状态为 useState/useEffect，数据经 window.api 类型化契约读写 (accessed 2026-10-03 via local shell)
- **C2:** 仓库内 `src/renderer/src/App.tsx` 的 onChatEvent 订阅与 useEffect 退订写法，以及 `src/preload/index.ts` 暴露的订阅接口 (accessed 2026-10-03 via local shell)
- **C3:** 仓库内 `src/main/db/repositories/conversations.ts`、`subjects.ts`、`messages.ts` 的既有方法清单 (accessed 2026-10-03 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-03 via local shell)

## Limitations and reversal

本记录不能证明：纯本地状态在对话数量增长后的重渲染开销是否可接受（当前列表规模小，未做基准）；Task 0007 多栏对照出现后是否需要共享状态（已在决策中把该点列为重新评估触发点）；Specter-AI 的页面级划分是否适合树状对话这种需要列表与详情强联动的界面。反转条件：若 App 层 props 传递超过两层，或列表与面板之间出现需要频繁同步的派生状态，则改用 context + reducer（官方路径）并重跑本记录。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0003-ground-conversation-ui.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
