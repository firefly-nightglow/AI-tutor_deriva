# GROUND-0012: 悬浮窗模式、边缘吸附与快捷入口

**Status:** recorded
**Decision:** 在 Electron 主进程新增 WindowModeManager：普通 BrowserWindow 与无边框悬浮 BrowserWindow 共用同一 renderer；悬浮窗使用 frame:false、可拖拽/可缩放、置顶和 skipTaskbar，边缘吸附由主进程根据 BrowserWindow bounds 与 screen.workArea 自行实现（约 20 DIP 阈值）；全局热键用 globalShortcut.register，注册失败时提示并允许改键，will-quit 注销；窗口模式、吸附边、位置、尺寸和分屏状态存本地 JSON，显示器变化时用 workArea 重新钳制或回到普通窗口。
**Decision ref:** doc/tasks/0017-floating-window-quick-entry.md
**Confidence:** Strong

## Decision and confidence

Electron 原生提供无边框、置顶、任务栏隐藏、移动/缩放和窗口边界 API，但没有“把窗口吸附到屏幕边缘”的高层 API。因此窗口配置可以直接由 BrowserWindow 完成，吸附是主进程的一小段确定性边界逻辑：在 moved 事件后用 `screen.getDisplayMatching(bounds)` 找到显示器，再与 `display.workArea` 的四条边比较，满足阈值时 `setBounds` 对齐；展开/收起时保持锚定边不变。这个做法不依赖第三方库，也不改变现有聊天 renderer 的数据流。热键失败是正常运行时情况：`globalShortcut.register` 返回 boolean，且被其他应用占用时会静默失败，所以注册结果必须转成用户可操作的提示。

Axis-2 verdict: Strong。窗口、屏幕、热键 API 都有官方文档；Specter-AI 提供了无边框置顶窗口与保存位置/尺寸的生产参考；仅边缘吸附算法是本项目自定义的确定性逻辑，风险低且可通过 HITL 调整阈值。

## Evidence

### E1 — BrowserWindow 支持无边框置顶悬浮窗所需的全部能力

**Strength:** High
**Provenance:** A1, B1

A1 的 BrowserWindow 文档列出 `frame`/`alwaysOnTop`/`skipTaskbar`/`movable`/`resizable`、`setAlwaysOnTop`、`setSkipTaskbar` 和 `setBounds`。B1（Specter-AI overlay-window.ts:49-95）实际使用 `frame:false`、`transparent:true`、`alwaysOnTop:true`、`skipTaskbar:true`、`focusable:true`、`hasShadow:false`，并保存 position/size。Deriva 可以沿用其窗口配置思路，但不使用 transparent，避免透明分层窗口在 Windows 捕获与阴影上的额外问题。

### E2 — 边缘吸附必须由应用基于 workArea 自行计算

**Strength:** High
**Provenance:** A1, A2, B1

A2 提供 `screen.getDisplayMatching(rect)` 与 `Display.workArea`；A1 提供 `setBounds`。B1 只演示了保存位置/尺寸，没有边缘吸附，因此本项目需要编写纯函数式的边界判断并在主进程应用。阈值、动画和展开/收起锚定方式属于交互参数，需在 HITL 中调优，而不是依赖 Electron 自动完成。

### E3 — 全局热键的失败与注销必须显式处理

**Strength:** High
**Provenance:** A3

A3 明确 `globalShortcut.register` 返回 boolean，加速键被其他应用占用时会静默失败；同一文档给出在 `app.on('will-quit')` 中 `globalShortcut.unregister`/`unregisterAll` 的示例。因此产品必须把注册失败展示给用户并提供改键，退出时注销。

### E4 — 多显示器恢复依赖 screen 事件与工作区钳制

**Strength:** High
**Provenance:** A2

A2 提供 `display-added`、`display-removed`、`display-metrics-changed` 事件。窗口恢复时用 `screen.getDisplayMatching`/workArea 判断是否仍在合法屏幕内；显示器断开或分辨率变化时不能把窗口恢复到屏幕外，应退回合法普通窗口。

### E5 — 仓库没有悬浮窗先例，但有可直接复用的窗口与配置模式

**Strength:** High
**Provenance:** C1, C2, D1

C1（src/main/index.ts:41-109）当前只有普通 BrowserWindow，C2（src/main/llm/config.ts:22-35）已有本地 JSON store 模式；D1 的全仓库 git log 没有悬浮窗或分屏提交。实现应新增独立 WindowModeManager，而不是把窗口状态塞进聊天服务。

## Source register

- **A1:** Electron BrowserWindow 官方文档（frame、alwaysOnTop、skipTaskbar、movable、resizable、setAlwaysOnTop、setSkipTaskbar、setBounds、moved/resize），https://www.electronjs.org/docs/latest/api/browser-window (accessed 2026-10-17 via Invoke-WebRequest)
- **A2:** Electron screen 官方文档（getDisplayMatching、getDisplayNearestPoint、workArea、display-added/removed/metrics-changed），https://www.electronjs.org/docs/latest/api/screen (accessed 2026-10-17 via Invoke-WebRequest)
- **A3:** Electron globalShortcut 官方文档（register 返回 boolean、被占用时静默失败、will-quit 注销），https://www.electronjs.org/docs/latest/api/global-shortcut (accessed 2026-10-17 via Invoke-WebRequest)
- **B1:** Specter-AI src/main/overlay-window.ts:49-95 无边框置顶悬浮窗、可拖拽/缩放、保存 position/size、焦点与阴影配置，https://github.com/umairinayat/Specter-AI (accessed 2026-10-17 via GitHub Contents API)
- **C1:** 仓库内 src/main/index.ts:41-109 普通 BrowserWindow 创建、preload、sandbox、外部链接处理 (accessed 2026-10-17 via local shell)
- **C2:** 仓库内 src/main/llm/config.ts:22-35 本地 JSON store 模式 (accessed 2026-10-17 via local shell)
- **D1:** `git log --all --oneline` 仅 3 个提交；`git log --all --oneline --grep=floating` 与 `--grep=split` 均无结果，结论 no prior attempt found (accessed 2026-10-17 via local shell)

## Limitations and reversal

本记录不能证明 Windows 不同 DPI/多显示器组合下吸附手感、透明/阴影视觉和任务栏行为的最终体验；这些必须在 HITL 中实测。若发现 `setBounds` 吸附与用户拖动产生抖动，应引入拖动结束去抖或原生 move/resize 事件桥接；若悬浮窗置顶影响系统 UI，应降低 always-on-top level 或增加用户开关。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0012-ground-floating-window.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
