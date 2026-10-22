# Task 0024: 外部应用并排响应性与边界反馈加固

**Status:** `done`
**Created:** `2026-10-21`
**Scope ref:** `doc/specs/0004-external-app-tiling.md`
**Evidence ref:** `doc/research/0021-ground-external-tiling-hardening.md`、`doc/research/0022-spike-external-tiling-utility-process.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0004-external-app-tiling.md`
**Board ref:** ``

## Context

Task 0022 的三应用并排功能已验收，收口审查仍保留三个非阻断风险：Koffi 的同步窗口调用可能被无响应目标拖住主进程；状态文件写入失败可能冒泡到 IPC 或定时器；拖到外部应用 480px 最小宽度以下时当前表现为失败后还原，而不是在拖动端点直接阻止并反馈。本任务只处理这些加固项，不改变外部并排的产品语义。

## Acceptance Criteria

- [x] 构造一个延迟响应窗口移动请求的受控 fixture，记录主进程事件循环最大阻塞；若超过约定阈值，给出隔离到 utility process 或等价方案的实现与回退
- [x] 并排拖动期间本地流式回答持续输出，记录三次运行的完成情况和最大 UI 延迟
- [x] 状态文件不可写时，启动并排不会在没有持久化还原记录的情况下移动外部窗口；已有并排状态不会因保存失败而崩溃
- [x] 保存或恢复失败可转换为 `restore-pending` 或可理解错误状态，并在下一次启动再次提供恢复
- [x] 抽屉拖到剩余空间不足 480 DIP 时在拖动端点停止，不再持续向适配器发送失败更新，并有可见反馈
- [x] 新增回归覆盖阻塞阈值、写入失败、恢复记录保留和最小宽度端点
- [x] 完成代码审查并确认不破坏 SPEC-0004 的三应用并排、收起还原和异常恢复

## Plan

- [x] 用受控 fixture 测量当前主进程阻塞与拖动更新频率
- [x] 设计并验证状态存储失败时的关键/非关键写入边界
- [x] 将最小宽度约束前移到抽屉可拖范围与视觉状态
- [x] 若同步 FFI 超过阈值，调研 utility process 承载 Win32 适配器
- [x] 补单元测试与完整 Electron smoke
- [x] HITL 性能复测
- [x] 更新 SPEC-0004 风险说明并执行代码审查

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-22

GROUND-0021 已完成并通过结构校验。先测量主进程阻塞：超过 100ms 才迁移 utility process；持久化关键写入和 480 DIP 拖动端点独立加固。本任务在测量完成前不把 utility process 当作既定实现。

### 2026-10-22 测量与架构

受控阻塞窗口测得迁移前主进程事件循环阻塞约 1662ms，超过阈值；迁移到 utility process 后主进程阻塞约 6ms，worker 调用约 1678ms。依据 SPIKE-0022 已实施 utility process 代理与独立 worker 入口。

同时完成：关键恢复记录写入失败时禁止移动；非关键写入失败转为可见状态且不冒泡；抽屉在活动并排状态下使用 main 进程下发的最大宽度，renderer 在端点停止拖动并显示反馈。

### 2026-10-22 验证结果

- `npm test`：54 个测试文件、289 项通过。
- 迁移前受控阻塞：主进程事件循环 1662ms。
- 迁移后受控阻塞：主进程事件循环 6ms，worker 调用 1678ms。
- `npm run accept:tiling -- --runs=3`：3/3 通过，单次 1.90-1.92s，均包含并排期间流式回答。
- `npm run smoke:tiling-packaged-worker`：PASS，打包 ASAR 中的 worker 在 utility process 枚举 6 个窗口。
- 最终 Koffi 3.3.3 与 user32 在解包产物中加载成功。

待确认：ADR-0009 当前为 proposed，需要产品所有者接受后再同步 SPEC-0004 的 NFR-1 执行位置并完成代码审查。任务保持 in-progress。

### 2026-10-22 ADR 确认

产品所有者接受 ADR-0009。ADR-0006 已记录 `Amended by`，SPEC-0004 NFR-1 已同步为“主进程管理、utility process 执行”；进入 Task 0024 代码审查。

### 2026-10-22 代码审查

审查先发现并修复两个 Blocker：

- worker 退出后，已在途请求虽会失败，但后续请求可能永久等待；现在 service 记录终止状态并立即拒绝后续请求。
- 每次 active 状态重复设置相同宽度上限都会重新应用几何，可能形成 worker 重排与状态事件循环；setter 现在对相同值 no-op。

同时补上 worker RPC 5 秒超时、超时终止 worker、poll 失败不再产生未处理 Promise，以及对应回归测试。终审结果：Standards 无 issue；Spec 仅保留真实应用 HITL 性能复测待完成。

审查留痕：`.agentic/reviews/2026-10-22T01-54-54-task-0024-final-2.md`。

### 2026-10-22 发布验收

产品所有者确认流式输出正常，并在热区修复后确认“手感完美”。拖动条补为全高 no-drag 区域，握柄与 44px 热区居中对齐。独立 Electron 测试覆盖左右两侧共十次拖动、原生 HTCLIENT 命中、收起/展开和还原；54 文件 292 项测试与构建通过。真实应用验收由产品所有者确认，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
