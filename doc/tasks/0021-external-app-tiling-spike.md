# Task 0021: 外部应用并排窗口控制 spike

**Status:** `in-progress`
**Created:** `2026-10-18`
**Scope ref:** `doc/specs/0004-external-app-tiling.md`
**Evidence ref:** `doc/research/0016-ground-external-app-tiling.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0004-external-app-tiling.md`
**Board ref:** ``

## Context

SPEC-0004 要求 Deriva 选择一个外部应用并与其左右并排。Electron 没有枚举或移动其他应用窗口的 API，必须验证 Windows 原生窗口控制在目标机器、DPI、多显示器、管理员权限与打包环境下是否可靠。本任务先完成 `/ad-ground` 四源调研，再做 spike 与证据记录，不交付生产功能；通过后才进入 Task 0022。

## Acceptance Criteria

- [x] 能在目标机器上枚举 VSCode、Chrome、B 站客户端的顶层窗口，取得稳定标识、bounds、最大化/最小化状态与所在显示器
- [x] 能对上述三个应用分别完成一次左右并排、边界调整与原始 bounds 还原
- [x] 验证 100% / 125% / 150% DPI 与双显示器场景，窗口不越界、不落到错误显示器
- [x] 验证管理员权限窗口的失败表现，能区分“不可控制”与“窗口不存在”，并给出可理解降级
- [x] 验证所选技术（优先 `koffi` + `user32`，备选原生 addon）在开发环境与打包产物中均可加载
- [x] 完成 `/ad-ground` 并记录 `doc/research/0016-ground-external-app-tiling.md`（官方文档、公开实现、仓库内模式、git 历史）
- [x] 记录 spike 研究报告，包含 go/no-go 结论、证据、失败模式与替代方案（编号由研究目录分配）

## Plan

- [x] `/ad-ground`：调研 Electron 原生窗口控制边界、user32 窗口枚举/移动、koffi 与原生 addon、DPI/多显示器/权限
- [x] 编写最小 Node/Electron spike，枚举顶层窗口并输出标识、bounds 与进程信息
- [x] 实现单窗口并排、还原与边界调整
- [x] 对 VSCode、Chrome、B 站客户端逐项实测并记录
- [x] 验证 DPI、多显示器、管理员权限与打包加载
- [x] 评估 `koffi` 与原生 addon 的维护、体积、升级与签名成本
- [x] 写 spike 报告并给出 go/no-go 与 SPEC-0004 的修正建议

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-18

任务创建，来源 SPEC-0004 的 Spike Gate 与 ADR-0006。不得在 spike 未通过前把原生窗口控制合入生产代码。

### 2026-10-21

开始执行。GROUND-0016 已记录四源调研并通过 validate-record（valid: true、unreadable: []）。结论 Conditional，仅允许隔离实验，不表示 SPEC-0004 或 ADR-0006 已 accepted，也不放开 Task 0022 生产实现门槛。

产品所有者确认优先 koffi + Win32，依次验证枚举、并排/还原、DPI/权限、打包；自动化只移动专用测试窗口，VSCode、Chrome、B 站窗口留给显式选择后的实测。候选方案见 spikes/0001-external-app-tiling/README.md。原研究预留编号 0014/0015 已被其他任务占用，修正为 GROUND-0016 与 SPIKE-0017；过去 Notes 不改写。

### 2026-10-21

自动 fixture 在开发与独立打包产物中均为 7/7 通过；最初测试主机的像素单位错误已修正并保留失败证据。产品所有者明确确认三款应用、DPI/双显示器、权限与打包人工验证通过，报告见 `doc/research/0017-spike-external-app-tiling.md`。结论为 GO；任务仅等待代码/证据评审后置 done，不阻塞 Task 0022。

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Spike report recorded and reviewed
- [x] Go/no-go decision recorded in the report
- [ ] No production code merged
- [ ] Status updated to `done` and Notes log closes the task
