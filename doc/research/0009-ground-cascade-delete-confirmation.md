# GROUND-0009: 级联删除的确认、重名规则与模型标识

**Status:** recorded
**Decision:** 破坏性删除的确认用平台自带的 `<dialog>` + `showModal()`（不引第三方弹窗库），语义上按 WAI-ARIA 的 alert dialog 处理；确认文案里给出**将被一并删除的子孙对话数量**，数量由已加载的对话树一次性算出（纯函数 descendantCounts）；科目重名沿用仓储层的唯一约束并把中文错误提示到界面；消息的模型标识在写入时固定，界面按消息行渲染，因此切换默认模型不会改动历史。
**Decision ref:** doc/tasks/0009-deletion-rename-model-badge.md
**Confidence:** Strong

## Decision and confidence

Happy path：确认对话框用 HTML 原生的 `<dialog>` 元素，MDN 明确建议用 `.show()` / `.showModal()` 渲染而不是直接设 `open` 属性（A1），因此模态行为、焦点管理、Esc 关闭、`::backdrop` 都由平台提供，不需要自己实现遮罩与焦点陷阱。语义上按 W3C WAI-ARIA 的 Alert Dialog 模式处理——官方描述是 a modal dialog that interrupts the user's workflow to communicate an important message and acquire a response，并点名 action confirmation prompts 正是它的典型用例（A2）。删除影响的子孙数量不需要新查询：`conversations.listAll()` 已经带回全部对话，一次自底向上的遍历就能得到每个节点的子孙数（纯函数，可测）。

一处具名偏离：

1. **不引入 @radix-ui/react-alert-dialog 这类无障碍弹窗库**（B1）。它确实按同一套 WAI-ARIA 模式实现（当前版本 1.1.23），但本应用只跑随包发布的 Electron/Chromium，原生 `<dialog>` 已覆盖模态、焦点与 Esc，引库换来的主要是跨浏览器兼容——而我们没有跨浏览器需求。与 GROUND-0006/0007/0008 的取舍标准一致：为不存在的差异付依赖不划算。

Axis-2 verdict: Strong。对话框行为与语义都有官方文档直接对应，子孙计数是纯函数且可测；FR-13（模型标识）在本仓库已经是"写入时固定 + 按行渲染"的结构，属于验证而非新建。

## Evidence

### E1 — 用原生 dialog 的 showModal() 渲染模态

**Strength:** High
**Provenance:** A1

A1 原文：It is recommended to use the `.show()` or `.showModal()` method to render dialogs, rather than the `open` attribute，并说明 `showModal()` 打开的是模态对话框、可由平台级动作（桌面端按 Esc）关闭。因此开发者不必自己实现遮罩、焦点陷阱与 Esc 处理。

### E2 — 破坏性确认应按 alert dialog 语义处理

**Strength:** High
**Provenance:** A2

A2 原文：An alert dialog is a modal dialog that interrupts the user's workflow to communicate an important message and acquire a response. Examples include action confirmation prompts and error message confirmations. 并说明 `alertdialog` 角色让辅助技术把这类对话框与其他对话框区分开（例如播放系统提示音）。删除一棵对话子树属于不可恢复操作，正是该模式的用例。

### E3 — 同类无障碍弹窗库存在，但本项目不需要

**Strength:** Medium
**Provenance:** B1

B1（@radix-ui/react-alert-dialog 1.1.23）是同一模式的 headless 实现，其文档提供 Trigger/Content/Cancel/Action 等组合件。强度记 Medium：这是对同类实现定位的判断；是否引入取决于跨浏览器需求，而本应用只跑随包 Chromium。

### E4 — 仓库内已有级联删除与模型标识的实现基础

**Strength:** High
**Provenance:** C1, C2

C1：conversations 表的 `parent_conversation_id` 带 `ON DELETE CASCADE`，仓储的 `remove` 依赖数据库级联，`listTree` 能取回整棵子树——因此"删除影响多少"可以在渲染层用已有数据算出，删除本身已由 Task 0001 的测试覆盖。C2：messages 表在写入时记录 `model`，渲染层按消息行显示模型徽标（Task 0003），因此 FR-13 要验证的是"切换默认模型不改动历史"，而不是新增字段。

### E5 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，属可复现的 no prior attempt found。

## Source register

- **A1:** MDN `<dialog>` 元素，建议用 show()/showModal() 渲染而非 open 属性，并说明模态与平台级关闭方式，https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog (accessed 2026-10-05 via curl fetch of official docs page)
- **A2:** W3C WAI-ARIA Authoring Practices，Alert and Message Dialogs Pattern，定义为打断用户流程以获取回应的模态对话框，典型用例含操作确认，https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/ (accessed 2026-10-05 via curl fetch of official docs page)
- **B1:** @radix-ui/react-alert-dialog 1.1.23，npm registry 元数据与包说明（同一无障碍模式的 headless 实现），https://www.npmjs.com/package/@radix-ui/react-alert-dialog (accessed 2026-10-05 via curl fetch of registry.npmjs.org)
- **C1:** 仓库内 `src/main/db/schema.ts` 的 conversations 外键级联定义与 `src/main/db/repositories/conversations.ts` 的 remove/listTree (accessed 2026-10-05 via local shell)
- **C2:** 仓库内 `src/main/db/schema.ts` 的 messages.model 字段、`src/main/llm/chat-service.ts` 写入时的模型记录与 `src/renderer/src/components/ConversationView.tsx` 的模型徽标渲染 (accessed 2026-10-05 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-05 via local shell)

## Limitations and reversal

本记录不能证明：原生 `<dialog>` 在 Electron 39 的 Chromium 上对 Esc 与焦点回归的行为与文档一致（需实测一次）；子孙数量在极大树上的遍历开销（一次 O(n) 遍历，n 为对话数，可忽略）；科目重名提示的措辞是否足够清楚（属文案判断）。反转条件：若实测发现原生 dialog 在 Electron 下焦点行为异常，或将来需要跨浏览器/跨运行时复用该对话框，则回到 B1 评估引入 headless 弹窗库。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0009-ground-cascade-delete-confirmation.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
