# Task 0007: 实现多栏对照面板

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0007-ground-multi-pane-view.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

学生需要对照查看主对话与子对话（如边看原推导边看定理分支），FR-8/FR-15 规定：并列面板、独立滚动、自由开关、默认最多平铺 3 栏（OQ-4 决议，UI 走查时复核）、超出横向滚动。对应 Scenario 4。

## Acceptance Criteria

- [x] 主对话与任意多个子孙对话可并列打开，每个面板独立滚动、独立关闭
- [x] 每个面板显示所属层级标识（如"主对话 / 子对话 L2"）与明确的关闭控件（热区 >= 44px）
- [x] 默认最多平铺 3 栏，超出后面板区横向滚动
- [x] 删除正在查看的对话时其面板关闭并回到父对话

## Plan

- [x] 面板容器布局（平铺 <=3 栏 + 横向滚动）
- [x] 面板打开/关闭状态管理（与树状侧栏、链路图联动）
- [x] 层级标识与关闭控件
- [x] 删除联动逻辑

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0004、Task 0005。

### 2026-10-04

完成 /ad-ground：doc/research/0007-ground-multi-pane-view.md（校验 valid: true，A2/B1/C2/D1，5 条 claim）。结论：FR-15 的「最多平铺 3 栏、超出横向滚动」正好是 flex 的默认行为——弹性项目默认单行不换行、放不下就溢出，容器加 `overflow-x: auto` 即按需出现滚动条；每个面板 `flex: 1 1 0` 铺满剩余宽度，用 `min-width: calc(100% / 3 - 8px)` 保证第 4 个面板出现时每栏至少占三分之一并把容器撑出滚动。不引入 react-resizable-panels：它解决的是拖拽调整比例与尺寸持久化，而本任务验收只要求并列查看、独立滚动与自由开关（与 GROUND-0005/0006 同一取舍标准）。

实现落点：

1. 新增 lib/paneList.ts（openPane 去重追加、closePane 移除、focusAfterClose 优先右侧邻居再左侧），把多栏状态迁移做成纯函数，App 只负责接线。
2. lib/grouping.ts 补 depthOf(all, id)，复用既有的祖先链逻辑算出「主对话 / 子对话 L2」徽标文案。
3. App 由单一 selectedId 改为 openIds（有序面板列表）+ focusedId（当前聚焦）；侧栏点击、新建对话、追问生成分支都会打开并聚焦对应面板；删除对话时关闭其面板，若有父对话则打开并聚焦父对话（FR-11 与 AC4 的「回到父对话」）。
4. ConversationView 标题栏增加层级徽标与 44px 关闭控件（aria-label「关闭面板」），并保留消息计数；面板区为 `.panes`（flex + overflow-x auto），每个面板包在 `.pane` 里，聚焦面板用强调色描边。

验证：134 项测试通过。新增用例覆盖 paneList 的追加去重/移除/关闭后的焦点选择（右侧优先、其次左侧、清空为 null）；depthOf 对根/子/孙分别返回 0/1/2；面板标题栏渲染层级徽标、点击关闭控件触发 onClose。typecheck 与 build 通过，dev 启动自检正常。

未自动验证与已知取舍：三栏在 1280px 窄窗下每栏约 400px，而面板内还有书签栏，实际可读宽度需要走查确认；横向滚动在触控板上的手感同样需要实操。代码评审尚未进行，状态保持 in-progress。

### 2026-10-04（窄栏风险的处置）

用户实操确认多栏对照正常后，针对 GROUND-0007 记录的窄栏风险提出三项改进，均已实现：

1. **面板可拖拽调整宽度**。每个分隔条是 `role="separator"` 的把手，`pointerdown` 时量取相邻两栏与容器的实际宽度，`pointermove` 用纯函数 `resizePanes(leftWidth, rightWidth, delta, min)` 重新分配：两栏宽度之和保持不变，任一侧触底则把余量交还给另一侧（不会因为夹紧悄悄改变总宽）。最小宽度取 `max(280px, 容器宽/3 - 8)`，与 CSS 中「第四栏起才横向滚动」的约束一致，因此拖拽永远不会把某一栏压到不可读。拖动期间禁用文本选择，指针事件同时覆盖鼠标与触屏。宽度为会话内状态，未持久化（不在验收要求内）。
2. **书签栏可折叠**。书签栏左上角新增折叠按钮（`aria-expanded` + 中文 `aria-label`），折叠后收成 34px 窄条只留展开按钮，偏好写入 localStorage，对所有面板生效。
3. **分支溯源标记**（用户补充建议）。新增 lib/branchMarks.ts：`branchSources` 挑出「有来源消息 + 有引用文本」的分支，`branchRanges` 在**与渲染同一份**的源码字符串里检索引用位置（复用 lib/markdownSource.ts，避免此前那类偏移漂移），`overlaps` 判断块级区间相交。ConversationView 渲染后按区间给对应块加 `is-branch-source`（3px 强调色左边线 + 极浅底色），并在消息 meta 显示「N 个子对话」。标记是**派生**而非存储：分支删除后对话列表刷新，标记与计数自然消失；样式刻意克制，不遮挡正文。

验证：142 项测试通过。新增用例覆盖——branchSources 只挑带锚点与引用的分支；branchRanges 能在公式提升后的源码里定位引用、对不匹配引用返回空；overlaps 的相接边界；resizePanes 的对称分配与两侧夹紧后的总量守恒；jsdom 下带分支来源的消息会把对应段落标为 is-branch-source 并显示「1 个子对话」，无分支时无任何标记；书签栏折叠后条目隐藏、按钮文案切换且偏好写入 localStorage。typecheck 与 build 通过，dev 启动自检正常。

### 2026-10-04（拖拽分栏的三个缺陷）

用户实操发现拖拽引入三个问题，截图见 异常复核/task 0007：

1. 拖拽后再删除部分面板，幸存面板保持原来的像素宽度，不铺满剩余空间。
2. 拖拽后删光所有面板，再打开一个对话，新面板同样不铺满。
3. 打开三个面板时，最左侧面板会被裁掉（标题与左边界不可见），看起来像嵌进左侧树状侧栏。

根因是同一个：**拖拽产生的显式宽度（paneWidths，以对话 id 为键）从不失效**。面板集合变化后幸存者仍带着旧宽度（`flex: 0 0 Npx`），于是 1、2 表现为"不铺满"；而三栏时若干显式宽度之和超过容器，容器出现横向滚动，浏览器为把被聚焦的面板滚进视野会改变 scrollLeft，最左栏因此被裁到侧栏下方（3）。另外三栏的 CSS 最小宽度用 `calc(100% / 3 - 8px)`，加上 2 个间距（各 12px）与 2 个分隔条（各 6px）实际会超出 100% 约 12px，本身就是个持续存在的溢出源。

修复：

1. 面板集合变化（打开/关闭/删除）时清空 paneWidths 并把面板区 scrollLeft 复位，幸存者与新建面板都回到等分铺满。
2. 新增纯函数 paneWidthFor(widths, paneId, openCount)：面板少于两个时一律忽略存储宽度，单个面板必然是满宽；宽度也只对仍在打开的面板生效。
3. 把三栏最小宽度改为 `calc((100% - 36px) / 3)`（36px = 2 间距 + 2 分隔条），三栏恰好铺满、不产生多余滚动；四栏起才溢出横向滚动（FR-15）。拖拽的最小宽度同步改为 `max(280px, (容器宽 - 36px) / 3)`，与 CSS 约束保持一致。
4. 标题栏的横向溢出防护：给 `.conversation__title` 加 overflow: hidden、给标题 h2 补 min-width: 0，避免长标题把标题栏撑宽进而影响面板宽度。

验证：143 项测试通过（新增 paneWidthFor 的三个断言：单面板忽略宽度、多面板沿用宽度、未知面板返回 undefined）；typecheck 与 build 通过；dev 启动自检正常。请用户复测拖拽→删除→重开的组合，以及三栏下的左边界。

### 2026-10-04（分隔条无法拖动）

用户复测：上述三个宽度问题已解决，但分隔条"可见却拖不动"。

定位过程：不靠猜测，先补了一个 **App 级别的 jsdom 测试**（src/renderer/src/__tests__/App.panes.test.tsx，用 mock 的 window.api 渲染真实 App），断言「两栏之间存在一个分隔条」以及「pointerdown + pointermove 后首栏获得显式宽度」。补桩时先发现 jsdom 未实现 `Element.scrollTo` 会让面板区复位的那条 effect 抛错（真实 Electron 有该 API，属测试环境差异），补桩后**两个断言都通过**——说明事件处理与宽度计算本身是通的。

因此问题定位在**命中区域**：分隔条当时只有 6px 宽，而 `.panes` 还设了 12px 的 gap，于是它两侧各有一段 12px 的"死区"——鼠标略微偏离那条细线就落在没有监听的空隙上，表现就是"看得见、拖不动"。

修复：

1. 分隔条命中区扩大到 **16px**（`.panes` 去掉 gap，由分隔条自身占据间距），视觉上仍是一条细线：用 `::before` 画 2px 线，hover 时变 3px 并转为强调色，同时给整条 16px 区域一层浅底以提示可拖。
2. 拖拽开始时调用 `setPointerCapture(pointerId)`，指针即使离开这 16px 或容器滚动也能继续收到 move；并补 `pointercancel` 清理，避免中断后残留监听与 `user-select: none`。
3. 分隔条加 `touch-action: none`，触屏拖拽不会被解释为滚动。
4. 三栏的最小宽度公式同步为 `calc((100% - 32px) / 3)`（32px = 2 条分隔条），拖拽最小值也用同一个 `PANE_CHROME` 常量，CSS 与 JS 保持一致。

验证：145 项测试通过（新增 App 级两例：分隔条数量、拖拽后写入显式宽度）；typecheck 与 build 通过；dev 启动自检正常。请用户复测拖拽手感。

### 2026-10-04（三栏时拖拽无效果）

用户复测：**两栏拖拽正常；三栏时能看到浅底与蓝色竖线（说明命中区与 hover 都对了），但拖不动。** 这条线索直接指向数值而非事件——因为事件确实到达了分隔条。

根因是一个自相矛盾的约束：三栏时每栏宽度恰好等于 `(容器宽 - 32) / 3`，而我在拖拽里用的最小宽度**正是这个 1/3 值**（`max(280, (容器-32)/3)`）。于是 `resizePanes` 算出的新宽度总会撞到下限，左右两侧相抵，结果永远等于原值——两栏之所以正常，是因为两栏时每栏宽度远大于 1/3，有富余空间可分配。

修复：把「三栏」这个约束从**最小宽度**挪到**基准宽度**。

1. CSS 改为 `flex: 1 0 calc((100% - 32px) / 3)` + `min-width: 280px`：基准值保证三栏恰好铺满、`flex-shrink: 0` 保证第四栏才溢出滚动（FR-15），而最小宽度回到"可读下限"280px。
2. 拖拽的下限相应改为常量 `MIN_PANE_WIDTH`（280），不再用容器宽除以三；`PANE_CHROME` 常量随之删除。
3. 新增回归用例：`resizePanes(512, 512, ±100, 280)` 必须得到 612/412，直接锁住"三栏基准下仍能重新分配"这一点（此前若用 512 作下限，这个断言会失败）。

验证：146 项测试通过；typecheck 与 build 通过；dev 启动自检正常。请用户复测三栏拖拽。

### 2026-10-04（拖拽流畅度与代码评审）

用户确认三栏拖拽已正常，另反馈"拖动时有点卡"，并允许在不破坏现有功能的前提下优化。定位：每次 `pointermove` 都 `setPaneWidths` → App 重渲染 → 每个面板内的 Markdown/KaTeX 重新排版，这才是卡顿来源。两项优化：

1. **让拖拽只影响薄薄的外层**：`ConversationPane` 包上 `memo`，并把 App 传给它的回调改成**按 id 寻址的稳定回调**（`handlePaneClose` / `handleOpenBranch` 用 `useCallback`，配合 `openIdsRef` 读取当前列表以便聚焦邻居）。这样拖动时重渲染的只是面板外层 div，面板内容（消息、公式、书签栏）不再重排。
2. **按帧合并指针事件**：`pointermove` 用 `requestAnimationFrame` 合并，每帧最多一次状态更新；`pointerup` 时取消未执行的帧，保证落点准确。

评审结论（留痕 .agentic/reviews/2026-10-04T23-25-00-task-0007-multi-pane.md）：0 Blocker / 1 Standards Concern / 4 Standards Note / 0 Spec Concern。唯一的 Concern 是**书签栏折叠偏好**——它存在 localStorage（全局），但状态原先由每个面板各自持有，导致在一个面板折叠后其他已打开面板不会跟着变；已把状态上提到 App 并下传（同时保持回调研稳定，memo 不被破坏）。四条 Note 记录在案：面板宽度刻意只存在于会话内；`branchRanges` 对重复出现的段落只标第一处；拖拽中若发生其他重渲染会按已提交的宽度重绘（因为每帧都提交，所以安全，这也是没有直接用 DOM 写入的原因）；触屏拖拽依赖 Pointer Events + `touch-action: none`，未在真机触屏上验证。

评审后复跑：147 项测试通过、typecheck 与 build 通过。4 条验收标准、4 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
