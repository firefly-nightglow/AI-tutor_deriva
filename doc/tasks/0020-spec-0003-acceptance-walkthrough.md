# Task 0020: SPEC-0003 验收走查与恢复性能检查

**Status:** `in-progress`
**Created:** `2026-10-17`
**Scope ref:** `doc/specs/0003-floating-window-split.md`
**Evidence ref:** `doc/research/0015-ground-floating-split-acceptance.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0003-floating-window-split.md`
**Board ref:** ``

## Context

SPEC-0003 的收尾任务：把悬浮窗、快捷入口、窗口级分屏、资料面板和内部截图放在真实使用场景中做完整验收，覆盖成功标准、边缘情况和性能要求，并确认没有破坏 SPEC-0001 的树状对话与 SPEC-0002 的截图提问。

## Acceptance Criteria

- [x] SPEC-0003 六条 Success Criteria 逐条走查通过，记录证据与状态
- [x] 全局热键冲突、显示器断开、窗口越界、分屏比例失效、网页/视频加载失败等 Edge Cases 均有可理解降级
- [x] 全高抽屉、左右吸附、宽度拖动、跨显示器移动、圆形气泡、托盘、最小化、单实例与重启展开逐项走查
- [x] 悬浮模式侧栏浮层、纵向多对话与纵向资料面板在 440px 宽度下可用，关闭按钮不被遮挡
- [x] 流式回答期间切换窗口模式、吸附、分屏比例和资料面板，不丢消息、不阻塞回答
- [x] 触控设备上悬浮窗拖拽、吸附、分屏比例、关闭/展开控件满足 44px 热区
- [x] SPEC-0001 的树状侧栏、书签、链路图、多面板删除确认和 SPEC-0002 的截图历史在悬浮窗/分屏下均可用
- [x] 形成 `doc/product/v2-floating-split-walkthrough.md`，区分自动证据、实操证据与待验项

## Plan

- [x] 编写 SPEC-0003 验收走查文档与边界条件检查表
- [x] 执行自动化回归（窗口状态、来源聚合、内部截图、分屏布局）
- [x] 执行 HITL 性能与触控验收（切换、吸附、分屏、流式并存）
- [x] 执行召回路径验收（任务栏、托盘、气泡、热键、重复启动）与抽屉宽度拖动流畅度检查
- [x] 登记走查发现的缺陷并决定是否新增任务

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-17

任务创建，来源 SPEC-0003 拆解（Success Criteria、Edge Cases、NFR-1/NFR-4/NFR-5/NFR-6）。依赖 Task 0017-0019 全部完成，对应 SPEC-0002 的 Task 0015 验收角色。

### 2026-10-18

验收范围补充全高抽屉形态、圆形气泡、常驻托盘、最小化/收起分工、单实例恢复、重启展开、悬浮侧栏浮层、纵向多对话与纵向资料面板。SPEC-0004 的外部应用并排不属于本任务，由 Task 0023 单独验收。

### 2026-10-20

产品所有者授权 Task 0020 先做四源调研再执行，v3 两阶段调研继续延后。GROUND-0015 完成并通过结构校验（valid: true、unreadable: []）；结论是复用现有隔离 Electron 驱动，新增跨进程恢复与流式并存检查，以原生状态断言区分自动证据和 HITL。

交付 `doc/product/v2-floating-split-walkthrough.md`，将六条成功标准对应到自动证据、既有实操与 H1–H10 待验项。新增 `scripts/floating-split-smoke.ts` 和 `scripts/run-window-acceptance.cjs`；已有资料截图驱动补上独占配置检查、超时及正常退出清理，避免第二实例未执行断言却被视为通过。

本轮发现并修复高 DPI 逻辑宽度累计：移动吸附原本把原生 getBounds 的舍入宽度写回设置，440 DIP 经移动/恢复可变为 442。新增 manager 公共接口回归测试先复现 441≠440，再将吸附改为钳制当前用户逻辑宽度；真实跨进程恢复验证保持 440。生产改动仅这一处宽度赋值及原因注释；不新增窗口抽象。

诊断留痕：初版复合脚本出现 CaptureError 空图；重复驱动曾用 windowsHide 隐藏 GUI，导致主窗口可见断言超时。三个候选分别为图片归一化丢失、视图状态/尺寸异常、加载完成与绘制时序不一致。原生探针曾读到有效 662×800 图像，因此不能仅凭空图推定编码算法错误。启动器改用正常 GUI 条件后完成正式重复检查；撤回诊断中尝试的 did-finish-load 显示兜底，主进程启动行为不变，清除临时 DEBUG 输出。空图观察保留在 H10，不声称单次观测根因已解决。

验证结果：

- `npm test`：50 文件、251 项通过；`npm run build`：主/渲染类型检查及构建通过；两个 TypeScript 冒烟驱动单独类型检查通过。
- `node scripts/run-window-acceptance.cjs --runs=10`：10 组 × exercise/restore/invalid/material 四阶段，共 40 个结果，40 通过、0 失败。每条必须同时具备退出码 0 与 PASS 输出；日志和阶段一一对应，无辅助进程计数。结果在忽略目录 `node_modules/.cache/deriva-window-acceptance/results.json`，可用上述命令重现；中止的早期调试尝试不计入这组分布。
- 测量范围：Windows / Electron 39.8.10 / 150% / 1707×1019 DIP；驱动启动至可见且桥接就绪 355–1126ms，模式切换至 DOM 状态 9–25ms。仅为本机观测，不是通用帧率或新增性能阈值。
- 正式驱动验证：分片流式回答在切换后继续显示，草稿不丢；纵向分屏比例可调整、资料关闭重开为空；气泡原生鼠标展开、最小化、第二实例恢复、独立进程热键冲突；收起退出后重启恢复左侧 440px 并展开；非法显示器/越界回退后历史、合成附件和书签仍可读。
- 资料驱动验证真实内部截图的普通/悬浮预览、模态遮挡恢复、模拟图像 API 发送、附件和书签；人工查看本轮 floating-preview.png，确认非空且预览、输入和操作按钮可见。
- `git diff --check` 通过；未引入孤立 TODO/FIXME；未提交或推送。

本任务保持 in-progress：需要按走查文档完成 H1–H10 的最终实机回归，尤其是真实触屏、多显示器拔插、任务栏/托盘菜单及真实截图跨重启闭环；随后进行本任务代码评审。现有 Task 0017–0019 的用户验收作为既有证据保留，不推定为本轮硬件验收，也不把合成图片恢复等同于真实截图恢复。宽度问题在本任务内修复，不另开重复任务。

### 2026-10-21

产品所有者在本轮明确回复“全部验收完毕”，据此登记走查 H1-H10 及关联验收标准为用户确认通过。此处是用户实机验收的声明，不冒充代理重新操作，也不补造硬件型号、逐项测量或截图。代码评审尚未进行，任务保持 in-progress；按用户指示先开始 Task 0021 的 ground 与隔离技术验证。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
