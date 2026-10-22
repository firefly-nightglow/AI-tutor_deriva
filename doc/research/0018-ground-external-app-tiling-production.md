# GROUND-0018: 外部应用并排的生产接入边界

**Status:** recorded
**Decision:** 采用主进程隔离的 Win32 适配器、单一并排控制器、类型安全 IPC 和渲染层状态面板；Koffi 原生分包显式排除 ASAR
**Decision ref:** doc/tasks/0022-external-app-tiling.md
**Confidence:** Strong

## Decision and confidence

Task 0022 的 happy path 是把窗口枚举与几何变更封装在 Windows-only `ExternalTilingAdapter`，由主进程 `ExternalTilingController` 持有唯一选中窗口、还原快照、显示器比例和暂停/恢复状态，通过 `ipcMain.handle` 和窄化 `contextBridge` API 暴露 DTO。控制器订阅现有 `WindowModeManager` 的抽屉状态，不另造第二个窗口几何来源；首次变更前持久化还原快照，用户收起抽屉或进入普通窗口时立即还原，异常退出记录在下次启动显式提示而不是静默接管。Koffi 3.3.3 作为生产依赖，Windows x64 原生分包必须随包提供并从 ASAR 解包。

该路线由 Electron 官方 IPC/contextBridge/screen 契约 A1-A3、Win32 placement/enumeration/DPI 契约 A4、Koffi 3 分包说明 A5、FancyZones 与 Peakflow 的公开实现 B1-B2、Koffi 3 的 electron-builder 实际配置 B3、现有窗口状态与 IPC 模式 C1-C5，以及已通过打包验证的 SPIKE-0017 D1 支撑。证据强度足以进入生产实现；Task 0023 仍保留真实应用、权限、物理显示器与回归门槛。

## Evidence

### E1 — 原生窗口句柄不得穿过 preload 边界

**Strength:** High
**Provenance:** A1, A2, C1, C2

Electron 推荐双向调用使用 `ipcRenderer.invoke`/`ipcMain.handle`，并明确警告不要把完整 `ipcRenderer.invoke` 暴露给渲染进程。项目已有共享 `TutorApi`、通道常量和白名单 preload。生产接口应只传输 `{ hwnd: string, pid, started }`、bounds、状态和用户可读错误，不传输 BigInt 指针或 native handle。

### E2 — 原生调用需要独立适配器并验证读回结果

**Strength:** High
**Provenance:** A4, B1, B2, C3, D1

FancyZones 把 placement、工作区换算和可见边框处理集中在窗口工具层；Peakflow 把 Koffi Win32 绑定集中在主进程 native 模块。SPIKE-0017 已验证 `EnumWindows`、`GetWindowPlacement`、`SetWindowPlacement` 和 `SetWindowPos` 的最小集合。生产适配器应保持这些调用同步且短小，设置窗口后读取实际 visible bounds；不能只根据 API 返回值宣称布局成功。

### E3 — 还原快照必须先于几何变更落盘

**Strength:** High
**Provenance:** A4, B1, C4, D1

`WINDOWPLACEMENT` 的普通位置属于工作区坐标，不能与 `SetWindowPos` 的屏幕坐标混用。PowerToys 使用 placement 处理归位，并用 DWM visible bounds 补偿边框。现有窗口偏好采用本地 JSON 单文件持久化，因此并排状态沿用同一用户数据目录，在首次移动外部窗口前写入所选身份、原 placement、最大化/最小化状态和显示器；成功还原后才删除记录。

### E4 — 抽屉是几何唯一来源，高频更新需要合并

**Strength:** High
**Provenance:** A3, C4, C5, D1

Electron `screen` 是主进程模块，提供 DIP workArea、scaleFactor 和显示器变更事件；项目 `WindowModeManager` 已拥有悬浮抽屉宽度、左右吸附、显示器与收起状态。并排控制器应订阅这套状态，在抽屉几何变化后换算物理工作区并重新布局外部应用。现有 renderer 已用 `requestAnimationFrame` 合并拖拽事件；主进程也应以短定时器合并同一帧的重复几何通知，避免直接串行调用每次 pointer event。

### E5 — Koffi 3 原生分包必须显式参与打包

**Strength:** High
**Provenance:** A5, B3, C6, D1

Koffi 3 的主包不含原生代码，Windows 二进制位于 `@koromix/koffi-win32-x64`。LTX Desktop 的实际 electron-builder 配置将 `node_modules/@koromix/**/*` 列入 `asarUnpack`。SPIKE-0017 的独立打包运行也证明开发环境成功不能代替产物验证。生产包需锁定 `koffi@3.3.3`，保留平台子包，并把对应 `.node` 排除 ASAR；打包冒烟测试必须检查 `app.isPackaged` 下的原生加载。

### E6 — 单一选择、暂停与重新并排需要明确状态机

**Strength:** Medium
**Provenance:** A1, A4, B1, C4

SPEC-0004 的 FR-2/FR-5/FR-6/FR-7/FR-12 共同要求同一时间只有一个并排目标，且收起、普通模式、手动移动、窗口关闭、失败和重启具有不同后续动作。生产状态机至少区分 `idle / active / paused / restore-pending / error`，并用单调 revision 防止并发“更换应用”把旧应用的异步还原覆盖到新应用上。此设计来自需求组合，不是单一 API 契约；Task 0023 的异常路径实操是必要缓解。

### E7 — 手动移动检测采用低频几何轮询并放弃旧快照

**Strength:** Medium
**Provenance:** A4, B1, C4, D1

Win32 没有向另一个进程直接订阅窗口移动的普通回调。可选事件 hook 需要跨进程消息与更高维护成本。生产首版应每约 750ms 读取 active target 的 visible bounds，与控制器最后一次写入的预期范围比较；差异超过容差时进入 paused，保留应用选择，但清除旧还原快照，因为用户的新布局优先，停止并排时不得把窗口拉回过去的位置。轮询每次只读一个已选 HWND，符合最小读取面。

### E8 — 异常恢复必须显式，不自动移动外部窗口

**Strength:** High
**Provenance:** A4, B1, C4

如果上次进程在并排期间退出，下一次启动读取到待还原记录时应先验证窗口身份。若目标仍存在，状态进入 `restore-pending`，提供“恢复原窗口”和“保留当前布局”；若目标消失，删除记录。启动本身不移动窗口，符合 SPEC-0004 FR-12 和产品所有者已确认的 OQ-4 决议。

## Source register

- **A1:** Electron Inter-Process Communication, https://www.electronjs.org/docs/latest/tutorial/ipc , invoke/handle and narrow preload bridge (accessed 2026-10-21 via web open).
- **A2:** Electron contextBridge, https://www.electronjs.org/docs/latest/api/context-bridge , isolated renderer API boundary (accessed 2026-10-21 via web open).
- **A3:** Electron screen, https://www.electronjs.org/docs/latest/api/screen , workArea/scaleFactor/display events and DIP/physical conversion (accessed 2026-10-21 via web open).
- **A4:** Microsoft Win32 `EnumWindows`, `SetWindowPos`, `GetWindowRect`, `GetWindowPlacement`, `WINDOWPLACEMENT`, and DPI references recorded in GROUND-0016 (accessed 2026-10-21 via web open).
- **A5:** Koffi migration, https://koffi.dev/migration , split native packages and redistribution requirement (accessed 2026-10-21 via web open).
- **B1:** microsoft/PowerToys `FancyZonesLib/WindowUtils.cpp`, https://raw.githubusercontent.com/microsoft/PowerToys/main/src/modules/fancyzones/FancyZonesLib/WindowUtils.cpp , L59-L95 work-area conversion, L195-L250 placement/resize, L333-L358 visible border compensation (accessed 2026-10-21 via web open).
- **B2:** inchwormz/peakflow-electron `src/main/native/active-window.ts`, https://raw.githubusercontent.com/inchwormz/peakflow-electron/master/src/main/native/active-window.ts , L7-L52 isolated Koffi bindings and callback registration, L179-L243 visible/cloaked/system window filtering (accessed 2026-10-21 via web open).
- **B3:** Lightricks/LTX-Desktop `electron-builder.yml`, https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/electron-builder.yml , L20-L27 unpacks `@koromix` native package for Koffi 3 (accessed 2026-10-21 via web open).
- **C1:** src/shared/api.ts:1,63 and src/preload/index.ts:1,48, existing typed API and narrow window-control preload methods (accessed 2026-10-21 via `Get-Content`).
- **C2:** src/main/ipc.ts:36,120 and src/shared/ipc-channels.ts:1, existing main-process handler registration and channel constants (accessed 2026-10-21 via `Get-Content`).
- **C3:** src/main/window-mode.ts:200,261,293,512 and src/main/window-geometry.ts:1,28,35, existing local persistence, drawer geometry, display awareness and width API (accessed 2026-10-21 via `Get-Content`).
- **C4:** src/renderer/src/App.tsx:320,350 and src/renderer/src/styles.css:408, existing `requestAnimationFrame` drawer drag and inner-edge resize handle (accessed 2026-10-21 via `Get-Content`).
- **C5:** src/main/index.ts:1,170, existing app lifecycle, `will-quit`, single-instance and material/window manager teardown (accessed 2026-10-21 via `Get-Content`).
- **C6:** package.json:1, build files/asarUnpack and x64 Windows target (accessed 2026-10-21 via `Get-Content`).
- **D1:** SPIKE-0017, seven cases passed in development and packaged Windows x64 build; `git log --all --oneline -- src/main/window-mode.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/App.tsx package.json spikes scripts` finds only `06c24e7` release coverage and no prior production tiling attempt (accessed 2026-10-21 via filesystem and git).

## Deviation gate

No deviation from the grounded route. The controller should not use a native addon, simulated keyboard shortcuts, screen capture or direct renderer FFI. If Koffi cannot load in the production package, fall back to a minimal Node-API addon only after reproducing the packaged failure; that is a new ADR decision, not an implementation shortcut.

## Limitations and reversal

The spike and public references do not guarantee all external applications accept resizing. Task 0023 must verify VSCode, Chrome and Bilibili in the real product. Low-frequency polling can miss a move-then-move-back between samples; it is a safety heuristic, not a security boundary. If polling causes measurable cost or false pauses, replace it with a documented event hook only after a new ground/spike. Reversal is to ship only the internal material panel and remove external tiling wiring; conversation, capture and local persistence remain independent.

## Audit path

Run `node 'C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs' doc/research/0018-ground-external-app-tiling-production.md`, then reopen A1-A5 and B1-B3 before implementation review.
