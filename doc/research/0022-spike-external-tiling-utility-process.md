# SPIKE-0022: External Tiling Utility Process Isolation

**Status:** recorded
**Decision:** GO — Win32 adapter and controller run in an Electron utility process
**Decision ref:** doc/tasks/0024-external-tiling-hardening.md
**Confidence:** Strong for responsiveness isolation; Conditional until packaged and HITL regression pass

## Outcome

受控 Electron fixture 主动阻塞自身消息泵 1800ms。迁移前，直接在主进程执行生产 Win32 adapter 的 `tile` 导致主进程事件循环约 1662ms 无法处理 timer；超过 GROUND-0021 的 100ms 门槛。迁移后，同一 fixture 和同一显示环境下，主进程派发请求约 16ms，事件循环只延迟约 6ms；worker 调用本身约 1678ms 才完成。worker 被阻塞期间主进程仍可调度事件。

因此采用 utility process 承载 controller 与 Koffi adapter，主进程只保留异步 service proxy。该结论支持 ADR-0009；ADR 仍为 proposed，需产品所有者接受后再作为最终架构记录。

## Evidence

- 迁移前：`RESULT {"callMs":1672,"eventLoopBlockMs":1662,"thresholdMs":100,"exceeded":true,"error":null}`。
- 迁移后：`RESULT {"dispatchMs":16,"workerCallMs":1678,"eventLoopBlockMs":6,"thresholdMs":100,"exceeded":false,"error":null}`。
- 两组均使用专用 fixture；结果写入 `node_modules/.cache/deriva-external-tiling-blocking/result.json`。
- `tiling-worker.js` 由 electron-vite 独立构建；完整应用 smoke 通过 worker 完成选择、流式并存、宽度跟随、收起还原、展开恢复和停止。

## Limits

- fixture 模拟消息泵停顿，不覆盖所有 Windows 应用挂起方式。
- 测量是单机结果，不代表所有硬件和调度条件。
- worker 崩溃、打包后路径和正常退出还原仍需完整回归；其中退出已通过开发 smoke 的 `app.quit()` 生命周期间接验证。
- utility process 不消除等待时间，只把等待限制在 worker 内；UI 仍会显示命令尚未完成。

## Follow-up

- packaged 产物验证 `out/main/tiling-worker.js` 与 ASAR 外 Koffi 可加载。
- 将 worker 崩溃和 2.5 秒 dispose 超时保留为失败模式。
- ADR-0006 的“主进程适配器”执行位置由 ADR-0009 修正，等待接受。
