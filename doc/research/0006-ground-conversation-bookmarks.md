# GROUND-0006: 对话书签的生成与跳转

**Status:** recorded
**Decision:** 书签在回答完成时由主进程生成并落库：默认取回答首句做本地截断（零额外 token），FR-16 设置切到「模型生成」时复用既有 chat client 让模型给一句话摘要并提示额外消耗；渲染层按会话读出书签，在面板右缘渲染书签栏，点击用原生 `scrollIntoView({ behavior: 'smooth', block: 'start' })` 跳转并临时高亮对应消息；不引入滚动定位库。
**Decision ref:** doc/tasks/0006-conversation-bookmarks.md
**Confidence:** Strong

## Decision and confidence

Happy path：跳转用平台原生的 `Element.scrollIntoView`，官方文档说明它会滚动祖先容器使元素可见，并支持 `behavior: 'smooth'`、`block: 'start'` 等选项（A1）。不引入 `scroll-into-view-if-needed` 这类 ponyfill：该库的说明本身指出，浏览器厂商已把它的核心能力（`scrollMode: 'if-needed'`）纳入 `scrollIntoView` 规范，库的存在主要是为了覆盖旧浏览器差异（B1）；本项目只发布一个 Chromium 版本（Electron），这层兼容成本没有收益。

书签的数据形状早就在：`bookmarks` 表带 `summary`、`summary_source`（local/model）与 `position`，并对 `(conversation_id, message_id)` 建了唯一约束，仓储已提供 create/list/getByMessage/updateSummary/remove（C1）。因此本任务不需要新表，只需要在正确时机写入、并把读接口暴露给渲染层。渲染层已有两样可复用的东西：消息节点带 `data-message-id`（Task 0004 为选中所加）可以用来定位跳转目标；文本派生集中在 `shared/text.ts`（C2）。

一处具名偏离：

1. **不引入滚动定位库**（B1 提到的那类）。理由是本项目只针对随包发布的 Electron 内置 Chromium，A1 所述的选项已足够覆盖「滚到面板内某条消息」这一个场景；等到需要跨容器、虚拟列表或滚动锚定等复杂行为时再评估，而不是现在背一个依赖。

Axis-2 verdict: Strong。跳转行为有官方文档，库的取舍有库自己的说明作证；书签的数据结构在本仓库已存在并被 Task 0001 的测试覆盖，属于复用而非新建。

## Evidence

### E1 — 原生 scrollIntoView 足以把消息滚入可视区

**Strength:** High
**Provenance:** A1, B1

A1 说明 `Element.scrollIntoView()` 会滚动该元素所在的所有可滚动祖先，把元素带入视口，并支持 `behavior`（`smooth` / `instant` / `auto`）与 `block`（`start` / `center` / `end` / `nearest`）等选项。B1 进一步说明，各浏览器已把「仅在需要时滚动」等能力并入 `scrollIntoView` 的规范选项，这正是 ponyfill 库原本要解决的问题。

### E2 — 该项目无需滚动定位 ponyfill

**Strength:** Medium
**Provenance:** B1

B1 原文指出：Since then the CSS working group have decided to implement its features in `Element.scrollIntoView` as the option `scrollMode: "if-needed"`. Thus this library got rewritten to implement that spec。这解释了该库的定位是兼容层；对一个只跑随包 Chromium 的 Electron 应用，引入它属于为不存在的差异付费。强度记 Medium：这是对该库定位的解读，不是对本项目行为的直接测量。

### E3 — 书签的数据结构已存在且带唯一约束

**Strength:** High
**Provenance:** C1

C1：`src/main/db/schema.ts` 的 `bookmarks` 表已包含 `conversation_id`、`message_id`、`summary`、`summary_source`、`position` 与 `UNIQUE (conversation_id, message_id)`；`src/main/db/repositories/bookmarks.ts` 已提供 create / get / getByMessage / listByConversation / updateSummary / remove。因此生成书签只是写入时机问题，不需要迁移。

### E4 — 渲染层已有定位锚点与文本派生工具

**Strength:** High
**Provenance:** C2

C2：`src/renderer/src/components/ConversationView.tsx` 的消息节点带 `data-message-id`（Task 0004 为选中追问引入），可直接作为跳转目标；`src/shared/text.ts` 集中了标题截断与标记剥离逻辑，书签的本地摘要沿用同一套规则即可，不必再写一份。

### E5 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，无历史提交可检索，属可复现的 no prior attempt found。

## Source register

- **A1:** MDN Element.scrollIntoView()，滚动祖先容器使元素可见，支持 behavior/block 等选项，https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView (accessed 2026-10-04 via curl fetch of official docs page)
- **B1:** stipsan/scroll-into-view-if-needed README，说明浏览器已把其能力纳入 scrollIntoView 规范选项（scrollMode: "if-needed"），该库重写为兼容层，https://github.com/stipsan/scroll-into-view-if-needed (accessed 2026-10-04 via curl fetch of raw.githubusercontent.com)
- **C1:** 仓库内 `src/main/db/schema.ts` 的 bookmarks 表定义与 `src/main/db/repositories/bookmarks.ts` 的既有方法 (accessed 2026-10-04 via local shell)
- **C2:** 仓库内 `src/renderer/src/components/ConversationView.tsx` 的 data-message-id 标记与 `src/shared/text.ts` 的文本派生工具 (accessed 2026-10-04 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-04 via local shell)

## Limitations and reversal

本记录不能证明：模型生成摘要的质量与成本是否值得（需要用真实回答对比本地截断与模型摘要的可用性）；长会话中大量书签栏是否需要滚动或折叠（当前按一列竖直排布，未做虚拟化，书签数量远小于消息数量）。反转条件：若书签栏在真实长会话中出现溢出或定位不准，则回到本记录评估分组/折叠策略，或在确实需要跨容器与虚拟列表行为时引入 B1 所述的库。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0006-ground-conversation-bookmarks.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
