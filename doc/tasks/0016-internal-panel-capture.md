# Task 0016: Deriva 资料面板内部捕获后端

**Status:** `done`
**Created:** `2026-10-16`
**Scope ref:** `doc/specs/0003-floating-window-split.md`
**Evidence ref:** `doc/research/0014-ground-material-panel-capture.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0003-floating-window-split.md`
**Board ref:** ``

## Context

SPEC-0003 的分屏资料面板属于 Deriva 自身界面，不能通过 `desktopCapturer` 捕获：外部捕获前会隐藏 Deriva 窗口，来源列表也会过滤自身窗口。ADR-0005 已确定内部来源使用 `webContents.capturePage` / `WebContentsView.capturePage`，本任务负责把这个后端接到来源选择、整幅捕获与局部框选流程中，使“对分屏资料面板截图提问”在 SPEC-0003 落地时不需要再改捕获架构。

## Acceptance Criteria

- [x] 分屏资料面板注册为内部捕获来源，来源卡片显示“Deriva 资料面板”及当前文档/页面标识
- [x] 内部来源支持整幅捕获与局部框选；局部框选使用面板自身的物理像素图像，不隐藏 Deriva，不依赖 desktopCapturer
- [x] 内部来源与外部来源共用同一套预览确认、缩略图/原图、附件保存和发送流程
- [x] 内部捕获失败（WebContentsView 已销毁、页面未加载完成、面板不可见）给出可理解错误并保留对话可用
- [x] 内部来源的坐标换算在面板缩放、分屏比例变化和多显示器场景下不偏移
- [x] 用户实操确认：在分屏资料面板中框选公式、代码或网页内容并完成一次提问，预览内容正确

## Plan

- [x] 在 capture 层实现内部来源描述与 `webContents.capturePage` 适配器
- [x] 将内部来源接入 Task 0012 的来源选择与 Task 0013 的区域选择会话模型
- [x] 实现内部来源的物理像素坐标换算与裁剪
- [x] 补单元测试与 HITL 验收

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-16

任务创建，来源 ADR-0005 与 SPEC-0003 FR-6 的架构明确。依赖 SPEC-0003 的内嵌资料面板实现；本任务不在 v2 提前实现。

### 2026-10-17

完成可独立交付的内部捕获后端部分：

1. `image-encoding.ts`：抽取桌面/内部后端共用的缩略图与原图编码。
2. `internal-capture.ts`：实现 `createInternalCapture` 与 `createWebContentsCaptureTarget`；内部来源使用 `webContents.capturePage`，支持整幅与矩形区域捕获、原图降级和已销毁面板的分类错误。
3. `CaptureSourceKind` 扩展 `internal`；来源卡片可识别“资料面板”。
4. 新增内部捕获单元测试，验证整幅/区域捕获、原图降级、来源过滤和面板关闭错误。

验证：全量 `207` 项测试通过（41 个文件）；`npm run typecheck`、`npm run build` 通过。

**阻塞项**：SPEC-0003 的内嵌资料面板尚未实现，因此无法把真实面板注册为来源、无法完成来源卡片和真实框选验收。需要先为 SPEC-0003 拆出并实现资料面板任务，才能完成本任务的剩余验收标准。后端接口已按 ADR-0005 预留，面板落地后可直接接线。

### 2026-10-19 — 真实面板接线落地

原“没有真实资料面板”的阻塞已由 Task 0018 解除，来源注册、聚合、整幅捕获、冻结图框选与统一预览发送已在 Task 0019 实现。自动验证与未完成的实机项目统一记录在 `0019-material-panel-capture-integration.md`，不重复维护两份验收记录。本任务保持 in-progress，待 Task 0019 的真实资料/多屏验收与代码评审后统一收尾。

### 2026-10-20 — 随 Task 0019 完成

用户确认实机验收通过，Task 0019 双轴评审无未解决 Blocker/Concern。内部来源注册、真实 WebContentsView 捕获、冻结图局部框选、统一预览发送与历史回看均完成；评审留痕见 `.agentic/reviews/2026-10-20-task-0019-material-capture.md`。本任务原本剩余的接线与验收项全部关闭，状态置 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
