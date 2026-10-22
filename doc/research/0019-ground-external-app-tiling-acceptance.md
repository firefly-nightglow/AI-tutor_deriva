# GROUND-0019: 外部应用并排验收与证据分层

**Status:** recorded
**Decision:** 继续使用项目现有隔离 Electron 驱动覆盖自动证据，真实三应用和系统边界由独立 HITL 走查确认，不把模拟适配器算作产品验收
**Decision ref:** doc/tasks/0023-spec-0004-acceptance-walkthrough.md
**Confidence:** Strong

## Decision and confidence

Task 0023 的 happy path 是建立一份验收矩阵：单元测试证明控制器状态与还原记录；隔离 Electron 驱动在独立用户目录下使用真实 preload 和假原生适配器，验证选择、状态条、暂停、重新并排与恢复提示；真实 Windows 窗口实操单独验证 VSCode、Chrome、B 站、权限、物理 DPI/双显示器和异常退出。现有项目已经有可运行的 Electron smoke drivers；官方也把自定义 IPC-over-STDIO driver 列为正式方案，因此本任务无需引入 Playwright 依赖。人工证据必须记录应用、显示器/缩放、操作和结果，自动证据不得替代“某个外部应用真的可控制”。

依据 Electron 自动测试文档 A1-A2、Playwright Electron 实验能力 A3、公共 Playwright Electron 示例 B1、现有隔离驱动 C1-C3，以及没有既往外部应用验收记录的 D1。置信度为 Strong；剩余风险是实际硬件与第三方窗口行为，Task 本身正是其关闭路径。

## Evidence

### E1 — 现有自定义驱动是当前仓库的最小验收增量

**Strength:** High
**Provenance:** A1, C1, C2, C3

Electron 官方明确支持自定义 IPC-over-STDIO driver，项目已有 `floating-split-smoke.ts`、`material-app-smoke.ts` 和重复执行器。它们能启动真实构建、访问 preload/React、隔离用户目录并要求退出码和 PASS 标记。Task 0023 应扩展这一模式，而不是为了相同能力新装 Playwright。

### E2 — Playwright可作备选，但不能观察外部 Win32 窗口

**Strength:** High
**Provenance:** A3, B1, C1

Playwright 的 Electron 支持是实验性，可启动产物并访问主/渲染进程，但外部 HWND 仍不是 Playwright Page。它不能替代真实窗口几何验收。当前如果只在需要更强 UI 断言时才引入 Playwright，可作为后续独立依赖决策。

### E3 — 验收测试必须在原生边界注入 fake，而非在渲染层伪造成功

**Strength:** High
**Provenance:** A1, C1, C2

隔离驱动应让真实主进程控制器和真实 preload 运行，只替换 `ExternalTilingAdapter` 背后的 Win32 操作为确定性 fake。这样能验证 IPC 序列化、状态机、持久化和 UI，同时不会移动用户现有窗口。fake 的调用日志可断言“选新应用先还原旧应用”“收起再展开自动重排”“关闭后不再次操作失效 HWND”。

### E4 — 自动证据、人工证据与未验项必须分开

**Strength:** High
**Provenance:** C2, C3, D1

现有验收走查已经把 automatic、既有实操和 HITL 分栏，并明确模拟事件不能当真实拖动证据。Task 0023 的走查文档应沿用该结构：自动运行的命令/结果、产品所有者逐项实操、仍未验证的硬件或应用。不能仅因 fake 覆盖异常分支就把管理员窗口或双显示器标成通过。

### E5 — 正常退出、异常退出和重启需要不同证据

**Strength:** High
**Provenance:** A1, C1, C3, D1

正常退出应观察外部应用立即还原并清除记录；强制结束进程后应保留待还原记录；下次启动应提示而不自动移动。三类路径需要独立夹具/实操，不能以一次正常关闭覆盖。隔离驱动可验证前两类状态文件和第二次启动提示，真实外部应用仍做一次人工闭环。

### E6 — 性能与可用性验收要记录分布而不是单次手感

**Strength:** Medium
**Provenance:** C3, D1

边界拖动性能不能只以“看起来流畅”结案。隔离驱动可连续生成 N 次几何更新并测量适配器调用合并比、最大主进程阻塞和管理端状态延迟；真实触控/HITL 再评估视觉抖动。设备没有触屏时必须保持未验，不能把鼠标或 DOM 尺寸当触控通过。

## Source register

- **A1:** Electron Automated Testing, https://raw.githubusercontent.com/electron/electron/main/docs/tutorial/automated-testing.md , L262-L403 custom IPC-over-STDIO driver (accessed 2026-10-21 via web open).
- **A2:** Electron Inter-Process Communication, https://www.electronjs.org/docs/latest/tutorial/ipc , real main/preload/renderer boundary and serializable values (accessed 2026-10-21 via web open).
- **A3:** Playwright Electron, https://playwright.dev/docs/api/class-electron and https://playwright.dev/docs/api/class-electronapplication , experimental launch, firstWindow, evaluate, packaged executable path (accessed 2026-10-21 via web open).
- **B1:** spaceagetv/electron-playwright-example `e2e-tests/main.spec.ts`, https://raw.githubusercontent.com/spaceagetv/electron-playwright-example/main/e2e-tests/main.spec.ts , L18-L46 launches built executable and closes it; L94-L103 tests IPC from renderer/main (accessed 2026-10-21 via web open).
- **C1:** scripts/floating-split-smoke.ts:61,67,155,245, existing actual Electron build assertions for window state and display legality (accessed 2026-10-21 via `rg`/`Get-Content`).
- **C2:** scripts/material-app-smoke.ts:51,67 and doc/product/v2-floating-split-walkthrough.md:3,58, existing real-renderer and HITL evidence split (accessed 2026-10-21 via `Get-Content`).
- **C3:** scripts/run-window-acceptance.cjs and scripts/floating-split-smoke.ts:1, existing isolated user data, process launch, timeout and PASS marker pattern (accessed 2026-10-21 via repository inspection).
- **D1:** `git log --all --oneline --grep='external app\|tiling\|window geometry\|user32\|koffi'` produced no earlier acceptance commit; `git log --all --oneline -- scripts` only shows release coverage. No prior external tiling acceptance suite found (accessed 2026-10-21 via exec_command).

## Deviation gate

The task deliberately does not adopt Playwright now. The specific constraint is the absence of a need it uniquely satisfies: external native windows are invisible to Playwright, while the repository already has a working custom Electron driver. Introducing Playwright would add a second harness without improving the product gate. If UI assertions become materially harder than the existing driver supports, adopt Playwright in a separate task with a new dependency review.

## Limitations and reversal

This record cannot certify third-party applications until Task 0023 is run on the owner’s machine. A fake adapter proves wiring, not Windows behavior. Actual elevated-window tests may fail safely rather than prove control. If future CI runs only headless, it cannot substitute HITL; the walkthrough remains open. Reversal is to keep the automatic tests as developer regression and mark the product feature unverified until real-app evidence exists.

## Audit path

Run `node 'C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs' doc/research/0019-ground-external-app-tiling-acceptance.md`, reopen A1-A3/B1, then attach this record to Task 0023 before writing the walkthrough.
