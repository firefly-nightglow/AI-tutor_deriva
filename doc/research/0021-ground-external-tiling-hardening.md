# GROUND-0021: 外部并排响应性与故障边界加固

**Status:** recorded
**Decision:** 先用受控延迟窗口测主进程阻塞；超过 100ms 才把 Win32 调用迁移到 utility process，同时独立修正持久化失败与最小宽度端点
**Decision ref:** doc/tasks/0024-external-tiling-hardening.md
**Confidence:** Conditional

## Decision and confidence

Task 0024 不应在没有测量时直接重写为多进程。happy path 是先构造一个可延迟处理窗口几何请求的 fixture，在 Electron 主进程记录事件循环延迟分布；如果最大阻塞超过 100ms 或可重复超过 50ms，就采用 Electron `utilityProcess` 承载 Win32 adapter，通过 `process.parentPort` 做请求/响应；否则保留现有主进程 adapter 并记录测量证据。持久化方面，初始“移动前写入还原记录”属于关键写入，失败时必须拒绝移动；已有并排状态的非关键刷新写入失败必须转为可见错误且不能导致进程崩溃。边界方面，将 480 DIP 外部最小宽度前移到抽屉可拖范围，端点有视觉状态。依据 Electron 官方 utilityProcess A1-A2、Node 同步 fs 语义 A3、Win32/窗口 API A4、公共 utility process 示例 B1、现有 controller/adapter/smoke C1-C4 与历史 D1。

Axis-2 为 Conditional：可以开始实现测量和确定性加固，但在测量结果出来前不承诺 utility process 迁移。用户已授权继续执行 Task 0024，因此按此门槛推进。

## Evidence

### E1 — 同步 FFI 与同步文件写入都会占用主进程事件循环

**Strength:** High
**Provenance:** A1, A3, C1

Electron 主进程负责窗口与应用生命周期；Task 0022 审查确认 Koffi 调用是同步的。Node 官方明确同步 fs API 会阻塞事件循环。测量必须同时记录几何调用期间的事件循环延迟，不能只用适配器函数内部耗时。

### E2 — Utility process 是 Electron 对 CPU 密集/易阻塞组件的官方隔离边界

**Strength:** High
**Provenance:** A1, A2, B1

`utilityProcess.fork` 提供 Node.js、MessagePort 与父子消息通道，适合承载 native/易阻塞组件；只能在 app ready 后创建。公共示例展示了 `worker.postMessage` 与 `process.parentPort.on('message')` 的请求/响应模式。迁移会引入异步 IPC、生命周期与打包路径，因此必须先由测量触发。

### E3 — 测量以事件循环延迟而不是墙钟总耗时为准

**Strength:** High
**Provenance:** A1, C2, C3

一次窗口移动包含等待目标响应、重绘和状态读回。真正影响 Deriva 流式回答与输入的是主线程无法处理 timer/IPC 的连续时间。fixture 应在调用前后安排短 timer，记录实际触发延迟；采样多次并保留最大值、p95 与失败条件。

### E4 — 关键写入必须先成功再移动窗口

**Strength:** High
**Provenance:** A3, C1, C4

还原记录是异常恢复的唯一依据。初始 capture 后的持久化失败必须阻止 `tile`；已有 active 状态的非关键刷新失败可以保留旧记录，但必须进入可见错误，不能从 `setTimeout` 冒泡为未捕获异常。使用同步写入可以保持 controller 简单，但所有调用点必须区分 critical 与 best-effort。

### E5 — 480 DIP 最小宽度应在抽屉拖动层钳制

**Strength:** High
**Provenance:** C1, C2, C4

当前 controller 在 target 过窄后抛错并还原，这只是事后保护。正确位置是 `WindowModeManager`/renderer 拖动边界：根据当前显示器 workArea 限制抽屉最大宽度，使外部剩余宽度不低于 480 DIP；controller 保留防御检查。UI 在达到端点时显示已达到最小外部宽度的状态，而不是持续发送失败更新。

## Source register

- **A1:** Electron utility process, https://raw.githubusercontent.com/electron/electron/main/docs/api/utility-process.md , Node child process, parentPort messages, fork after ready, lifecycle (accessed 2026-10-22 via PowerShell Invoke-WebRequest).
- **A2:** Electron Process Model, https://raw.githubusercontent.com/electron/electron/main/docs/tutorial/process-model.md , main process responsibilities and utility process as isolation for crash-prone/CPU-intensive components (accessed 2026-10-22 via PowerShell Invoke-WebRequest).
- **A3:** Node.js fs documentation, https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md , synchronous APIs block event loop and throw immediately (accessed 2026-10-22 via PowerShell Invoke-WebRequest).
- **A4:** Microsoft Win32 SetWindowPos contract recorded in GROUND-0016, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos , geometry call and error behavior (accessed 2026-10-22 via prior recorded source).
- **B1:** agents-inc/skills `desktop-ipc-electron/examples/message-ports.md`, https://raw.githubusercontent.com/agents-inc/skills/main/src/skills/desktop-ipc-electron/examples/message-ports.md , L165-L264 utility process background worker and parentPort request/response pattern (accessed 2026-10-22 via web open).
- **C1:** src/main/tiling/controller.ts and src/main/tiling/win32.ts, current synchronous controller and Koffi adapter (accessed 2026-10-22 via `Get-Content`).
- **C2:** src/main/index.ts:171 and src/main/window-mode.ts:261, current drawer update coalescing and manager geometry events (accessed 2026-10-22 via `rg`/`Get-Content`).
- **C3:** scripts/external-tiling-app-smoke.ts and scripts/external-tiling-smoke.ts, real Electron fixture, stream coexistence and cleanup patterns (accessed 2026-10-22 via filesystem).
- **C4:** src/main/__tests__/window-mode.test.ts and src/main/tiling/__tests__/controller.test.ts, existing geometry, persistence and restore regression suites (accessed 2026-10-22 via `Get-Content`).
- **D1:** `git log --all --oneline -- src/main/tiling src/main/window-mode.ts src/renderer/src/App.tsx scripts/external-tiling-app-smoke.ts` shows release and Task 0022 work only; `git log --all --oneline --grep='utility process\|stalled window\|external tiling hardening'` finds no prior attempt (accessed 2026-10-22 via exec_command).

## Deviation gate

No utility-process code may be written until the controlled fixture exceeds the stated threshold. If it does, the deviation from the current single-process adapter is justified by measured event-loop delay and NFR-3, and must preserve the existing controller public state model through an async adapter/service boundary.

## Limitations and reversal

A delayed fixture approximates but cannot reproduce every hung Windows application. Event-loop measurements are machine-specific. If the threshold is not crossed, no claim is made that all third-party windows are safe; the measured bound and residual risk stay documented. If utility process is introduced and packaged loading or shutdown restore fails, reverse to the existing main-process adapter while keeping the persistence and min-width fixes.

## Audit path

Run `node 'C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs' doc/research/0021-ground-external-tiling-hardening.md`, then reopen A1-A3/B1 before implementation and again before review.
