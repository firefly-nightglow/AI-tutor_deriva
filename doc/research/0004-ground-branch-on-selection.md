# GROUND-0004: 选中 AI 输出开子对话的实现路径

**Status:** recorded
**Decision:** 用 window.getSelection() + Range.getBoundingClientRect() 做选中检测与浮动按钮定位；引用文本不取渲染后的可见字符，而是给 Markdown 渲染出的块级元素打上源码偏移（remark 插件写 node.data.hProperties），选中时按偏移从原始 Markdown 切片，保证公式拿到的是完整 LaTeX；子对话复用 conversations.parent_conversation_id + source_message_id，并新增 source_quote 列（迁移 2）保存引用块；上下文策略作为模型设置项（默认仅片段，可选完整链）。
**Decision ref:** doc/tasks/0004-branch-on-selection.md
**Confidence:** Strong

## Decision and confidence

Happy path：选中检测按 Selection API 的官方用法——`window.getSelection()` 取选择对象，`rangeCount` / `getRangeAt()` 取范围，`toString()` 取文本（A1）；浮动按钮的位置取自 `Range.getBoundingClientRect()`，官方说明它返回包住范围内所有元素边界矩形并集的 DOMRect，正是"选区在视口中的坐标"（A2）。这与参考实现 Swen 的交互一致：选中内容后唤起即得解答（B2）。

引用文本的取法是本任务真正的技术难点：渲染后的 DOM 对公式是有损的（可见字形是 KaTeX 排版结果，不是 TeX 源码），直接把 `selection.toString()` 存成引用会把公式变成一串无意义的符号。因此改为在 mdast 阶段标注源码偏移：mdast-util-to-hast 明确支持用 `node.data.hProperties` 为生成的元素附加属性，其实现也在构建元素时应用了该字段（B1、B2）。渲染时给段落、标题、列表项、引用块、表格单元与代码块打上 `data-source-start` / `data-source-end`，选中后取「包含选区起点的最深标注元素」的起点与「包含终点的最深标注元素」的终点，从原始 Markdown 切片。

一处具名偏离：

1. **引用粒度是块级，不是精确字符级。** 理由是渲染后的文本节点不携带源码偏移，而在 KaTeX 输出内部做字符级映射需要改动它的 DOM 结构，风险高于收益；块级粒度保证引用里永远是完整、可解析的 Markdown 与 LaTeX（不会出现半个 `$` 或断开的 `\frac{`），代价是用户只选一句话时会带入整段。这个取舍在代码注释与任务 Notes 中写明，若日后需要字符级精度，可在渲染层为每个文本节点包一层带偏移的 span 再重做映射。

Axis-2 verdict: Strong。选中检测与定位有官方 API 文档，属性附加机制有官方文档加本机实现双重印证，引用粒度这一点是明确标注的取舍而非未知数。

## Evidence

### E1 — 选中检测用 Selection API

**Strength:** High
**Provenance:** A1

A1 定义 Selection 为「用户选中的文本范围或光标当前位置」，每个文档一个，可用 `document.getSelection()` 或 `window.getSelection()` 取得；给出 `rangeCount`（选区中范围数量）、`getRangeAt()`（返回其中一个 Range）、`toString()`（返回当前选中文本）、`anchorNode` / `anchorOffset`（选区起点）等成员。据此，判断"是否选中了非空内容"用 `rangeCount > 0` 与 `toString().trim() !== ''` 即可，不需要额外库。

### E2 — 浮动按钮位置取 Range.getBoundingClientRect()

**Strength:** High
**Provenance:** A2

A2 原文：The Range.getBoundingClientRect() method returns a DOMRect object that bounds the contents of the range; this is a rectangle enclosing the union of the bounding rectangles for all the elements in the range. This method is useful for determining the viewport coordinates of the cursor or selection inside a text box。浮动按钮以该矩形的上沿与水平中点为锚，用 fixed 定位贴在选区上方。

### E3 — 用 node.data.hProperties 给生成的元素附加源码偏移

**Strength:** High
**Provenance:** B1, B2

B1（mdast-util-to-hast 官方说明）列出节点数据可影响输出的三个字段，其中 `node.data.hProperties` — define extra properties to use；B2（该包实现）在构建元素时读取 `from.data.hProperties` 并合并进结果元素。两者一致，说明在 remark 阶段写 `data.hProperties` 是受支持且稳定的附加属性方式，不需要自己在 HTML 字符串上做后处理。

### E4 — 参考实现确认"选中即问"的交互形态

**Strength:** Medium
**Provenance:** B3

B3（Swen README）说明其产品形态为：选中内容后唤起，即获得即时解答；并区分"文本选择模式"与"OCR 模式"，前者是在可选中区域直接选中文本。这证明本任务要做的交互在同类产品中成立。强度记为 Medium：这是产品级佐证，不是对本实现技术细节的印证。

### E5 — 仓库内已具备子对话的数据结构

**Strength:** High
**Provenance:** C1, C2

C1：conversations 表已有 `parent_conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE` 与 `source_message_id`，仓储已提供 create（含父对话与来源消息校验）、listChildren、listTree、remove（级联）等方法，覆盖子对话的创建、查询与级联删除；缺的只是引用文本本身。C2：schema 迁移机制按 `PRAGMA user_version` 顺序执行，新增一列只需追加一条迁移，不需要重建表。

### E6 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，无历史提交可检索，属可复现的 no prior attempt found。

## Source register

- **A1:** MDN Selection API，getSelection/rangeCount/getRangeAt/toString/anchorNode 语义，https://developer.mozilla.org/en-US/docs/Web/API/Selection (accessed 2026-10-03 via curl fetch of official docs page)
- **A2:** MDN Range.getBoundingClientRect()，返回包住范围内元素边界的 DOMRect，用于确定选区视口坐标，https://developer.mozilla.org/en-US/docs/Web/API/Range/getBoundingClientRect (accessed 2026-10-03 via curl fetch of official docs page)
- **B1:** mdast-util-to-hast 官方说明，node.data.hProperties 定义输出元素的额外属性，https://github.com/syntax-tree/mdast-util-to-hast (accessed 2026-10-03 via local node_modules readme)
- **B2:** mdast-util-to-hast 实现 node_modules/mdast-util-to-hast/lib/state.js 中读取 from.data.hProperties 并合并进结果元素的分支 (accessed 2026-10-03 via local shell)
- **B3:** USTCKevinF/Swen README，选中内容后唤起即得解答的产品形态与文本选择模式，https://github.com/USTCKevinF/Swen (accessed 2026-10-03 via curl fetch of raw.githubusercontent.com)
- **C1:** 仓库内 src/main/db/schema.ts 的 conversations 表定义（parent_conversation_id 与 source_message_id）与 src/main/db/repositories/conversations.ts 的既有方法 (accessed 2026-10-03 via local shell)
- **C2:** 仓库内 src/main/db/schema.ts 的 applyMigrations，按 PRAGMA user_version 顺序执行迁移，新增列可追加迁移实现 (accessed 2026-10-03 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-03 via local shell)

## Limitations and reversal

本记录不能证明：块级引用粒度是否符合用户预期（这是产品判断，需真实使用反馈）；给块级元素附加 data-* 属性对 KaTeX 排版与复制行为没有副作用（需要在 dev 实测中确认，KaTeX 只处理它自己的子树，理论上不受影响）；触屏上 Selection API 的行为与鼠标一致（Windows 触屏下长按选中的交互细节需实测）。反转条件：若实测发现用户普遍只需要句级引用，或 KaTeX 输出因外部属性出现排版异常，则回到 E3 重做映射方案（改为在文本节点外包一层带偏移的 span）并重跑本记录。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0004-ground-branch-on-selection.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
