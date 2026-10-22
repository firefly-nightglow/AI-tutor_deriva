# GROUND-0014: 资料面板截图接线

**Status:** recorded
**Decision:** 延续 ADR-0005 的双后端；在主进程聚合内部/桌面来源，内部来源捕获一次 WebContents 快照，再在面板当前屏幕矩形上复用区域选择覆盖窗和物理像素裁剪。内部快照不隐藏主窗口、不调用桌面捕获；模态层临时遮住原生 view 不等同于资料关闭。
**Decision ref:** doc/tasks/0019-material-panel-capture-integration.md
**Confidence:** Conditional

## Decision and confidence

A1 的内部快照接口、B1 的遮挡窗口捕获用例，以及 C1 的静态图裁剪实现共同支持：直接捕获资料 view，按实际图片尺寸映射选区，复用覆盖窗与发送管线。D1 未发现已提交的类似实现。无架构偏离，不引入 DOM 截图或桌面自拍兜底。初始 Conditional 的缓解是先跑原生像素测试；下方保留实测与硬件边界，不能用模拟缩放替代真实混合 DPI 双屏验收。

## Evidence

### E1 — 内部快照与物理图像裁剪可复用

**Strength:** High
**Provenance:** A1, A2, B1, C1

Electron `capturePage` 提供 `stayHidden`；NativeImage 支持比例表示、PNG 与裁剪。先转成单一物理像素图，再由实际宽高映射选区，不重复乘 DPI/网页缩放。B1: `spec/api-browser-window-spec.ts:2256-2323` 包含 `const visibleImage = await w1.capturePage();` 与非空断言，验证遮挡时的同类捕获路径；这不是 WebContentsView 多屏验证，后者由本地 smoke 补足。

### E2 — 现有冻结会话和附件链路可保留

**Strength:** High
**Provenance:** C1, C2

内部后端已共享编码；桌面后端有静态图会话与 TTL，RegionOverlay 按图像/覆盖窗比例映射；控制器掌握当前 view/bounds/加载状态。因此只新增来源聚合与内部会话，不改变外部隐藏逻辑、附件或聊天服务。

### E3 — 无已提交的内部捕获接线

**Strength:** High
**Provenance:** D1

当前分支仅 main 与 origin/main；相关 git log 仅见 v1 发布提交，无内部捕获接线历史。未提交 Task 0016/0018 是本次基线。

## Source register

- **A1:** https://www.electronjs.org/docs/latest/api/web-contents （capturePage / stayHidden / will-navigate）(accessed 2026-10-19 via web tool)
- **A2:** https://raw.githubusercontent.com/electron/electron/v39.2.6/docs/api/native-image.md （比例表示、toPNG、getSize、crop；本地 electron.d.ts 确认版本接口）(accessed 2026-10-19 via web tool)
- **B1:** https://raw.githubusercontent.com/electron/electron/v39.2.6/spec/api-browser-window-spec.ts:2256-2323 （上游遮挡窗口捕获测试；初查 api-web-contents-spec 未找到 capturePage，故不用它作证）(accessed 2026-10-19 via web tool)
- **C1:** `src/main/capture/internal-capture.ts:1`、`screen-capture.ts:1`、`region-selector.ts:1`、`src/renderer/src/lib/regionGeometry.ts:20`，内部编码、冻结会话和坐标映射 (accessed 2026-10-19 via local shell)
- **C2:** `src/main/material/panel.ts:1`、`src/renderer/src/components/ScreenshotDialog.tsx:1`、ADR-0005，真实 view 生命周期与共享预览发送 (accessed 2026-10-19 via local shell)
- **D1:** `git log -4 --oneline -- src/main/capture src/main/index.ts`（仅 v1 发布 06c24e7）；`git log --all --oneline --grep=capture` 无结果；`git branch -a` 仅 main/origin/main，no prior attempt found (accessed 2026-10-19 via local shell)

## Plan And Test Dependencies

测试依赖：内部后端测试覆盖编码、区域会话与生命周期；新增聚合器测试覆盖内部路线不触碰桌面平台；panel 测试覆盖可用状态；ScreenshotDialog 测试覆盖来源、不可用原因、预览与发送；既有 regionGeometry/RegionOverlay 测试覆盖物理坐标/小选区；附件和聊天测试继续覆盖历史图片与书签。先用内部会话测试证明冻结与裁剪，再接真实 view 和 UI。

## Limitations and reversal

Conditional：通过独立 Electron smoke 验证真实 native view、内容缩放、不同 bounds 与设备缩放；物理双屏迁移、触控和受保护视频仍需用户实测。捕获仅限面板当前视口，不做网页长截图、后台采集或字幕总结。若 native view 隐藏时无法捕获，先修复可见性协调，不退回桌面自拍。不得把私有资料或 API Key 写入调研记录。

## Audit path

实施后测量：`scripts/material-capture-smoke.ts` 在真实 Electron 39 上通过设备 100%/当前 150%/模拟 200%，不同 view bounds 与网页 50%/100%/150% 的真实 Pointer Events 框选、JPEG 像素标记断言；主窗口 hide=0、desktop 平台调用=0。`scripts/material-app-smoke.ts` 完整应用普通/悬浮截图预览与本机模拟 API 附件、书签路径通过。已查看两类布局与选区截图。以上增强 E1 的本机证据，不把模拟 DPI 当作真实混合多屏迁移结果。

`node "C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs" doc/research/0014-ground-material-panel-capture.md`；复核外部来源必须重新打开网页，不以结构校验替代内容核验。
