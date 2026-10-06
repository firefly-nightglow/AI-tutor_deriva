# Task 0009: 实现删除级联确认、重名规则与模型标识

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0009-ground-cascade-delete-confirmation.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

本任务收敛规格中的边界行为：FR-11（删除有子节点的对话须二次确认并显示受影响子孙数量，确认后级联删除；OQ-3 决议硬删除无回收站）、FR-12（对话标题允许重名、科目名不允许）、FR-13（切换模型后历史消息保留原模型标识）。

## Acceptance Criteria

- [x] 删除含子孙的对话时弹出确认，显示将一并删除的子孙对话数量；确认后整棵子树删除且不可恢复
- [x] 删除当前查看中的对话时面板关闭并回到父对话
- [x] 对话标题重名正常保存；科目重名创建被拒绝并提示
- [x] 切换默认模型后，历史消息仍显示各自原模型标识，新消息显示新模型；旧对话无任何回溯性修改

## Plan

- [x] 删除确认对话框（子孙数量统计来自数据层级联查询）
- [x] 科目重名校验
- [x] 模型标识渲染与切换模型的行为验证
- [x] 边界场景手动回归（异常退出恢复、跨段落引用等已在其他任务覆盖的除外）

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0001（级联删除）、Task 0003（界面）。

### 2026-10-05

完成 /ad-ground：doc/research/0009-ground-cascade-delete-confirmation.md（校验 valid: true，A2/B1/C2/D1，5 条 claim）。结论：破坏性确认用平台原生 `<dialog>` + `showModal()`（MDN 明确建议用方法而非 `open` 属性），语义按 W3C WAI-ARIA 的 alert dialog 模式（官方把"操作确认"点名为典型用例）；子孙数量不新增查询，而是从已加载的对话树一次性算出。具名偏离：不引入 @radix-ui/react-alert-dialog 这类无障碍弹窗库——它实现同一模式，但本应用只跑随包 Chromium，原生 dialog 已覆盖模态、焦点与 Esc。

实现落点：

1. `lib/grouping.ts` 新增 `descendantCounts(all)`：一次自底向上遍历得到每个节点的子孙总数（纯函数）。App 以 `useMemo` 计算并下传给侧栏。
2. `SubjectSidebar` 把原先的"两步内联确认"换成 `<dialog>` 确认框：标题为「删除「X」？」，正文按是否有子孙给出「将同时删除 N 个子对话。」或「这条对话没有子对话。」并统一声明「删除后无法恢复。」，按钮为取消 / 删除（带 `aria-label="确认删除"`）。`showModal()` 与 `close()` 都做了能力守卫，因为 jsdom 未实现 `HTMLDialogElement`。
3. 对话框样式用主题令牌（含 `::backdrop` 遮罩），深浅色主题一致。

验证：160 项测试通过。新增用例——`descendantCounts` 对一棵含两个孙节点的树给出 {root:3, a:2, a1:0, a2:0, other:0}；删除确认框显示受影响子孙数量、无子孙时给出对应文案、**点击确认前不会触发删除**（证明是"先确认后删"）；以及 FR-13 的模型标识用例：同一对话先用 deepseek-flash 提问、切换默认模型为 deepseek-v4-pro 再提问，消息序列为 `[(user,null),(assistant,deepseek-flash),(user,null),(assistant,deepseek-v4-pro)]`——历史消息保留原标识，新消息用新模型，旧行未被改写。FR-12 的科目重名由仓储层唯一约束 + 中文提示覆盖（Task 0001/0003 的测试与修复），删除回到父对话由 Task 0007 覆盖。typecheck 与 build 通过，dev 启动自检正常。

未自动验证：原生 `<dialog>` 在 Electron 下 Esc 关闭与焦点回归的实际行为（GROUND-0009 的 Limitations 已记录，需实操确认）；对话框文案与观感需走查。

代码评审尚未进行，状态保持 in-progress。

### 2026-10-05（代码评审与关闭）

执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-05T01-32-06-task-0009-cascade-confirmation.md。结论：**0 Blocker / 0 Concern / 2 Note / 0 Spec Concern**，两个轴都没有需要修复的问题。

两条 Note：

1. **破坏性操作不对称**：删除**对话**有确认框，删除**科目**没有——点下去立即执行。这不是数据丢失（外键是 `ON DELETE SET NULL`，科目下的对话会回落到「未分类」），但一个装着许多对话的科目会在没有任何提示的情况下被拆散。任务规格没有要求，因此不改代码，只记录到 Task 0010 的验收走查里，届时再决定是否需要对称的确认。
2. 原生 `<dialog>` 的 `showModal()`/`close()` 都做了能力守卫（jsdom 不实现 `HTMLDialogElement`），而"已关闭的对话框不在无障碍树里"是正确行为——测试因此用选择器定位按钮而不是角色查询。Esc 关闭与焦点回归由用户实操确认，没有自动化测试覆盖。

用户已实操确认：确认框写明将一并删除的子孙数量、Esc 可取消、焦点不出框、确认后整棵子树删除且正在查看的面板关闭并回到父对话、深浅色主题表现一致。

评审未改动任何代码；复跑 160 项测试、typecheck 与 build 保持通过。4 条验收标准、4 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
