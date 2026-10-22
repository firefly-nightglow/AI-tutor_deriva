# Task 0019: 资料面板接入内部捕获来源

**Status:** `done`
**Created:** `2026-10-17`
**Scope ref:** `doc/specs/0003-floating-window-split.md`
**Evidence ref:** `doc/research/0014-ground-material-panel-capture.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0003-floating-window-split.md`
**Board ref:** ``

## Context

Task 0016 已实现 `internal-capture` 后端，但还没有真实资料面板可以注册；Task 0018 将交付该面板。本任务把面板注册为内部捕获来源，并接入 SPEC-0002 的来源选择、整幅捕获、局部框选、预览确认与历史回看流程，使分屏中的公式、代码或网页内容可以直接提问，不依赖 `desktopCapturer`，也不隐藏 Deriva。

## Acceptance Criteria

- [x] 来源选择器出现“Deriva 资料面板”，显示当前文档/页面标识；面板销毁或未就绪时不可选并给出原因
- [x] 资料面板支持整幅捕获与局部框选；局部框选直接使用面板 WebContents 的内容，不隐藏 Deriva、不调用 desktopCapturer
- [x] 内部来源与外部来源共用预览确认、缩略图/原图、附件保存、发送、书签和历史回看流程
- [x] 面板缩放、分屏比例变化和多显示器场景下，框选坐标映射到面板物理像素不偏移
- [x] 普通窗口横向分屏与悬浮抽屉纵向堆叠之间切换、抽屉宽度拖动时，内部框选坐标仍准确
- [x] 面板加载失败、销毁或不可见时，截图流程给出可理解错误且对话面板保持可用
- [x] 用户实操确认：在分屏资料面板中框选公式、代码或网页内容，完成提问并在历史中正确回看

## Plan

- [x] 将 Task 0018 的 WebContentsView 注册到内部捕获 registry
- [x] 聚合桌面来源与内部来源，统一来源选择器的 kind/标签/过滤
- [x] 实现内部来源的整幅与局部框选路径，并处理面板尺寸/缩放坐标
- [x] 处理横向/纵向槽位切换与抽屉宽度变化时的 bounds 同步和坐标重映射
- [x] 接入 Task 0012 的预览确认与 Task 0015 的历史回看
- [x] 补单元测试、坐标测试与 HITL 验收

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-17

任务创建，来源 SPEC-0003 拆解（Scenario 4，FR-6，NFR-3）。依赖 Task 0016（内部捕获后端，已完成后端部分）与 Task 0018（真实资料面板）。本任务完成 Task 0016 剩余的真实面板接线与验收。

### 2026-10-18

SPEC-0003 修订后，资料面板可能出现在普通窗口的横向槽位，也可能出现在悬浮抽屉的纵向槽位；抽屉宽度还可拖动变化。内部捕获的框选坐标必须以面板当前 bounds 与缩放比例实时映射，不能缓存固定矩形。

### 2026-10-19 — 实现与自动验证

Task 0018 用户验收与双轴评审收尾后开始本任务。四源记录：`doc/research/0014-ground-material-panel-capture.md`，结构校验 valid=true、unreadable=[]。复核引用时发现最初查阅的上游 api-web-contents-spec 不包含 capturePage 用例，已改用实际包含遮挡捕获测试的 api-browser-window-spec:2256-2323，不沿用错误定位。

实现：

1. `material/panel.ts` 按需暴露稳定的 `internal:material` 来源、当前标题、加载/空白/错误/关闭/不可见原因和当前屏幕 DIP bounds；捕获前后校验 view、导航代次、缩放与尺寸变化。
2. `capture/router.ts` 聚合来源并路由内部整幅/区域/会话操作；内部专用枚举也不调用桌面平台。`internal-capture.ts` 把原生快照转成单一物理像素图，保存冻结会话并裁剪，复用缩略图/原图、尺寸上限、最小选区与五分钟过期规则。
3. 区域覆盖窗放在资料当前矩形上，复用 RegionOverlay 的图像/视口比例映射，不把网页 zoom 或 DPI 再乘一次；取消、加载失败与关闭会释放快照/窗口。截图弹窗关闭时取消尚未完成的选择，防止迟到的截图打开孤立覆盖窗。
4. 截图来源选择器加入内部面板与局部入口，不可用卡片禁用并说明原因。确认/原图选项/发送/附件/书签保持原管线。原生 view 被模态层临时遮挡不等同于资料关闭，仍可内部截图；RegionOverlay 显示真实错误而非一律报告选区太小。

验证：全量 49 文件、250 项测试通过；`npm run build`（含双侧 typecheck）通过。`scripts/material-capture-smoke.ts` 在隔离配置通过真实 WebContentsView、真实 Pointer Events 选区、JPEG 像素标记校验：当前 150% 设备缩放，以及模拟 100%/200%；页面 50%/100%/150% 与不同面板矩形均正确；主窗口 hide=0，桌面平台调用=0。Windows 非整数缩放的窗口 DIP 舍入容差最多 3px，裁剪仍按实际覆盖窗/图像比例映射。已查看覆盖窗截图。

`scripts/material-app-smoke.ts` 使用独立 userData 与本机模拟 API，完整应用普通/悬浮预览、资料 view 模态遮挡与恢复、图片请求、SQLite 附件引用与图片回读、回答书签均通过；已查看两种布局截图。不使用真实 Key、不消耗模型费用、不修改用户数据库。该脚本的早期窗口定位/等待条件错误已修正，不作为产品缺陷或“测试波动”归因。

复跑命令：先 `npm run build`；再用 esbuild 将两个 smoke 分别 bundle 到 `out/main/<同名>.cjs`，`--platform=node --external:electron --format=cjs`，最后 `electron out/main/<同名>.cjs`。原生脚本可设置 `DERIVA_SMOKE_SCALE=1/2` 和 `DERIVA_SMOKE_CAPTURE=1`；测试图片/配置位于忽略的 `node_modules/.cache/deriva-material-*-smoke`。

待 HITL：真实学习资料整幅/局部提问与重启历史、普通/悬浮切换后拖动比例与抽屉宽度、物理混合 DPI 多屏迁移、触控与受保护视频。两项坐标相关验收保留未勾选，不能把模拟设备缩放等同于真实混合多屏验收；Task 0019 与关联 Task 0016 均暂不置 done，等待用户确认与后续代码评审。

### 2026-10-20 — 验收与评审收尾

用户确认 Task 0019 实机验收通过，包括真实资料面板整幅/局部截图、提问、历史回看、普通/悬浮布局、分屏比例与抽屉宽度变化。此前未勾选的坐标与 HITL 条目按用户验收关闭。

运行 `/ad-review` 单会话双轴评审，留痕：`.agentic/reviews/2026-10-20-task-0019-material-capture.md`（76 行，工作区范围 0 个提交，原子性检查通过）。评审发现并修复一个语义问题：内部资料面板被包装为选择覆盖层的显示对象时，`size` 误用了带 `x/y` 的 bounds；改为显式宽高。复查无未解决 Blocker/Concern。

最终门禁：全量 49 个文件、250 项测试通过；`npm run build`（含双侧 typecheck）通过；`git diff --check` 通过；隔离原生截图 smoke 与完整应用普通/悬浮截图、附件、书签 smoke 通过。隔离原生 smoke 首次启动在捕获前返回一次 Electron “Current display surface not available for capture”，同一命令立即复跑通过；不以单次失败推断产品 flaky，该观察已写入评审留痕。

Task 0019 置 done；它完成的内部捕获接线同时关闭 Task 0016 的剩余验收。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
