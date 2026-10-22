# GROUND-0016: 外部应用窗口几何隔离验证

**Status:** recorded
**Decision:** 先在独立 spike 中验证 koffi 3.3.3 + Win32；不接入生产应用，原生 addon 保留为备选
**Decision ref:** doc/tasks/0021-external-app-tiling-spike.md
**Confidence:** Conditional

## Decision and confidence

研究范围是 Windows x64 上外部顶层窗口的枚举、物理坐标并排和原始窗口状态还原，以及该路径的权限、DPI 与打包边界。优先采用 koffi 调用 user32/kernel32/dwmapi，先读取并验证身份，再保存 WINDOWPLACEMENT，按物理工作区布局并读回结果，最后用原始 placement 还原。依据微软窗口契约 A1-A6、Koffi 官方绑定与分包说明 A7-A9、FancyZones 对边框/坐标的处理 B1，以及仓库既有抽屉几何和隔离驱动 C1-C3。D1 没有找到此前原生并排尝试。

结论仅为 Conditional：适合开始可逆实验，不代表产品实现获准或兼容性通过。缓解措施是分阶段门槛、只自动移动专用窗口、先写还原快照、失败即还原并保留证据；真实三款应用、权限、物理双屏和多 DPI 不以模拟代替。产品所有者于 2026-10-21 确认此路线与自动测试边界。

## Evidence

### E1 — 窗口枚举不等于取得长期有效的控制目标

**Strength:** High
**Provenance:** A1, A5, A6

EnumWindows 提供桌面顶层窗口；HWND 可以回收，不能仅凭 IsWindow 或标题重认目标。实验应组合 HWND、PID、进程创建时间，并在每次变更前复核；查询失败与窗口消失分别记录。此组合仍不能原子地消除外部进程关闭/换窗的竞争，不承诺跨应用重启保持同一窗口身份。

### E2 — 并排坐标、可见边框与还原坐标必须分开

**Strength:** High
**Provenance:** A2, A3, A4, B1, C1

GetWindowRect 可能被 DPI 虚拟化且含不可见边框；DWM 可见边界是另一套测量。SetWindowPos 使用屏幕位置，而 WINDOWPLACEMENT 的普通顶层窗口位置属于工作区坐标，必须成对保存/还原，不能混传。实验要读回实际可见边界、检查应用最小尺寸约束，并在切换线程 DPI 上下文后恢复原上下文。

### E3 — 公开实现证明边框补偿有必要，但不能照抄其焦点策略

**Strength:** Medium
**Provenance:** B1, A2, C2

已实际读取 microsoft/PowerToys 的 FancyZonesLib/WindowUtils.cpp：L59-L95 处理工作区偏移，L195-L250 处理 placement 和缩放，L333-L358 比较可见边框及可缩放样式。短引文（L343）：`DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS, &frameRect, sizeof(frameRect))`。同文件还有模拟输入的焦点处理，这部分违反 SPEC-0004，明确不采用；只借鉴几何边界原则。实验使用 NOACTIVATE/NOZORDER，保持焦点，不改目标窗口样式。

### E4 — Koffi 适合作为第一候选，但必须验证 Electron 与原生分包

**Strength:** Medium
**Provenance:** A7, A8, A9, A10, C3

官方文档支持 Win32 调用和同步枚举回调；Windows x64 有预编译包。3.x 将原生代码分至 @koromix/koffi-win32-x64，不能只验证 JS 主包加载。开发实验锁定 3.3.3，依赖只放 spike；分别验证 Node、Electron 39.8.10 和独立打包后的启动。新建 Node-API addon 同样可实现，但增加自有 C++、编译/预构建和发布维护面，只有 FFI 的兼容性或阻塞成本不可接受时再选择。

### E5 — 管理员与受保护窗口必须安全降级，不尝试提权

**Strength:** Medium
**Provenance:** A6, A11

进程查询需要对应访问权；权限不足不能被伪装成窗口不存在。实验读取有限进程信息及 token 状态，管理员/查询受限目标拒绝控制，并保留错误分类。不把 UIPI 的通用说明推断为每个窗口 API 都必然返回同一种错误；实际失败表现仍需受控实测。禁止启动 UAC、注入、模拟输入或改变系统安全配置。

### E6 — 复用本地工作区与隔离驱动，不在 spike 中扩展生产生命周期

**Strength:** High
**Provenance:** C1, C2, C3, D1

现有抽屉宽度为 360-720 DIP，工作区由 Electron screen 提供。实验从每个显示器的工作区换成物理矩形，不能把所有屏幕绝对坐标统一乘一个 scaleFactor。测试窗口独立进程、独立用户目录，异常清理仅限本次创建的窗口。现有 renderer、SQLite、截图和模型请求不变。

## Source register

- **A1:** Microsoft Win32 EnumWindows, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows , desktop top-level enumeration (accessed 2026-10-21 via web open).
- **A2:** Microsoft Win32 SetWindowPos, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos , flags/error contract including NOACTIVATE and ASYNCWINDOWPOS (accessed 2026-10-21 via web open).
- **A3:** Microsoft Win32 GetWindowRect and WINDOWPLACEMENT, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect and https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-windowplacement , DPI/visible borders/workspace coordinate distinction (accessed 2026-10-21 via web open).
- **A4:** Microsoft SetThreadDpiAwarenessContext and Electron 39.8.10 screen documentation, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext and https://raw.githubusercontent.com/electron/electron/v39.8.10/docs/api/screen.md , scoped thread awareness and display-relative coordinate conversion (accessed 2026-10-21 via web open).
- **A5:** Microsoft IsWindow, https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow , handle recycling and check/use race warning (accessed 2026-10-21 via web open).
- **A6:** Microsoft GetProcessTimes and GetTokenInformation, https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes and https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation , process creation identity and token query rights (accessed 2026-10-21 via web open).
- **A7:** Koffi 3 documentation, https://koffi.dev/start and https://koffi.dev/callbacks , DLL loading/calling conventions/callback lifetime (accessed 2026-10-21 via web open).
- **A8:** Koffi 3 migration and support matrix, https://koffi.dev/migration and https://koffi.dev/ , platform binary optionalDependencies and compiler-free supported packages (accessed 2026-10-21 via web open).
- **A9:** Koffi changelog, https://koffi.dev/changelog ; npm official registry query `npm view koffi version optionalDependencies dist.unpackedSize --json --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=15000`, observed 3.3.3 and win32-x64 optional package; unpacked JS package 1733911 bytes, not total installed size (accessed 2026-10-21 via web open and PowerShell npm metadata query).
- **A10:** Node-API ABI/build documentation, https://nodejs.org/api/n-api.html#implications-of-abi-stability , native-addon alternative; local Node v24.20.0 and Electron 39.8.10 measured with `node -e` (accessed 2026-10-21 via web open and exec_command).
- **A11:** Microsoft UI security overview, https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview , integrity boundary background, not proof of a specific SetWindowPos error (accessed 2026-10-21 via web open).
- **B1:** microsoft/PowerToys:src/modules/fancyzones/FancyZonesLib/WindowUtils.cpp:L59-L95,L195-L250,L333-L358, https://raw.githubusercontent.com/microsoft/PowerToys/main/src/modules/fancyzones/FancyZonesLib/WindowUtils.cpp , fetched implementation including workspace conversion and visible-border compensation; current main, not a pinned release (accessed 2026-10-21 via web open).
- **C1:** src/main/window-geometry.ts:1,28,35 and src/main/capture/electron.ts:14, existing DIP drawer bounds and display scale metadata; `rg -n 'workArea|scaleFactor|setBounds' src/main/window-geometry.ts src/main/capture/electron.ts` (accessed 2026-10-21 via exec_command).
- **C2:** src/main/window-mode.ts:200,261,293,512, existing local state persistence, workArea layout, native rounding avoidance and explicit width setter (accessed 2026-10-21 via exec_command Get-Content and rg).
- **C3:** scripts/floating-split-smoke.ts:1,62,245 and package.json:1, isolated runtime drivers, simulated moved event limitation, Electron/build configuration; no existing user32/koffi adapter found (accessed 2026-10-21 via exec_command Get-Content and rg).
- **D1:** `git log --all --oneline -- src/main/window-mode.ts src/main/window-geometry.ts spikes scripts package.json` returns only 06c24e7 release: v1.0.0 via package.json; `git log --all --oneline --grep='tiling\|koffi\|user32\|window control'` returns empty; `git branch -a` lists main and origin/main. No prior attempt found for external native tiling (accessed 2026-10-21 via exec_command).

## Limitations and reversal

SPEC-0004 remains draft and ADR-0006 proposed; this receipt authorizes no production integration. Research establishes API contracts, not measurements on Chrome/VSCode/Bilibili or physical mixed-DPI monitors. A passed fixture run does not satisfy those product gates. Koffi package resolution initially encountered registry/TLS and version lookup errors; only successful installation and native execution can settle availability.

If FFI crashes, prevents bounded operations or fails packaged loading, stop at the failed stage and compare a minimal Node-API addon. If target apps reject geometry or exceed safe dimensions, retain manual Windows snapping/internal split rather than force resizing. No production imports, global npm configuration changes, title logging or real API requests are needed.

## Audit path

Run `node 'C:/Users/night glow/.agents/skills/ad-ground/scripts/validate-record.mjs' doc/research/0016-ground-external-app-tiling.md` and reopen the registered sources. Structural validity proves coverage, not runtime compatibility. Discovery and subsequent measurements belong to Task 0021 and its separate spike report.
