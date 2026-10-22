# GROUND-0020: 外部应用并排验收执行

**Status:** recorded
**Decision:** 以可重复的完整 Electron smoke 作为自动证据，以产品所有者逐应用实操作为 Windows 行为证据，二者分别记录
**Decision ref:** doc/tasks/0023-spec-0004-acceptance-walkthrough.md
**Confidence:** Strong

## Decision and confidence

Task 0023 的执行路径是复用 Task 0022 已完成的完整应用 smoke：真实主进程、preload、React、隔离用户目录与 Win32 适配器共同完成选择、宽度跟随、收起/展开和停止；再用一份验收矩阵记录 VSCode、Chrome、B 站、管理员窗口、手动移动、显示器变化、DPI 变化、正常退出和异常退出。自动 smoke 不移动用户现有窗口，也不能替代真实应用证据。该路径由 Electron 官方自定义 IPC 驱动说明 A1、Playwright Electron 能力 A2、公共 Playwright Electron 示例 B1、仓库现有隔离驱动与 Task 0022 smoke C1-C4，以及 SPIKE-0017/GROUND-0018 D1 支撑。结论为 Strong：可以开始验收实施；仍未通过的 HITL 项保持未验，不因自动测试默认勾选。

## Evidence

### E1 — 自动验收必须走真实主进程与 preload

**Strength:** High
**Provenance:** A1, A2, C1, C2

Electron 官方说明自定义驱动可通过子进程 IPC 启动应用并访问主进程；Playwright 也可访问 renderer/main，但外部 Win32 窗口不是 Playwright Page。现有 `external-tiling-app-smoke.ts` 已经加载真实构建并用 `window.api` 驱动 UI，因此不引入第二套测试框架。

### E2 — 只操作专用测试窗口，真实应用由 HITL 确认

**Strength:** High
**Provenance:** A1, B1, C1, C2

自动驱动创建独立 Electron fixture 并检查 pid/title，只对该窗口执行几何变化。VSCode、Chrome、B 站客户端以及管理员权限、物理显示器拔插、真实触控必须以人工证据记录；fake adapter 或自动 fixture 不能代替。

### E3 — 正常、异常与恢复路径必须分别取证

**Strength:** High
**Provenance:** C1, C3, D1

当前完整 smoke 已覆盖正常选择、拖动跟随、收起还原、展开恢复和停止。异常恢复记录需要单独验证：正常退出应清除记录；强制结束后重启应进入 `restore-pending`，用户确认前不移动窗口；目标关闭后记录应清理。走查文档必须保留这些不同结果。

### E4 — 验收证据按“自动 / 既有实操 / 待验”分层

**Strength:** High
**Provenance:** C3, C4

项目已有 `v2-floating-split-walkthrough.md` 的分层方式，明确模拟事件不能替代真实拖动。外部并排沿用同样结构；产品所有者明确确认可把既有实操记录为已验，但代理不补造硬件数据或应用细节。

### E5 — 性能与流式并存需要独立观察

**Strength:** Medium
**Provenance:** A1, C1, C4

完整 smoke 可以验证在并排状态下启动本地流式回答并等待完成，避免只检查窗口几何。同步 Win32 调用对无响应目标的最大阻塞仍不能由正常 fixture 证明；Task 0022 审查保留该风险，Task 0023 应在真实应用拖动时观察流式回答不中断，并在失败时保留为未验而不得宣称满足 NFR-3。

## Source register

- **A1:** Electron Automated Testing, https://raw.githubusercontent.com/electron/electron/main/docs/tutorial/automated-testing.md , custom IPC-over-STDIO and Playwright paths (accessed 2026-10-21 via web open).
- **A2:** Playwright Electron, https://playwright.dev/docs/api/class-electron , experimental Electron automation and firstWindow/evaluate capability (accessed 2026-10-21 via web open).
- **B1:** spaceagetv/electron-playwright-example `e2e-tests/main.spec.ts`, https://raw.githubusercontent.com/spaceagetv/electron-playwright-example/main/e2e-tests/main.spec.ts , launches a packaged executable and exercises renderer/main IPC (accessed 2026-10-21 via web open).
- **C1:** scripts/external-tiling-app-smoke.ts, real built app, preload, isolated user data, production Win32 adapter and UI flow (accessed 2026-10-21 via filesystem).
- **C2:** src/main/tiling/controller.ts and src/main/tiling/win32.ts, production state machine and native adapter covered by Task 0022 tests (accessed 2026-10-21 via `Get-Content`).
- **C3:** scripts/run-window-acceptance.cjs and scripts/floating-split-smoke.ts, existing repeat runner, isolated user data, PASS marker and failure handling (accessed 2026-10-21 via filesystem).
- **C4:** doc/product/v2-floating-split-walkthrough.md, existing automatic/HITL evidence split and H1-H10 checklist pattern (accessed 2026-10-21 via `Get-Content`).
- **D1:** `git log --all --oneline -- scripts src/main/tiling doc/research doc/tasks` finds release commit 06c24e7 and Task 0022 work but no prior external tiling acceptance run; SPIKE-0017 passed seven fixture cases in development and packaged builds (accessed 2026-10-21 via exec_command).

## Deviation gate

No deviation. The task continues with the existing custom Electron harness rather than adding Playwright because Playwright cannot observe the external native window and the repository already has a deterministic driver. Real applications remain manual evidence.

## Limitations and reversal

The automatic smoke proves the wired implementation can tile its own fixture, not that every third-party window accepts geometry changes. It also cannot prove a hung window will not temporarily block the main process. If HITL reveals a blocking target, the feature must be marked partially verified and a new spike/architecture task is needed for out-of-process native calls. If a named application cannot be controlled, it remains a documented degraded case rather than a test failure hidden by the smoke.

## Audit path

Run `node 'C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs' doc/research/0020-ground-external-app-tiling-acceptance-execution.md`, then reopen A1-A2/B1 and the four repository sources before acceptance review.
