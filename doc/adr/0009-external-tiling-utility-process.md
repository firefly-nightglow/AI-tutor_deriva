# ADR-0009: External Tiling Native Control Runs in a Utility Process

**Status:** `accepted`
**Date:** `2026-10-22`
**Deciders:** `产品所有者（本人）`
**Amends:** `ADR-0006 — changes the execution location from the Electron main process to an isolated utility process`

## Context

Task 0024 的受控阻塞 fixture 测得同步 `SetWindowPos` 可让 Electron 主进程事件循环停约 1662ms，超过 100ms 加固阈值。NFR-3 要求并排窗口移动不能阻塞 Deriva 的输入和流式回答；继续把 Koffi 调用留在主进程无法满足该约束。ADR-0006 的原意仍是主进程持有产品语义和类型安全边界，但“适配器在主进程内执行”这一点需要修正。

## Decision

We will 把 Win32 窗口几何适配器与外部并排 controller 放入独立 Electron `utilityProcess`，主进程只保留异步 service proxy、生命周期管理、窗口模式协调和 IPC 暴露。utility process 通过 `parentPort` 接收查询、选择、并排、重排、恢复、抽屉几何更新与退出命令；主进程不得直接调用 Koffi。正常退出先请求 worker 还原外部窗口并等待有限时间，失败时终止 worker 并依赖持久化恢复记录。

## Consequences

- 正面：同步 Win32 调用不再占用主进程事件循环；受控实测主进程阻塞从约 1662ms 降到 6ms。
- 正面：worker 崩溃或挂起不会直接冻结对话、流式回答和主窗口。
- 正面：controller 的同步状态机可以原样运行在 worker 内，现有单元测试继续覆盖业务语义。
- 负面：主进程与 worker 之间新增异步 RPC、排队、状态事件和退出超时处理。
- 负面：打包必须同时包含 `out/main/tiling-worker.js` 与 ASAR 外的 Koffi native 包，并增加 packaged smoke。
- 负面：worker 异常退出时主进程只能报告不可用并保留磁盘恢复记录，不能立即知道内存中的窗口细节。
- 中性：外部应用的还原可能等待 worker；正常退出通过 `before-quit` 延迟最多 2.5 秒。

## Alternatives Considered

* 继续在主进程同步调用 Koffi — 受控 fixture 已实测阻塞 1662ms，违反 NFR-3。
* 仅使用 `SWP_ASYNCWINDOWPOS` — 无法保证窗口线程繁忙时调用不阻塞，也无法消除其他同步 Win32 读取。
* 把每次 FFI 调用放进 Node worker pool 但保留 controller 在主进程 — controller 仍需异步化，且同一窗口操作会跨多个 worker，时序与身份校验更复杂。
* 不提供外部应用并排 — 会丢失已验收的核心学习场景。
