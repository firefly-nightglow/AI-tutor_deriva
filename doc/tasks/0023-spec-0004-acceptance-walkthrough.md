# Task 0023: SPEC-0004 验收走查

**Status:** `done`
**Created:** `2026-10-18`
**Scope ref:** `doc/specs/0004-external-app-tiling.md`
**Evidence ref:** `doc/research/0020-ground-external-app-tiling-acceptance-execution.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0004-external-app-tiling.md`
**Board ref:** ``

## Context

SPEC-0004 的收尾任务：在真实学习场景中验证外部应用并排的选择、边界调整、暂停/还原、异常降级与多显示器行为，并确认没有破坏 SPEC-0003 的抽屉、气泡、托盘、资料面板与截图提问。

## Acceptance Criteria

- [x] SPEC-0004 六条 Success Criteria 逐条走查并记录证据
- [x] VSCode、Chrome、B 站客户端各完成一次选择、并排、边界调整、收起还原与重新展开
- [x] 管理员权限应用、应用关闭、手动移动、显示器移除、DPI 变化均有可理解降级
- [x] 正常退出与异常退出后的窗口还原均符合决议，不留下屏幕外窗口
- [x] 并排期间 Deriva 流式回答、树状对话、书签、截图提问与资料面板均可用
- [x] 形成 `doc/product/v2-external-tiling-walkthrough.md`，区分自动证据、实操证据与待验项

## Plan

- [x] 编写验收走查文档与边界条件检查表
- [x] 执行自动化回归（窗口枚举桩、状态模型、还原记录）
- [x] 执行 HITL 三应用并排与降级验收
- [x] 登记走查发现的缺陷并决定是否新增任务

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-18

任务创建，依赖 Task 0022 完成。对应 SPEC-0003 的 Task 0020 验收角色。

### 2026-10-21

GROUND-0019 已完成：自动证据继续复用隔离 Electron 驱动和 fake native adapter，真实三应用、权限、DPI、双显示器与异常退出由 HITL 单独确认。本任务等待 Task 0022 完成。

### 2026-10-21 启动

Task 0022 已完成实现、自动验证和收口审查。GROUND-0020 重新记录验收执行路径并通过结构校验：真实应用与系统边界作为 HITL 证据，完整 Electron smoke 作为自动链路证据，二者分别计入走查。

### 2026-10-21 完成

交付 `doc/product/v2-external-tiling-walkthrough.md`。自动链路新增并排期间本地流式回答，`npm run smoke:tiling` 通过；`npm run accept:tiling -- --runs=3` 为 3/3 通过。产品所有者此前确认三应用与系统边界实操通过，本轮按“既有 HITL 证据”记录，不冒充代理重新操作。

Task 0022 审查保留的两个实机风险已登记：同步 Win32 调用对无响应目标的最大阻塞，以及最小宽度拖动的视觉停止反馈。两者不构成本轮 Blocker；若真实应用复现阻塞，应另立 utility process 调研任务。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Walkthrough recorded and reviewed
- [x] Defects triaged
- [x] Status updated to `done` and Notes log closes the task
