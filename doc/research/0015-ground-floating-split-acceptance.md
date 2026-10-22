# GROUND-0015: SPEC-0003 的隔离运行验收与实机证据边界

**Status:** recorded
**Decision:** 复用现有 Electron 冒烟脚本方式，在隔离用户目录内验证窗口状态、重启、单实例和流式并存；以规格六条成功标准组织走查，并保留触控、多显示器及系统托盘实操待验项。
**Decision ref:** doc/tasks/0020-spec-0003-acceptance-walkthrough.md
**Confidence:** Strong

## Decision and confidence

本次研究范围是：如何用可重跑的证据完成 SPEC-0003 的窗口、分屏与恢复验收，而不改动用户学习数据。采用官方支持的自定义 Electron 驱动方式（A1），通过真实 BrowserWindow 状态和等待事件验证最小化、恢复与页面捕获（A2、B1），沿用本仓库隔离 userData 后加载构建应用的脚本模式（C1）。新增一个面向 Task 0020 的运行脚本，使用本地流式服务、测试对话和独立配置，跨进程检查重启展开及历史恢复；已有 Vitest 和资料面板脚本负责较细的回归（C2）。历史检索没有找到已提交的同类实现（D1）。这是可逆的验收工具选择，证据足以执行，置信度 Strong；它不表示所有实机验收已通过。

## Evidence

### E1 — 隔离运行真实应用可以覆盖跨主进程、桥接与界面的状态契约

**Strength:** High
**Provenance:** A1, C1

Electron 官方自动化指南允许自定义驱动；仓库已有脚本在 require 构建入口前设置 app 的 userData，并通过 executeJavaScript 调用实际 preload API。因此不需安装第二套 E2E 框架，也不需在产品代码增加测试专用入口。真实 API Key 与用户 SQLite 不进入本次验收。

### E2 — 隐藏、最小化、恢复和截图必须用原生窗口状态断言

**Strength:** High
**Provenance:** A2, A3, B1

Electron 39.2.6 的窗口接口和上游测试对原生最小化、可见状态、截图作出独立断言；单实例接口要求失败的新进程退出，并通知现有实例。本次分别检查这些结果，不能只因按钮存在就判定召回成功。

B1 的已读取实现片段（api-browser-window-spec.ts:1125–1130）：

```ts
const minimize = once(w, 'minimize');
w.minimize();
await minimize;
expect(w.isMinimized()).to.equal(true);
expect(w.isVisible()).to.equal(false);
```

### E3 — 窄窗布局、几何与内部截图已有回归基础，但不能替代真实触屏和显示器拔插

**Strength:** Medium
**Provenance:** C2, C3

已有测试覆盖工作区钳制、浮层侧栏、纵向资料和多对话布局、比例纠正及内部捕获。复用这些测试，并补运行时控件尺寸、模式切换和流式不中断的观测。鼠标合成输入、虚拟显示器事件、CSS 热区断言与真实手指操作不是相同证据；最后两类硬件体验需保留为 HITL 待验。

### E4 — 当前没有可引用的已提交悬浮窗验收历史

**Strength:** Medium
**Provenance:** D1

相关实现目前位于未提交工作区。历史为空不说明功能不存在，仅表示不能用已提交版本代替本轮运行证据。

### E5 — 吸附应保留用户设置的逻辑宽度，避免累计原生边界舍入

**Strength:** High
**Provenance:** A4, C4

本轮实际 Electron 为 39.8.10（package.json 的 ^39.2.6 是兼容范围下限）。150% 显示缩放下，新脚本设置 440 DIP 后，原生窗口边界可能返回 441；把它在移动吸附时重新作为用户宽度写回，再次移动/恢复会累计到 442。悬浮抽屉禁用原生自由缩放，宽度由 setDrawerWidth 显式管理，因此移动吸附只需按新工作区钳制当前逻辑宽度。按公开 manager 接口添加回归测试，再修正这一个赋值；不扩大到窗口框架重构。

### E6 — GUI 验收启动器不能隐藏被测主窗口

**Strength:** High
**Provenance:** A4, C5

重复驱动曾以 windowsHide: true 启动 GUI，导致 DOM 与 preload 已挂载而主窗口仍不可见；同一脚本直接启动可通过。这个驱动条件影响初次显示，不能据此断定产品 ready-to-show 有缺陷。主窗口驱动应使用正常可见的 GUI 启动；只有第二实例及占用热键的无界面辅助进程使用 windowsHide。撤回诊断期间尝试的生产启动兜底，保留原有启动行为；验收仍必须等待原生窗口真实可见。

## Source register

- **A1:** Electron Automated Testing，Using a custom test driver；支持自定义驱动并说明与额外框架的权衡，https://www.electronjs.org/docs/latest/tutorial/automated-testing#using-a-custom-test-driver；本项目目标 Electron 39.2.6 (accessed 2026-10-20 via web open)
- **A2:** Electron v39.2.6 BrowserWindow API，minimize/restore/isMinimized/getBounds，https://raw.githubusercontent.com/electron/electron/v39.2.6/docs/api/browser-window.md (accessed 2026-10-20 via web open)
- **A3:** Electron v39.2.6 app API，requestSingleInstanceLock/second-instance，https://raw.githubusercontent.com/electron/electron/v39.2.6/docs/api/app.md (accessed 2026-10-20 via web open)
- **A4:** 运行版本复核：Electron v39.8.10 BrowserWindow API（bounds、move/moved、窗口显示），https://raw.githubusercontent.com/electron/electron/v39.8.10/docs/api/browser-window.md；同版本 app API，https://raw.githubusercontent.com/electron/electron/v39.8.10/docs/api/app.md；同版本上游窗口测试，https://raw.githubusercontent.com/electron/electron/v39.8.10/spec/api-browser-window-spec.ts (accessed 2026-10-20 via web open)
- **B1:** electron/electron v39.2.6:spec/api-browser-window-spec.ts:1122–1132、2256–2323；原生窗口最小化与 capturePage 测试，https://raw.githubusercontent.com/electron/electron/v39.2.6/spec/api-browser-window-spec.ts (accessed 2026-10-20 via web open/find)
- **C1:** scripts/material-app-smoke.ts:8–16、31–44，独立 userData、加载实际构建入口、本地 HTTP 服务和真实桥接 (accessed 2026-10-20 via PowerShell Get-Content)
- **C2:** src/main/__tests__/window-geometry.test.ts:13；src/renderer/src/__tests__/App.panes.test.tsx:219、240、280、333；src/main/capture/__tests__/router.test.ts:15；覆盖几何、两种分屏布局、资料空状态和捕获路由 (accessed 2026-10-20 via rg -n)
- **C3:** doc/specs/0003-floating-window-split.md:Requirements、Success Criteria、Edge Cases；doc/tasks/0020-spec-0003-acceptance-walkthrough.md:Acceptance Criteria；规定六条成功标准和触控、恢复验收边界 (accessed 2026-10-20 via PowerShell Get-Content)
- **C4:** src/main/window-mode.ts:dockAfterMove/setDrawerWidth；scripts/floating-split-smoke.ts exercise 后运行 --phase=restore 得到宽度 442 与目标 440 不符的失败；设备 workArea 1707x1019、scaleFactor 1.5、Electron 39.8.10 (accessed 2026-10-20 via Electron isolated smoke and PowerShell Get-Content)
- **C5:** src/main/index.ts:createWindow 的 ready-to-show 显示逻辑；scripts/floating-split-smoke.ts 在 windowsHide 启动器下 main window shown 超时，而直接命令启动通过；临时 did-finish-load 兜底未消除此驱动差异 (accessed 2026-10-20 via Electron isolated smoke and PowerShell Get-Content)
- **D1:** git log --all --oneline -- src/main/window-mode.ts scripts/material-app-smoke.ts src/main/material doc/tasks/0020-spec-0003-acceptance-walkthrough.md 与 git log --all --oneline --grep='floating\|split\|smoke' 均无输出，no prior attempt found；git branch --all 只有 main 和 origin/main (accessed 2026-10-20 via git)

## Limitations and reversal

本研究选择验收路径，不重新选择资料面板或捕获技术，不涉及 v3 或 SPEC-0004 的外部并排。运行结果只适用于实际测试设备、构建和本地模拟服务；不能据此证明所有视频站点兼容、真实 DeepSeek 输出质量或触控体验。恢复耗时仅作本机观察，不另造规格不存在的性能阈值。若无法隔离用户目录、原生运行脚本不能完成，或发现真实行为与规格冲突，应保留失败记录并修复/补测；不能把未执行项目记为通过。

## Deviation

没有生产实现偏离。本仓库已有可运行的自定义驱动，继续复用，而不是为了本次收尾新增 Playwright/WebdriverIO 依赖。

## Audit path

运行 `node "C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs" doc/research/0015-ground-floating-split-acceptance.md`。结构校验只证明来源映射完整；走查需复核来源内容，结果写入 Task 0020 指定的产品验收文档。
