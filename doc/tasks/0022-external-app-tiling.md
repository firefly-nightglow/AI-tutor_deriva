# Task 0022: 外部应用并排实现

**Status:** `done`
**Created:** `2026-10-18`
**Scope ref:** `doc/specs/0004-external-app-tiling.md`
**Evidence ref:** `doc/research/0018-ground-external-app-tiling-production.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0004-external-app-tiling.md`
**Board ref:** ``

## Context

在 Task 0021 的窗口控制 spike 通过后，按 SPEC-0004 实现“选择一个外部应用，与悬浮抽屉左右并排、调整边界、暂停/还原”的完整能力。实现必须隔离在主进程适配器中，不读取外部应用内容，不注入代码，不模拟输入，并为 v3 保留稳定的窗口/进程标识。

## Acceptance Criteria

- [x] 提供“选择并排应用”入口与窗口选择器；排除 Deriva 自身、系统外壳、不可见与失效窗口
- [x] 同一时间只并排一个外部应用；选择新应用时先还原旧应用
- [x] 外部应用占据抽屉之外的剩余工作区，高度等于工作区，不重叠、不覆盖任务栏
- [x] 内侧边界可拖动并同步调整两侧宽度，受最小宽度约束；比例按显示器持久化
- [x] 用户手动移动/缩放应用后解除并排，保留选择并提供“重新并排”，不强行拉回
- [x] 收起、切回普通窗口或正常退出时暂停并排并还原原始 bounds、最大化状态与显示器；重新展开时恢复并排
- [x] 应用关闭、崩溃、管理员权限或系统保护时解除并排并给出明确降级说明
- [x] 多显示器移动、显示器移除、DPI 变化时窗口保持合法位置
- [x] 异常退出后保留待还原记录，下次启动按决议处理，不静默接管窗口
- [x] 通过类型安全 IPC 向渲染进程暴露状态；渲染进程不持有窗口句柄
- [x] 为 v3 暴露稳定窗口/进程标识与 bounds 查询，不实现任何采集
- [x] 用户实操确认：VSCode、Chrome、B 站客户端各完成一次完整并排、调整、还原与恢复

## Plan

- [x] 定义主进程窗口控制适配器接口与 IPC 契约
- [x] 实现窗口枚举、过滤、选择器数据与状态模型
- [x] 实现并排布局、边界调整、最小宽度与比例持久化
- [x] 实现暂停/还原、最大化状态与显示器恢复
- [x] 实现手动移动检测、失效窗口检测与降级提示
- [x] 实现待还原记录与异常启动恢复
- [x] 实现 Deriva 侧状态条与“更换/重新并排/停止并排”入口
- [x] 补单元测试、原生调用桩测试与 HITL 验收

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-18

任务创建，依赖 Task 0021 spike 通过。未通过前保持 proposed，不开始生产实现。

### 2026-10-21

SPIKE-0017 已由产品所有者确认通过。GROUND-0018 记录生产 happy path 并通过结构校验；开始主进程适配器、状态机、IPC、选择界面与恢复记录实现。Koffi 原生分包必须显式排除 ASAR。

### 2026-10-21 实现与自动验证

TDD 纵向切片已完成：

- `ExternalTilingController` 覆盖选择、更换前还原、抽屉几何同步、暂停/恢复、手动移动、关闭、几何拒绝、显式异常恢复、停止、重新并排、最小宽度、按显示器比例、失效恢复记录清理和主进程状态发布；15 项测试通过。
- 生产 `Win32ExternalTilingAdapter` 使用 Koffi 3.3.3，组合 HWND + PID + 进程创建时间，拒绝管理员/不可调整/最小化窗口，调用前保存 placement，按 DWM visible bounds 补偿边框，失败时由控制器回滚。
- 类型安全 IPC 与 preload API 已接线；渲染层提供选择器、当前状态、重新并排、停止并排及异常恢复确认。渲染层不持有 HWND。
- 抽屉几何变化会以 16ms 合并后同步外部窗口；收起、最小化、普通窗口和显示器回退会还原外部窗口，重新展开会重新并排。手动移动后清除旧快照，停止并排不会覆盖用户新布局。

验证结果：

- `npm test`：53 个测试文件、272 项测试通过。
- `npm run build`：主/渲染类型检查与生产构建通过。
- `npm run smoke:tiling`：真实主进程、preload、React 与 Win32 适配器完成选择、宽度跟随、收起还原、展开恢复与停止，输出 `PASS external tiling application flow`。
- `dist/win-unpacked` 解包产物生成成功；打包后的 Koffi 3.3.3 可加载 `user32.dll`，打包后的 better-sqlite3 可执行内存 SQLite 查询。
- `build:unpack` 首次在线重编译 better-sqlite3 时因 artifacts.electronjs.org 连接超时失败；随后用已安装原生依赖的 `electron-builder --dir --config.npmRebuild=false` 生成产物，并分别验证 Koffi 与 SQLite 可加载。

仍未完成：VSCode、Chrome、B 站客户端的最终真实应用实操确认。任务保持 in-progress，待产品所有者验证后再评审与置 done。

### 2026-10-21 收口复验

后续复查补齐了高 DPI 比例换算、恢复失败、暂停应用关闭、重新并排目标失效、抽屉最小宽度与普通模式异常恢复提示。控制器测试增至 22 项，组件与 App 回归通过；全量结果为 53 个测试文件、280 项测试通过。

视觉 smoke 发现选择面板在 440px 悬浮窗中 `left = -48px`，标题被裁切。已改为受视口约束的 fixed 面板，并在 smoke 中断言左右至少保留 8px；修复后重新生成截图并完成全链路 PASS。最终 `npm run smoke:tiling` 与 `npm run build` 再次通过，最终解包产物中的 Koffi/user32 与 better-sqlite3 均单独加载成功。

### 2026-10-21 代码审查收口

首轮审查发现一个 Standards Blocker：外部窗口移动失败且回滚也失败时，select/resume/retile/几何更新路径可能删除还原快照。已先增加双失败回归测试，再统一改为保留快照并进入 `restore-pending`；重跑后 281 项测试、构建和完整烟测通过。

收口审查结果：

- Standards：0 Blocker；保留同步 Win32 调用可能阻塞无响应目标、持久化写入失败可能冒泡两个 Concern。
- Spec：0 Blocker；保留最小宽度拖动的视觉停止反馈不完整这一 Concern。
- Concern 的实机观察与后续处置已登记到 Task 0023 走查；不影响本轮三应用验收。
- 审查留痕：`.agentic/reviews/2026-10-21T21-41-07-task-0022-working-tree.md`、`.agentic/reviews/2026-10-21T21-43-21-task-0022-rereview.md`。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
