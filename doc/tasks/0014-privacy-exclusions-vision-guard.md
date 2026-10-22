# Task 0014: 隐私排除与视觉模型守卫

**Status:** `done`
**Created:** `2026-10-08`
**Scope ref:** `doc/specs/0002-screen-capture-questions.md`
**Evidence ref:** ``
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0002-screen-capture-questions.md`
**Board ref:** ``

## Context

SPEC-0002 的两条安全约束合为一个任务：FR-7 隐私排除（用户可配置不捕获的显示器/窗口标题，被排除目标不可选、预览目标变排除项时阻止发送）与 FR-10 视觉守卫（当前模型配置不支持视觉输入时，屏幕提问入口给出可理解的阻止提示而非静默丢图）。两者都是"宁可拦下也不能错发"的行为，规则简单但必须被测试与用户实操双重确认（Scenario 5）。

## Acceptance Criteria

- [x] 设置页新增隐私排除配置：至少支持按显示器与窗口标题添加/移除排除项，配置本地持久化
- [x] 源选择器与覆盖层捕获路径都应用排除过滤，被排除目标不出现在可选列表
- [x] 预览阶段目标变为排除项（如窗口标题变化或用户新加规则）时阻止发送并提示原因
- [x] 当前模型不支持视觉输入时，截图提问与选中即问入口显示可理解的阻止提示，不静默丢弃截图
- [x] 排除规则与守卫行为有单元测试；用户实操确认排除项生效、守卫提示可见

## Plan

- [x] 实现排除项配置存储（复用 llm-config 式本地 JSON 或设置存储）与设置页 UI
- [x] 在 Task 0011 枚举接口与 Task 0012/0013 发送路径接入排除过滤与预览再校验
- [x] 实现视觉能力判定与入口守卫（模型配置可注入替身测试）
- [x] 补单元测试与 jsdom 用例
- [x] 用户实操验收（HITL）

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-08

任务创建，来源 SPEC-0002 拆解（Scenario 5，FR-7/FR-10）。依赖 Task 0011-0013。视觉能力判定规则（按模型名/配置判断）实现前若不确定，按 /ad-ground 轻量调研回填 Evidence ref。

### 2026-10-16

实现完成，状态置为 in-progress，等待用户验收。落地：

1. `src/renderer/src/lib/privacyPrefs.ts`：显示器 ID 与窗口标题排除项的本地持久化、去重和来源匹配。
2. `SettingsPanel` 新增“隐私排除”设置块，可添加/移除显示器 ID 与窗口标题关键词。
3. `ScreenshotDialog` 在 `listSources` 调用中传入排除过滤；整幅捕获、框选局部和发送前都重新读取规则并阻止被排除来源。
4. `src/renderer/src/lib/vision.ts` 提供保守的视觉模型白名单；`ScreenshotDialog` 打开时读取当前模型配置，非视觉模型直接显示阻止提示且不加载来源列表。

验证：全量 `200` 项测试通过（39 个文件）；`npm run build`（含 node/web typecheck）通过。仍待用户验收隐私排除过滤、预览阶段拦截与非视觉模型提示。

### 2026-10-16

用户确认验收通过，执行 `/ad-review`，留痕：`.agentic/reviews/2026-10-16T18-49-23-task-0014-privacy-vision-guard.md`。评审结论：Standards 0 Blockers / 0 Concerns / 2 Notes；Spec 0 Blockers / 0 Concerns。两条 Note（排除策略在渲染进程持有、视觉模型白名单为静态维护点）均不阻塞。Status 置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
