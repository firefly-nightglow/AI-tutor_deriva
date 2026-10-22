# ADR-0006: 外部应用并排采用 Windows 原生窗口控制，并以 spike 为门槛

**Status:** `accepted`
**Date:** `2026-10-18`
**Deciders:** `产品所有者（本人）`
**Amended by:** `ADR-0009 — native adapter execution moved from the Electron main process to an isolated utility process`

## Context

SPEC-0003 用 Deriva 内嵌资料面板解决网页、PDF 与视频网站的同屏阅读，但无法承载用户自己的 VSCode 工程、带扩展和登录态的浏览器、B 站桌面客户端等原生应用。产品所有者在 Task 0017 实机验收后确认，“在 Deriva 与学习软件之间来回切换”仍是核心痛点，因此要求 v2 增加“选择一个外部应用，与悬浮抽屉自动并排、共享工作区”的能力。

Electron 没有枚举或移动其他应用窗口的 API。可行路径包括：调用 Windows `user32`（`EnumWindows` / `GetWindowRect` / `SetWindowPos` / `ShowWindow` / `IsZoomed`）通过 FFI 或原生 addon；模拟 Win+方向键触发 Windows 贴靠；或放弃外部窗口控制，只保留内嵌资料面板。模拟键盘无法得到可自由调整的边界，也不适合作为长期接口；内嵌面板无法替代原生应用；因此需要在隔离良好的原生适配器与明确的降级边界之间做取舍。

## Decision

We will 把“外部应用并排”作为 v2 的独立能力（SPEC-0004），通过一个仅限 Windows 的原生窗口几何适配器实现，并遵守以下约束：

1. **只控制几何**：适配器只枚举窗口、读取 bounds/最大化状态、设置位置与大小、还原窗口状态；不读取窗口内容、不注入代码、不模拟输入。
2. **独立模块**：原生调用封装在主进程的独立适配器中，渲染进程只通过类型安全的 IPC 使用选择、并排、调整、还原与状态查询能力。
3. **技术选型先 spike**：优先评估 `koffi` 调用 `user32`，备选原生 addon；必须在目标机器上验证枚举、并排、还原、DPI/多显示器、管理员权限降级与打包可用性，再进入正式实现。spike 未通过则不实现本能力。
4. **产品语义**：同一时间只并排一个应用；抽屉收起、切回普通窗口或正常退出时暂停并排并还原应用原始 bounds；用户手动移动应用后解除并排而不是强行拉回；管理员权限或系统保护窗口无法控制时给出明确降级说明。
5. **可恢复性**：持久化“待还原”记录；正常退出立即还原，异常退出后下次启动检测残留记录并按 SPEC-0004 的开放问题决议处理。
6. **为 v3 留标识**：保存稳定的窗口/进程标识与 bounds 查询接口，供 v3 屏幕捕获或进程音频采集复用；本 ADR 不引入任何采集、OCR 或音频能力。

## Consequences

- 正面：Deriva 能与用户真正使用的原生学习软件共享屏幕，直接解决“来回切换窗口”的痛点；内嵌资料面板仍覆盖网页、PDF 与视频网站，两者互补。
- 正面：窗口几何能力被隔离在一个适配器中，未来替换 FFI/原生实现或增加 macOS 支持时不需要改动对话与捕获核心。
- 正面：稳定的窗口/进程标识为 v3 的屏幕与音频两条来源流提供复用点，避免让用户重复选择学习窗口。
- 负面：引入 Windows 原生依赖与打包复杂度；不同 Electron 版本、CPU 架构和安装方式都需要验证。
- 负面：管理员权限窗口、UIPI、UWP、虚拟桌面与全屏应用存在无法控制或行为不一致的情况，只能降级而不能保证完全覆盖。
- 负面：窗口移动/还原涉及用户已有布局，必须维护还原记录与异常恢复；处理不当会让用户觉得应用“接管了桌面”。
- 中性：并排期间收起/展开会产生一次窗口尺寸变化；这是“恢复原布局”换来的确定性。

## Alternatives Considered

* 只做 Deriva 内嵌资料面板 — 无法承载 VSCode、带扩展浏览器与桌面客户端，核心痛点仍存在。
* 模拟 Win+方向键触发 Windows 贴靠 — 只能得到系统预设的分区，无法自由调整边界；依赖键盘模拟，权限与焦点行为更难控制。
* 为每个应用编写插件或深度集成 — 覆盖成本高，且与“选择一个正在运行的应用”的产品模型不符。
* 远程桌面式嵌入外部应用 — 资源开销、权限与交互延迟都不可接受，且超出桌面学习助手的范围。
* 不设 spike 直接实现 — 原生窗口控制在 DPI、权限、打包与多显示器上的失败模式无法在产品验收前暴露，返工风险过高。

## Related

- Specs: [SPEC-0003](../specs/0003-floating-window-split.md)、[SPEC-0004](../specs/0004-external-app-tiling.md)
- Research: [GROUND-0016](../research/0016-ground-external-app-tiling.md)、[SPIKE-0017](../research/0017-spike-external-app-tiling.md)、[GROUND-0018](../research/0018-ground-external-app-tiling-production.md)、[GROUND-0019](../research/0019-ground-external-app-tiling-acceptance.md)
- Tasks: [Task 0021](../tasks/0021-external-app-tiling-spike.md)、[Task 0022](../tasks/0022-external-app-tiling.md)、[Task 0023](../tasks/0023-spec-0004-acceptance-walkthrough.md)
