# Task 0017: 悬浮窗模式、边缘吸附与快捷入口

**Status:** `done`
**Created:** `2026-10-17`
**Scope ref:** `doc/specs/0003-floating-window-split.md`
**Evidence ref:** `doc/research/0012-ground-floating-window.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0003-floating-window-split.md`
**Board ref:** ``

## Context

SPEC-0003 Scenario 1/2 与 FR-1/FR-2/FR-3/FR-7 要求 Deriva 不再只是一个普通窗口：用户可以把它切到边缘吸附的悬浮窗，通过全局热键或快捷入口随手唤起，同时不丢失当前对话、草稿和打开的面板。该能力直接解决“学习资料与 AI 之间反复切换窗口”的痛点；也是后续分屏资料面板的窗口承载层。

2026-10-18 实机验收后，悬浮窗形态被修订为“全高抽屉 + 快捷气泡 + 常驻托盘”：抽屉贴左/右边缘、铺满工作区高度；收起显示圆形气泡；最小化保留任务栏入口；再次启动恢复同一实例。本任务据此返工，外部应用并排另立 SPEC-0004，不在本任务范围内。

## Acceptance Criteria

- [x] 普通窗口与悬浮模式可切换；悬浮模式为贴左/右边缘、高度等于工作区的全高抽屉，默认右侧，顶部/底部吸附移除
- [x] 抽屉默认宽度 440px，内侧边界可在 360–720px 之间拖动调整并记忆；拖标题栏可跨显示器并重新吸附，不允许自由悬浮
- [x] 用户可配置并触发全局热键；热键被占用或注册失败时给出可理解提示，并提供改键
- [x] 全局热键只在用户显式启用后注册，应用退出时注销，不遗留系统级快捷键
- [x] 模式切换不重置未发送草稿、当前主对话、已打开面板或正在流式生成的回答
- [x] “收起”隐藏抽屉并显示 56–64px 圆形气泡；气泡贴同侧边缘、可上下拖动并记住位置，单击展开，右键提供打开/设置/退出
- [x] “最小化”走 Windows 常规行为并保留任务栏入口；悬浮模式不得调用 `setSkipTaskbar(true)`；托盘图标在所有状态下常驻
- [x] 关闭窗口真正退出；托盘菜单提供退出入口；重复启动只会恢复并聚焦当前实例，不产生第二个进程
- [x] 最近一次模式、边缘与宽度本地持久化；重启恢复上次模式但总是展开抽屉，不恢复气泡态；显示器消失或状态非法时回退普通窗口
- [x] 悬浮模式侧栏默认收起并以浮层出现，选择对话后自动收回；普通模式保持常驻侧栏
- [x] 悬浮模式多个对话面板纵向堆叠，普通模式保持横向并排；面板关闭按钮在 440px 宽度下始终可点击
- [x] 抽屉宽度拖动、气泡、热键、收起/展开控件在 Windows 触屏上可用，点击热区不小于 44px
- [x] 用户实操确认：从其他学习软件用快捷入口唤起 Deriva，切换抽屉并继续当前对话；收起/最小化/重启/重复启动均可恢复

## Plan

- [x] `/ad-ground`：确认 Electron 无边框悬浮窗的边缘吸附实现、Windows 热键冲突处理与触控约束
- [x] 实现窗口模式状态机与悬浮窗 BrowserWindow 配置（置顶、无边框、拖拽、吸附）
- [x] 改为全高抽屉：左右边缘、工作区高度、360–720px 宽度拖动、跨显示器重新吸附
- [x] 实现独立快捷气泡窗口、常驻托盘、最小化/收起分工与重复启动恢复
- [x] 实现单实例锁与第二次启动唤醒
- [x] 改为重启恢复模式但始终展开；移除 `setSkipTaskbar(true)` 与持久化气泡态
- [x] 实现悬浮模式侧栏浮层与多对话纵向堆叠，精简悬浮标题栏
- [x] 实现用户可配置快捷入口与注册/注销生命周期
- [x] 实现窗口模式、边缘、位置、尺寸的本地持久化与显示器越界恢复
- [x] 补窗口几何、恢复、单实例与布局切换测试
- [x] 完成 HITL 验收

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-17

任务创建，来源 SPEC-0003 拆解（Scenario 1/2，FR-1/FR-2/FR-3/FR-7，NFR-1/NFR-2/NFR-5/NFR-6）。依赖 SPEC-0001 的对话状态与 SPEC-0002 的截图入口。具体吸附手感、收起形态和热键默认值在 `/ad-ground` 与 HITL 走查后确定。

`/ad-ground` 完成，记录：`doc/research/0012-ground-floating-window.md`（valid: true）。结论：BrowserWindow 原生能力覆盖无边框置顶悬浮窗；边缘吸附用 `screen.getDisplayMatching`/`workArea` 自定义实现；globalShortcut.register 的 boolean 失败必须提示并提供改键，will-quit 注销；窗口状态存本地 JSON，显示器变化时按 workArea 钳制或回退普通窗口。

### 2026-10-17

实现完成，状态置为 in-progress，等待真实窗口验收。落地：

1. `src/main/window-mode.ts`：普通/悬浮模式切换、置顶、无边框窗口、边缘吸附、展开/收起、全局快捷键注册与注销、窗口状态本地 JSON 持久化、显示器越界恢复。
2. `src/main/window-geometry.ts`：吸附与 workArea 钳制纯函数，补单元测试。
3. `src/main/index.ts`：主窗口改为无边框自定义标题栏，接入 WindowModeManager；`will-quit` 清理快捷键。
4. `App` 标题栏加入悬浮窗/普通窗口、收起、最小化、最大化/还原和关闭控件；设置页加入可配置全局快捷键与冲突提示。
5. `src/shared`/preload 新增窗口控制 IPC。

验证：全量 `210` 项测试通过（42 个文件）；`npm run typecheck`、`npm run build` 通过。仍待用户实测吸附手感、快捷键冲突提示、重启布局恢复与多显示器越界。

### 2026-10-18

实机验收发现四类问题：悬浮模式调用 `setSkipTaskbar(true)` 且没有托盘/气泡兜底，最小化后无法召回；重启恢复悬浮状态引发预期疑问；440×660 小窗中树状侧栏挤占对话区；收起形态是 56×220 窄条，与“全高抽屉 + 圆形气泡”的预期不符。

经 `/ad-grill-me` 逐项确认，Task 0017 按以下决策返工：

1. 悬浮模式改为贴左/右边缘、工作区高度的全高抽屉；默认 440px，可在 360–720px 间拖动调整；顶部/底部吸附与自由悬浮移除。
2. 收起显示独立圆形气泡（56–64px，贴同侧边缘、可上下拖动、常显、右键菜单）；最小化保留任务栏入口；托盘常驻；关闭才退出；不再调用 `setSkipTaskbar(true)`。
3. 重启恢复上次模式/边缘/宽度但总是展开；加单实例锁，重复启动恢复现有实例。
4. 悬浮模式侧栏默认收起为浮层；多对话纵向堆叠；资料面板默认关闭并纵向堆叠；普通模式保持常驻侧栏与横向并排。
5. 外部应用并排独立为 SPEC-0004（ADR-0006），以 Windows 窗口控制 spike 为门槛，不并入本任务。

SPEC-0003 已同步修订；本轮先改文档，用户确认后再改代码。

### 2026-10-18

代码返工完成，进入 HITL 验收。落地：

1. `src/main/window-mode.ts`：重写为全高抽屉状态机；左右边缘/工作区高度/360–720px 宽度；跨显示器拖动后按最近半屏吸附；独立 64px 快捷气泡与常驻托盘；最小化与收起分工；单实例唤醒；重启恢复模式但始终展开；移除主窗口 `setSkipTaskbar(true)`。
2. `src/main/window-geometry.ts`：新增抽屉宽度、抽屉 bounds、最近边缘、气泡 bounds 纯函数与测试。
3. `src/main/index.ts`：接入单实例锁、第二次启动恢复、主窗口关闭退出、窗口状态路径统一。
4. `src/preload`/`src/shared`：新增 collapse/expand、抽屉宽度、气泡拖拽/菜单、设置唤起 IPC。
5. `src/renderer/src/App.tsx`：悬浮模式精简标题栏、侧栏浮层、纵向多对话、抽屉内侧宽度拖动、设置唤起；普通模式保持原布局。
6. `src/renderer/src/styles.css`：抽屉、浮层、纵向分栏、气泡与窄宽度标题栏样式。

验证：

- `npm test`：42 个文件、213 项测试通过。
- `npm run typecheck`、`npm run build` 通过。
- 运行时 CDP 冒烟：悬浮抽屉 440×1020（工作区高度）；侧栏默认收起并可浮出；两个对话纵向堆叠；收起后气泡 64×64；气泡拖动 100px、点击展开；内侧拖动到 360px 生效；最小化后 `document.visibilityState=hidden`，恢复为 visible；重启后浮动且展开；同身份第二次启动退出码 0 并展开已收起抽屉；主窗口扩展样式无 `WS_EX_TOOLWINDOW`。

待用户 HITL：任务栏图标与托盘图标的实际可见性、托盘菜单/气泡右键菜单、真实跨显示器拖动、快捷键与触屏手感。

### 2026-10-18

HITL 验收全部通过。随后完成两轴代码评审（`/ad-review`），评审中发现并修复：

1. NFR-5 触控热区不足：抽屉内侧手柄原为 18px，悬浮标题栏图标按钮 32px，分栏条 16px；已改为 44px 手柄、44px 悬浮标题栏按钮，并用伪元素把分栏命中区扩展到 44px。
2. 收起时侧栏浮层可能残留：头部收起与托盘/API 收起都会关闭浮层，展开后保持收起状态。
3. 显示器断开回退普通窗口时窗口可能仍隐藏：`ensureVisible` 现在会恢复并显示主窗口。
4. 清理窗口监听器、拒绝非正尺寸的持久化 bounds、校验 `displayId`/`bubbleY` 有限性。

验证：`npm run typecheck`、`npm test`（42 文件 / 213 项）、`npm run build` 通过；运行时复验 44px 手柄/按钮/正文避让、360px 与 440px 标题栏无溢出、收起/展开后侧栏保持收起。评审留痕：`.agentic/reviews/2026-10-18T17-50-13-task-0017-floating-drawer.md`。

状态置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
