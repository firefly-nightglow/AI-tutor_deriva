# Task 0013: 区域选中即问（全屏覆盖层框选）

**Status:** `done`
**Created:** `2026-10-08`
**Scope ref:** `doc/specs/0002-screen-capture-questions.md`
**Evidence ref:** ``
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0002-screen-capture-questions.md`
**Board ref:** ``

## Context

SPEC-0002 的第二条核心交互：用户框选屏幕上的公式、定理、题目步骤或视频字幕段直接提问（Scenario 2，FR-2）。形态已由 GROUND-0011 确认：先按物理分辨率截全屏，再在每显示器一个全屏无边框覆盖窗里展示截图，Pointer Events 拖拽选区，scaleFactor 换算后主进程裁剪，随后进入 Task 0012 的预览确认流程。多显示器与不同 DPI 组合是本任务最大的实测风险（SPEC-0002 Edge Cases、GROUND-0011 Limitations）。HITL：框选手感、触控可用性与多屏坐标由产品所有者本人验收。

## Acceptance Criteria

- [x] 用户先从某个显示器来源发起"框选局部"，覆盖层仅覆盖该来源显示器；Esc 或右键取消且不产生截图
- [x] 覆盖层展示所选来源的物理分辨率截图，鼠标与触控（Pointer Events）均可拖拽
- [x] 选区坐标经 scaleFactor 换算后在主进程裁剪，多显示器/不同缩放比例下不偏移（用户实测确认）
- [x] 过小选区（统一最小边阈值，物理像素）给出提示而非产生无意义截图
- [x] 框选完成后进入预览确认流程（复用 Task 0012），确认前不发送任何屏幕内容
- [x] 用户实操确认：在公式、题目文字、视频画面上各完成一次框选提问，预览内容正确

## Plan

- [x] 实现来源优先的显示器覆盖窗（截屏垫底渲染、选区矩形绘制、取消交互）
- [x] 实现 Pointer Events 拖拽与 scaleFactor 坐标换算，接入 Task 0011 裁剪
- [x] 选区结果接入 Task 0012 的预览确认流程
- [x] 补 jsdom 用例（选区矩形计算、过小区域拦截、取消路径）
- [x] 真实多显示器/DPI 实操验收（HITL）

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-08

任务创建，来源 SPEC-0002 拆解（Scenario 2，FR-2，NFR-3/NFR-5）。依赖 Task 0011/0012。GROUND-0011 已定形态，本任务实现前的触控细节如有不确定按 /ad-ground 轻量调研回填 Evidence ref。

### 2026-10-13

实现完成，状态置为 in-progress，等待真实屏幕验收。落地：

1. `src/main/capture/region-selector.ts`：按显示器枚举屏幕源，为每台显示器创建捕获会话与全屏无边框覆盖窗，处理覆盖层初始化、提交、取消与窗口关闭，成功后调用同一会话的 `cropCapture`。
2. `src/renderer/src/components/RegionOverlay.tsx`：覆盖层展示物理分辨率截图，Pointer Events 拖拽选区，Esc/右键取消，过小选区提示并保留覆盖层。
3. `src/renderer/src/lib/regionGeometry.ts`：选区归一化与覆盖层 CSS 像素到物理像素的换算；最小边 8 像素的预检查与主进程二次校验。
4. `src/renderer/src/components/ScreenshotDialog.tsx`：源选择页新增“框选屏幕”，结果直接进入 Task 0012 的确认预览；IPC/preload 新增 `selectRegion`、`regionInit`、`regionSelect`、`regionCancel`。

验证：区域几何 3 项、覆盖层交互 2 项、对话框框选入口 1 项 jsdom 用例通过；全量 `193` 项测试通过（37 个文件）；`npm run build`（含 node/web typecheck）通过。仍待用户实测单屏、多显示器与不同缩放比例下的框选手感与坐标精度。

### 2026-10-16

用户验收指出两个问题：过小选区提示未出现；区域选择没有先明确“截取哪个来源”。按产品所有者确认，先完成文档澄清，再按来源优先重构：

- SPEC-0002 FR-2 改为依次选择捕获来源与整幅/局部粒度；SPEC-0003 FR-6 明确 Deriva 资料面板使用内部渲染捕获后端；新增 ADR-0005 记录来源优先与 desktop/internal 双后端；新增 Task 0016 承接 SPEC-0003 的资料面板内部来源。
- `ScreenshotDialog` 的每张来源卡片现在提供“整幅截图”；显示器来源额外提供“框选局部”，不再存在不带来源语义的“框选屏幕”。
- `region-selector` 改为只捕获并覆盖用户所选的那一块显示器；外部窗口在 v2 仍只支持整幅捕获。
- 最小选区阈值统一为 `MIN_REGION_EDGE = 24` 物理像素（主进程裁剪与覆盖层预检查共用），过小选区在覆盖层内提示且不关闭覆盖层。

验证：全量 `193` 项测试通过（37 个文件）；`npm run build`（含 node/web typecheck）通过。仍待用户重新实测来源选择、过小提示，以及单/多显示器框选。

### 2026-10-16

用户确认验收通过，执行 `/ad-review`，留痕：`.agentic/reviews/2026-10-16T17-59-58-task-0013-region-selection.md`。评审结论：Standards 0 Blockers / 0 Concerns / 2 Notes；Spec 0 Blockers / 0 Concerns。两条 Note（Electron 覆盖窗无 jsdom 集成测试；外部窗口内部框选按 ADR-0005 明确推迟）均不阻塞。Status 置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
