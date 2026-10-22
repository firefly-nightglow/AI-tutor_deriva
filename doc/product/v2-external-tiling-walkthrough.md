# Deriva v2 外部应用并排验收走查

**Status:** `done`
**Updated:** `2026-10-21`
**Scope ref:** `doc/specs/0004-external-app-tiling.md`
**Task ref:** `doc/tasks/0023-spec-0004-acceptance-walkthrough.md`

这份走查判断 Deriva 能否在不读取外部应用内容的前提下，把用户正在使用的学习软件与悬浮抽屉稳定并排，并在收起、退出和异常恢复时把窗口还给用户。自动证据只代表隔离 fixture 与本地流式服务；产品所有者于 2026-10-21 确认 Task 0022 实操验证通过，下表将其记录为既有 HITL 证据，不冒充代理重新操作。

## 成功标准

| # | SPEC-0004 成功标准 | 自动与既有证据 | 状态 |
| --- | --- | --- | --- |
| SC-1 | VSCode、Chrome、B 站各完成选择、并排、宽度调整、收起还原和展开恢复 | 产品所有者确认 Task 0022 三应用实操通过；SPIKE-0017 另验证窗口枚举、边界的还原 | 通过（产品所有者实操） |
| SC-2 | 两侧不重叠、不覆盖任务栏，Deriva 可正常输入与流式回答 | `npm run smoke:tiling` 验证全高布局、宽度跟随和本地流式回答完成；产品所有者确认三应用布局 | 通过 |
| SC-3 | 手动移动外部应用后解除并排，不强行拉回，可重新并排 | controller 回归测试覆盖手动移动、保留选择和重新并排；Task 0022 实操确认 | 通过 |
| SC-4 | 关闭应用、管理员应用、显示器移除和正常退出有合法结果或明确降级 | controller 与 Win32 错误路径测试；SPIKE-0017 管理员/DPI/双屏证据；Task 0022 实操确认 | 通过 |
| SC-5 | 重启后不静默接管窗口，用户确认后才恢复 | `restore-pending`、失效记录清理和显式恢复测试；Task 0022 实操确认 | 通过 |
| SC-6 | 不读取内容、不注入、不模拟输入，日志不出现完整标题 | `Win32ExternalTilingAdapter` 只调用枚举/placement/SetWindowPos；代码审查和单元测试；无内容采集路径 | 通过（结构证据） |

## 自动检查

运行环境为 Windows x64、Electron 39.8.10、Koffi 3.3.3。自动驱动使用独立用户目录和专用 Electron fixture，不操作用户已有的 VSCode、Chrome 或 B 站窗口。

```powershell
npm test
npm run build
npm run smoke:tiling
npm run accept:tiling -- --runs=3
```

本轮结果：

- `npm test`：53 个测试文件、281 项测试通过。
- `npm run build`：主进程/渲染进程类型检查与生产构建通过。
- `npm run smoke:tiling`：真实主进程、preload、React、Win32 适配器和本地 SSE 服务完成应用选择、并排、流式回答、宽度跟随、收起还原、展开恢复和停止，输出 `PASS external tiling application flow`。
- `npm run accept:tiling -- --runs=3`：3/3 通过，单次 1.84-1.90s；结果在 `node_modules/.cache/deriva-external-tiling-acceptance/results.json`。
- 解包产物中的 Koffi 3.3.3 可加载 `user32.dll`；better-sqlite3 可执行内存 SQLite 查询。
- 选择器截图在 440px 悬浮窗内左右均保留至少 8px，避免面板越界。

## 实机清单

| ID | 场景 | 预期 | 证据 |
| --- | --- | --- | --- |
| H1 | VSCode 选择、并排、拖动 Deriva 边界、收起、展开、停止 | 两个窗口无缝占满工作区；外部应用跟随宽度；收起恢复原布局，展开恢复并排 | 产品所有者确认通过，2026-10-21 |
| H2 | Chrome 重复 H1 | 浏览器保持自身登录态和扩展，Deriva 不注入页面 | 产品所有者确认通过，2026-10-21 |
| H3 | B 站客户端重复 H1 | 桌面客户端可控制；失败时有降级说明 | 产品所有者确认通过，2026-10-21 |
| H4 | 手动移动并排应用 | Deriva 进入暂停，不拉回；显示重新并排 | 产品所有者确认通过，2026-10-21 |
| H5 | 关闭并排应用 | 清除失效选择，对话继续可用 | 产品所有者确认通过；controller 自动回归覆盖 |
| H6 | 管理员权限/受保护窗口 | 不尝试提权，显示手动 Windows 贴靠建议 | SPIKE-0017 与产品所有者确认 |
| H7 | 100% / 125% / 150% DPI | 不越界、不进入错误显示器或任务栏 | SPIKE-0017 与产品所有者确认 |
| H8 | 双显示器和显示器移除 | 跟随当前显示器；显示器消失先还原外部应用 | SPIKE-0017 与产品所有者确认 |
| H9 | 正常退出 | 外部应用立即还原，清除待还原记录 | 产品所有者确认通过；dispose 路径回归 |
| H10 | 强制结束 Deriva 后重启 | 进入恢复提示；用户确认前不移动窗口 | 产品所有者确认通过；`restore-pending` 自动回归 |
| H11 | 并排期间流式回答、树/书签/截图与资料面板 | 回答继续，功能可用，不因窗口移动重启 | 流式并存自动通过；其余功能由既有 v1/SPEC-0003 回归与产品所有者确认 |

## 审查保留风险

| 风险 | 证据 | 处理 |
| --- | --- | --- |
| Win32 调用在主进程同步执行，无响应目标可能短暂阻塞 | `win32.ts` 的 `SetWindowPos`/`SetWindowPlacement`；正常 fixture 无法制造挂起窗口 | 已登记 Task 0024；若复现，评估 utility process，不在验收中宣称 NFR-3 已完全证明 |
| 抽屉拖到外部应用最小宽度以下时是“布局失败并还原”，不是拖动端点直接锁住 | controller 最小宽度测试 | 已登记 Task 0024，作为后续交互优化，不阻塞 v2 外部并排 |
| 状态文件写入失败可能从 IPC 或几何定时器冒泡 | controller 持久化调用路径 | 已登记 Task 0024；当前正常磁盘验收未复现 |

## 结论

SPEC-0004 六条成功标准均有自动或产品所有者实操证据，未发现 Blocker。风险集中在同步原生调用的极端阻塞和最小宽度拖动手感，已明确记录，不影响本轮外部并排功能验收；Task 0023 已收口为 done。
