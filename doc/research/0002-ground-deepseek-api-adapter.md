# GROUND-0002: DeepSeek API 适配层、密钥存储与流式问答通道的实现路径

**Status:** recorded
**Decision:** 用 Node 内置 fetch + data-only SSE 解析实现 OpenAI 兼容客户端（不引入 openai SDK），密钥经 Electron safeStorage 同步 API 加密后以 base64 落盘到 userData 下的独立文件，主进程用 webContents.send 推送 delta/done/error 事件，上下文组装实现为 system prompt + 可插拔 context block 列表的管线。
**Decision ref:** doc/tasks/0002-api-adapter-key-storage.md
**Confidence:** Strong

## Decision and confidence

Happy path：请求体按 DeepSeek 官方 API 参考构造，`model` 取 `deepseek-flash`，`stream: true` 时服务端返回 data-only SSE 并以 `data: [DONE]` 结束（A3）；解析按 MDN 的 SSE 事件流格式（事件之间以空行分隔、字段形如 `字段名: 值`、冒号开头的行为注释）实现（B1），响应体按 `response.body` + `getReader()` 增量读取（B2）；错误按 DeepSeek 官方错误码分类——401 鉴权失败、402 余额不足、429 限流，另有 400/422/500/503（A1、A2），配合本地 30 秒超时；密钥用 safeStorage（A4）加密，主进程向渲染进程推送用 `webContents.send(channel, ...args)`（A5）；管线沿用仓库既有的类型化 IPC 通道与 preload 契约模式（C2），校验错误沿用 `ValidationError` 之类显式错误类型（C3）。

三处偏离，均已具名理由：

1. **不使用 `openai` SDK**，改用内置 fetch + 自写 SSE 解析。参考实现 Specter-AI 确实使用 `openai@^4.73.0`（B3），这是社区主流做法；但本任务 NFR-3 要求 30 秒超时与 401/402/429 的逐项可读提示，自写传输层可以同时控制 AbortController 的生命周期、状态码分类与重试边界，且当前 `dependencies` 只有 better-sqlite3，避免为一个已文档化的线上协议引入额外依赖树。代价是需要自己维护解析器，因此解析与错误分类都必须有单元测试覆盖。
2. **safeStorage 使用同步 API**。Electron 官方文档当前建议优先用 `encryptStringAsync` / `decryptStringAsync`（A4），但本项目锁定的 Electron 39.8.10 只提供同步的 `encryptString` / `decryptString` / `isEncryptionAvailable`（B4 实测类型声明）。这是版本约束下的被迫选择，不是偏好；升级 Electron 后应改用异步 API。
3. **主进程推送用 `webContents.send` 而非 `ipcRenderer.invoke` 的返回值**。一次性请求仍走 invoke（C2），但流式增量必须由主进程主动推送（A5），因此 preload 需要额外暴露一个只读的事件订阅接口，并在渲染进程侧提供取消订阅的句柄。

Axis-2 verdict: Strong。协议、错误码、加密 API、IPC 推送四类关键事实都有官方文档支撑，唯一被迫偏离（同步 safeStorage）有本机类型声明实证，且不影响对外行为。

## Evidence

### E1 — DeepSeek 的流式响应是 data-only SSE，以 data: [DONE] 结束

**Strength:** High
**Provenance:** A3, B1

A3 原文：Tokens will be sent as data-only server-sent events (SSE) as they become available, with the stream terminated by a data: [DONE] message。同一文档给出 `stream` 为 boolean、`stream_options` 必须与 `stream: true` 同时使用。B1 给出 SSE 的通用分帧规则：消息之间以一对换行分隔，字段格式为「字段名: 值」，以冒号开头的行是注释（可用于 keep-alive），因此解析器必须能处理跨 chunk 截断与多行 data。

### E2 — 四类必需错误有官方状态码定义

**Strength:** High
**Provenance:** A1, A2

A1 列出：401 Authentication Fails（API key 错误）、402 Insufficient Balance（余额耗尽）、429 Rate Limit Reached（请求过快），另有 400 Invalid Format、422 Invalid Parameters、500 Server Error、503 Server Overloaded。A2 说明 429 由账号级并发超限触发。NFR-3 要求区分超时、鉴权失败、余额不足、限流四类，前三类由 401/402 直接对应，限流对应 429，超时则由本地 30 秒 AbortController 判定，不依赖服务端。

### E3 — 模型标识与关键请求字段

**Strength:** High
**Provenance:** A3

A3 规定 `model` 为必填，取值 `deepseek-flash` 或 `deepseek-v4-pro`；`max_tokens` 取值 1 到 384K；`temperature` 上限 2 且思考模式下无效；`thinking` 对象控制思考模式开关。适配层的默认模型取 `deepseek-flash`（ADR-0002），模型名随消息落库供 FR-13 使用。

### E4 — safeStorage 的加密语义与版本约束

**Strength:** High
**Provenance:** A4, B4

A4：safeStorage 使用操作系统提供的加密（Windows 走 DPAPI，密钥绑定当前登录用户），提供 `isEncryptionAvailable()`、`encryptString()`、`decryptString()`，并说明 Windows 上「可防止同一机器上的其他用户读取，但不能防止同一用户下的其他应用」。A4 同时建议优先使用异步变体。B4 实测本项目安装的 Electron 39.8.10 类型声明中只有同步的 `encryptString` / `decryptString` / `isEncryptionAvailable` / `setUsePlainTextEncryption`，没有 async 变体，故本任务必须用同步 API；`isEncryptionAvailable()` 为假时必须报错而不是退化为明文存储（NFR-2）。

### E5 — 主进程向渲染进程推送消息用 webContents.send

**Strength:** High
**Provenance:** A5

A5 原文：`contents.send(channel, ...args)` — Send an asynchronous message to the renderer process via channel, along with arguments，参数经 Structured Clone Algorithm 序列化，函数/Promise/Symbol 等会抛错。因此流式事件只传可结构化克隆的普通对象（requestId、type、text），渲染进程侧通过 preload 暴露的订阅接口接收。

### E6 — fetch 响应体可增量读取

**Strength:** High
**Provenance:** B2

B2 说明 `response.body` 是 ReadableStream，通过 `body.getReader()` 取得 reader 后可按块读取。Node 18 起内置 fetch 提供同样的接口，主进程无需额外 HTTP 客户端。

### E7 — 仓库内已有的接入点与可复用模式

**Strength:** High
**Provenance:** C1, C2, C3

C1：`src/main/llm/index.ts` 是 ADR-0004 预留的模型接入模块边界，注释已写明本任务应填入 OpenAI 兼容客户端、密钥存储、错误分类与上下文管线。C2：`src/shared/ipc-channels.ts` 集中定义通道名，`src/main/ipc.ts` 用 `ipcMain.handle` 注册，`src/preload/index.ts` 以类型化 `TutorApi` 暴露给渲染进程——流式通道应扩展这三处而不是另起一套。C3：`src/main/db/errors.ts` 用显式错误类型（NotFoundError、DuplicateNameError、ValidationError）区分失败原因，LLM 错误分类沿用同一风格。

### E8 — 仓库无历史提交，无既有尝试可循

**Strength:** High
**Provenance:** D1

D1 显示当前目录不是 git 仓库（`git log` 与 `git status` 均返回 fatal: not a git repository），因此没有历史提交或分支可检索，属可复现的「no prior attempt found」。

## Source register

- **A1:** DeepSeek 官方文档 Error Codes，401/402/429 等状态码成因与处置，https://api-docs.deepseek.com/quick_start/error_codes (accessed 2026-10-03 via curl fetch of official docs page)
- **A2:** DeepSeek 官方文档 Rate Limit & Isolation，账号级并发限制与 429 触发条件，https://api-docs.deepseek.com/quick_start/rate_limit (accessed 2026-10-03 via curl fetch of official docs page)
- **A3:** DeepSeek 官方 API 参考 Create Chat Completion，model 取值、stream 与 data: [DONE] 语义、max_tokens/temperature/thinking 字段，https://api-docs.deepseek.com/api/create-chat-completion (accessed 2026-10-03 via curl fetch of official docs page)
- **A4:** Electron 官方文档 safeStorage，isEncryptionAvailable/encryptString/decryptString 与各平台密钥语义，https://www.electronjs.org/docs/latest/api/safe-storage (accessed 2026-10-03 via curl fetch of official docs page)
- **A5:** Electron 官方文档 webContents，contents.send(channel, ...args) 与结构化克隆说明，https://www.electronjs.org/docs/latest/api/web-contents (accessed 2026-10-03 via curl fetch of official docs page)
- **B1:** MDN Using server-sent events，事件流格式：消息以一对换行分隔、字段名冒号值、冒号开头为注释，https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events (accessed 2026-10-03 via curl fetch of official docs page)
- **B2:** MDN Using readable streams，response.body 与 body.getReader() 增量读取，https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams (accessed 2026-10-03 via curl fetch of official docs page)
- **B3:** umairinayat/Specter-AI package.json，同形态 Electron 应用使用 openai@^4.73.0 调用 OpenAI 兼容接口的参考实现，https://github.com/umairinayat/Specter-AI/blob/main/package.json (accessed 2026-10-03 via curl fetch of raw.githubusercontent.com)
- **B4:** 本机安装产物 node_modules/electron/electron.d.ts 检查，safeStorage 仅有同步 encryptString/decryptString/isEncryptionAvailable/setUsePlainTextEncryption 四个成员，无 async 变体 (accessed 2026-10-03 via local shell)
- **C1:** 仓库内 `src/main/llm/index.ts:1-8`，ADR-0004 预留的模型接入模块边界与其职责注释 (accessed 2026-10-03 via local shell)
- **C2:** 仓库内 `src/shared/ipc-channels.ts:1-9`、`src/main/ipc.ts:1-12`、`src/preload/index.ts`，既有的通道集中定义 + ipcMain.handle + 类型化 preload 契约模式 (accessed 2026-10-03 via local shell)
- **C3:** 仓库内 `src/main/db/errors.ts:1-20`，用显式错误类型区分失败原因的风格 (accessed 2026-10-03 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，无历史提交可检索，结论 no prior attempt found (accessed 2026-10-03 via local shell)

## Limitations and reversal

本记录不能证明：真实 DeepSeek 账号下的 402/429 响应体形状是否与错误码文档完全一致（文档给的是状态码语义，未给出响应体 schema，因此分类以 HTTP 状态码为主、响应体文本为辅）；SSE 解析器对服务端 keep-alive 注释行与多行 data 的处理只能靠单元测试与真实联调共同验证，而真实联调需要用户提供 API key（本任务标记 HITL 的原因）；safeStorage 在 Windows 上不防同一用户下的其他应用，NFR-2 的「不写入日志、不落明文」在本机范围内成立，但不构成对同用户恶意软件的防护。反转条件：若真实联调发现 deepseek-flash 的流式分片与文档描述不符（例如不再以 data: [DONE] 结束），则需回到本记录重跑 Source A 并调整解析器。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0002-ground-deepseek-api-adapter.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
