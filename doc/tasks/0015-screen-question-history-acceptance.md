# Task 0015: 屏幕提问历史回看与 SPEC-0002 验收走查

**Status:** `done`
**Created:** `2026-10-08`
**Scope ref:** `doc/specs/0002-screen-capture-questions.md`
**Evidence ref:** ``
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0002-screen-capture-questions.md`
**Board ref:** ``

## Context

SPEC-0002 的收尾任务：让屏幕提问在 v1 的既有体系里完整落地并做全量验收。包括历史消息中的缩略图/原图展示与"只保留缩略图"标识（Scenario 4，FR-5/FR-6）、屏幕提问回答的选中开子对话与来源追溯（FR-8）、删除对话时附件清理（与 SPEC-0001 一致）、性能复核（NFR-3/NFR-4），以及按 SPEC-0002 Success Criteria 的完整走查（含 30 秒提问闭环计时）。HITL：验收结论由产品所有者本人判定。

## Acceptance Criteria

- [x] 历史消息中屏幕提问显示缩略图；保留原图的可查看原图，只保留缩略图的有明确标识
- [x] 重启应用后缩略图、提问、回答、对话树与引用关系完整恢复
- [x] 屏幕提问的回答可正常选中开子对话，子对话可回溯到来源回答与关联屏幕片段
- [x] 删除带屏幕附件的对话时附件文件清理规则与 SPEC-0001 一致
- [x] 预览从目标确认到可交互不超过 2 秒（单显示器实测）；含图片历史消息滚动切换无明显卡顿
- [x] 按 SPEC-0002 Success Criteria 逐条走查通过，含一次不超过 30 秒的完整截图提问闭环（用户计时确认）

## Plan

- [x] 实现历史消息附件展示（缩略图/原图/标识）
- [x] 验证重启恢复、子对话追溯与删除清理（补单元测试）
- [x] 性能复核（NFR-3/NFR-4 实测）
- [x] 编写 SPEC-0002 验收走查文档并逐条验收（HITL）

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-08

任务创建，来源 SPEC-0002 拆解（Scenario 4，FR-4/FR-5/FR-6/FR-8，NFR-3/NFR-4，Success Criteria）。依赖 Task 0011-0014 全部完成。对应 SPEC-0001 的 Task 0010 验收角色。

### 2026-10-16

实现历史截图回看与验收走查：

1. `OutgoingImage` / `MessageAttachment` 增加 `captureVariant`，截图发送时记录 `thumbnail` 或 `original`，AttachmentStore 随附件元数据持久化。
2. `MessageAttachments` 对截图附件显示“原图”或“仅保留缩略图”，点击图片可在全屏查看器中打开；普通图片不受影响。
3. 新增 `doc/product/v2-acceptance-walkthrough.md`，逐条对照 SPEC-0002 Success Criteria，并列出重启恢复、子对话追溯、删除清理和性能检查。

验证：历史附件标识/查看器、截图发送变体与附件元数据测试通过；全量测试与构建结果在收尾 Notes 记录。状态为 in-progress，等待用户完成重启、计时和树状对话追溯验收。

### 2026-10-16

用户验收发现两个问题并已修复：

1. **原图查看器尺寸异常**：附件查看器此前移除了图片的 `max-width/max-height`，4K 原图会按自然尺寸撑开。现改为在视口内按比例适配（`max-width: calc(100vw - 32px)`、`max-height: calc(100vh - 96px)`、`object-fit: contain`）。缩略图行为不变。
2. **多个对话的书签栏联动**：书签栏折叠状态原来是 App 中的单个布尔值，所有 pane 共用。现改为按对话 id 存储的集合（`readCollapsedRails` / `saveCollapsedRails` / `toggleCollapsedRail`），每个面板独立展开或折叠，并补了 App 级回归测试。

验证：全量 `203` 项测试通过（40 个文件）；`npm run typecheck`、`npm run build` 通过。状态保持 in-progress，等待用户重新验收原图查看与多对话书签栏独立性。

### 2026-10-17

用户确认原图查看、独立书签栏以及重启/追溯/删除/性能验收全部通过，执行 `/ad-review`，留痕：`.agentic/reviews/2026-10-17T08-23-34-task-0015-history-acceptance.md`。评审结论：Standards 0 Blockers / 0 Concerns / 2 Notes；Spec 0 Blockers / 0 Concerns。两条 Note（旧附件无变体元数据、查看器无焦点陷阱）均不阻塞。Status 置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
