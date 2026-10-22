# SPIKE-0017: Windows 外部应用窗口几何

**Status:** recorded
**Decision:** GO，采用 `koffi` 3.3.3 调用 Win32，但必须封装在主进程适配器后并保留手动贴靠降级
**Decision ref:** doc/tasks/0021-external-app-tiling-spike.md
**Confidence:** Strong for production spike; Conditional for universal application compatibility

## Outcome

隔离实验证明 Windows x64、Electron 39.8.10 与 Koffi 3.3.3 可以完成顶层窗口枚举、稳定标识读取、左右并排、边界调整、最大化/普通状态还原及异常拒绝。开发运行与独立打包产物均为 7/7 fixture 通过。产品所有者于 2026-10-21 明确回复“验证通过”，确认真实 VSCode、Chrome、B 站客户端、三档 DPI、双显示器、管理员权限与打包环境的人工门槛通过；该确认不附带逐应用测量值，不能外推为所有应用均可控制。

结论是 GO：可以在 Task 0022 中实现生产适配器、状态机、IPC 与选择界面。不是“所有外部窗口都能控制”的承诺；管理员、DRM、UWP、拒绝几何变更或快速换窗仍须走可理解降级。

## Evidence

### Automated fixture

`spikes/0001-external-app-tiling/eval/results.json` 记录 `packaged: true`、7 个端到端案例全部通过：

- 普通窗口右侧/左侧并排、边界调整与还原。
- 最大化窗口还原后保持最大化。
- 最小化窗口拒绝并保持状态。
- 超过屏幕宽度的最小尺寸窗口拒绝移动并还原。
- stale PID/创建时间拒绝。
- 已关闭窗口报告 `window-missing`，不混同权限拒绝。

三个运行阶段 `02-identify`、`03-layout`、`04-restore` 各 7/7 通过。失败记录保留在 `debug/`；最初的主机 DIP/物理像素单位错误没有被计为成功。

### Packaging

开发 Electron 与 `node_modules/.cache/deriva-tiling-package/win-unpacked/Deriva Window Spike.exe` 均通过。打包配置必须把 `@koromix/koffi-win32-x64` 的 `koffi.node` 放在 ASAR 外；生产依赖与 `asarUnpack` 将按同一结构显式配置。

### Limits observed

- 自动测试只移动实验创建的不同进程窗口，不移动用户当前工作窗口。
- 最小尺寸应用可能忽略目标宽度；读回验证仍能识别拒绝，但适配器必须把“用户已看到布局”视为成功，而不是只看 `SetWindowPos` 的返回值。
- HWND 可回收，身份必须组合 PID 与进程创建时间，并在每次变更前复核。
- 外部应用可能在快照、移动与读回之间关闭或换窗，无法获得完全不竞争的保证。
- 管理员或受保护窗口不能通过提权绕过；生产版本只报告不可控制并提示 Windows 手动贴靠。

## Promote / Delete

生产代码从该 spike 提取接口与行为，不直接导入 spike 文件。`spikes/0001-external-app-tiling/` 在 Task 0022 结束、生产回归覆盖同等状态后再删除；在此之前保留为证据与可重跑基准。
