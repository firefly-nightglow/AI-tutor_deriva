# Task 0002: 实现 API 适配层、Key 安全存储与流式问答通道

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0002-ground-deepseek-api-adapter.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

ADR-0002 确定 API-only 接入：OpenAI 兼容适配层，默认模型 deepseek-flash，key 仅存本地（NFR-2）。本任务提供从界面到模型的完整问答通道，含流式输出与错误处理（NFR-3），是 FR-2 的后半部分。标记 HITL：验收需要用户提供真实 DeepSeek API key 联调。

## Acceptance Criteria

- [x] 用户可在设置页填入、更新、清除 API key；key 经 Electron safeStorage 加密存储，明文不出现在磁盘与任何日志中
- [x] 提问后 AI 回答以流式方式逐段到达渲染进程，模型名随消息记录（供 FR-2/FR-13）
- [x] 网络超时（30 秒）、鉴权失败、余额不足、限流四类错误分别给出可理解提示，失败消息进入错误状态并可重试
- [x] 流式中断时已收到的部分内容保留并落库
- [x] 适配层的 base URL 与模型名可配置（为将来接其他 OpenAI 兼容厂商预留）
- [x] 上下文组装实现为管线结构：system prompt -> 可插拔 context blocks -> 对话链；v1 仅实现对话链一种 block，但接口允许后续注入截图（v2）与知识画像（v3）而不改动调用核心（ADR-0004）

## Plan

- [x] 编写 src/main/llm/ OpenAI 兼容客户端（SSE 流式，deepseek-flash 默认）
- [x] safeStorage 加密的 key 存取模块 + 设置页 UI
- [x] 流式 IPC 通道（主进程推流到渲染进程）
- [x] 错误分类与重试机制（超时 30s、401、402/欠费、429）
- [x] 上下文组装管线抽象（context block 接口 + v1 默认实现）
- [x] 用户用真实 API key 联调验收（HITL）

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0001 的 IPC 与数据层。

### 2026-10-02

按 ADR-0004 追加上下文组装管线预留：可插拔 context blocks，v1 仅实现对话链 block。

### 2026-10-03

完成 /ad-ground 四源调研：doc/research/0002-ground-deepseek-api-adapter.md（校验 valid: true，A5/B4/C3/D1，8 条 claim）。两处具名偏离：不使用 openai SDK（自写 fetch + SSE 以便精确控制 30 秒空闲超时与 401/402/429 分类，且不在只依赖 better-sqlite3 的工程里引入新依赖树）；safeStorage 用同步 API，因为实测本机 Electron 39.8.10 的类型声明只有 encryptString/decryptString/isEncryptionAvailable，没有官方文档推荐的 async 变体。

实现落点：src/main/llm/ 下新增 client（OpenAI 兼容流式客户端）、sse（增量 SSE 解码器）、keys（safeStorage 加密的密钥存储）、config（baseUrl/模型可配置）、context（context block 管线 + 对话链 block）、system-prompt（v0.1 教学提示词，Task 0010 接管细化）、chat-service（落库 + 推流 + 取消 + 重试）、errors（错误分类与中文提示）；共享层新增 ChatStreamEvent/ApiKeyStatus/LlmConfig/StartChatInput 与 8 个 IPC 通道；preload 暴露 llm 子 API（含 onChatEvent 订阅与退订）；渲染层加设置页（Key、baseUrl/模型）与流式验证面板。

验证证据：

1. 61 项测试通过（9 个文件），其中 src/main/llm/__tests__/integration.test.ts 起真实本地 HTTP 服务返回 SSE，把「客户端 → 服务 → 数据库」整条链路跑通，并断言模型实际收到的 messages 首条是 system prompt、末条是本次提问。
2. 错误分类逐项覆盖：401→auth、402→insufficient_balance、429→rate_limit、400→bad_request、503→server、418→unknown，另有「服务端不响应→timeout」与「用户取消→aborted」两个用例。
3. 中断与失败均保留已生成内容：取消用例断言库中 content 为「部分内容」且 status=aborted；限流用例断言 content 为「已经生成的前半段」且 status=error。
4. 密钥：单测断言落盘文件不含明文且拒绝在安全存储不可用时退化为明文；另用真实 Electron 主进程 + Windows DPAPI 实测 safeStorage：{"available":true,"roundTrip":true,"ciphertextLeaksPlaintext":false}。
5. dev 启动自检输出 {"heading":"Deriva","hasBridge":true,"hasLlmBridge":true,"keyStatus":{"hasKey":false,"encryptionAvailable":true},...}，证明 preload → IPC → safeStorage 这一段在真实应用里可用。
6. typecheck（node + web）与 build 均通过，src 下无 TODO/FIXME。

未覆盖的一跳：「chat-service 的 emit → webContents.send → 渲染进程订阅回调」没有在真实流式回答中端到端跑过（单测与集成测试止于 emit 被调用，dev 自检只验证桥接存在）。这一跳与真实 API 联调合并到 HITL 步骤确认。

任务状态保持 in-progress：Plan 中「用户用真实 API key 联调验收（HITL）」未完成，且本任务的 DoD 代码评审尚未进行（上一轮 fresh-context 评审针对的是 Task 0001 的代码）。两件事完成后即可置 done。

### 2026-10-03（用户联调反馈与修复）

用户用真实 API Key 联调，反馈两个问题，均已修复：

1. **API Key 无法右键粘贴**。原因是 Electron 默认不提供上下文菜单（`autoHideMenuBar` 下更是无从调用），这是应用外壳的缺口，不属于任何既有任务。新增 src/main/context-menu.ts：在 webContents 的 context-menu 事件里按 params.isEditable / selectionText 构建菜单，用 role 保留原生剪贴板行为（撤销/重做/剪切/复制/粘贴/全选），标签用中文，并依据 editFlags 决定可用状态。
2. **回答里的数学与 Markdown 以原始标记显示**。先做了根因判定：新增字节级集成测试，把一个多字节字符（ε→∞）在 UTF-8 序列中间切开、分两个网络分片发出，断言解码后完整无损且落库正确——**通过，说明不是编码损坏**。真实原因是渲染层把回答直接放进 `<pre>`，LaTeX 源码与 `##`/`**` 自然原样显示。SPEC-0001 FR-2 要求的 Markdown + KaTeX 渲染原本属于 Task 0003，但它是本次 HITL 联调无法绕过的阅读障碍，故提前落地最小实现：新增 src/renderer/src/components/MarkdownContent.tsx（react-markdown + remark-gfm + remark-math + rehype-katex + katex 样式与字体），并在验证面板替换 `<pre>`。原始 HTML 保持禁用，模型输出无法注入标记。

顺带修掉一个真实渲染缺陷：同一行的 `$$...$$` 会被 remark-math 当作行内公式（模型经常这样写），MarkdownContent 现在把「整行只有 $$...$$」的情况提升为块级公式。

验证：66 项测试通过（新增 4 项渲染断言：`##`/`**` 变成 `<h2>`/`<strong>` 且原符号消失、行内与块级公式产出 katex / katex-display、原始 HTML 被转义、单行 $$ 提升）；typecheck 与 build 通过，KaTeX 字体已随 bundle 产出；dev 启动自检仍为 hasBridge/hasLlmBridge/keyStatus/databasePath 全绿，且 keyStatus.hasKey 已为 true（用户已成功保存密钥），说明保存链路在真实应用里可用。

新增依赖均在 devDependencies（渲染侧依赖随 bundle 打包，符合 electron-vite 的依赖处理规则），renderer bundle 因此增至约 1.55 MB，对桌面应用可接受。

### 2026-10-03（代码评审与关闭）

执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-03T17-41-19-task-0002-llm-channel.md。结论：0 Blocker / 1 Standards Concern / 5 Standards Note，Spec 轴无发现。

Concern 与两条 Note 当轮修复：

1. 验证面板的 streaming 状态由 ref 推导，`done` 分支只清 ref 不触发重渲染，导致一次成功回答后发送按钮停在禁用、取消按钮停在可用 —— 改为 state 跟踪，起始置真、终态事件置假。这条是真实缺陷：用户联调时若注意到按钮状态不对，根因就在这里。
2. normalizeDisplayMath 的内层分组用了 `[\s\S]*?`，畸形输入下可跨行匹配并把两段公式并成一块 —— 收紧为 `[^\n]`，补「相邻两行公式不被合并」的测试。
3. cancel() 与 retry() 直接 await IPC 未捕获异常 —— 补 try/catch。

三条 Note 转交后续任务（已写入 Task 0003 的 Notes）：未显式设置 max_tokens 与 thinking 模式（继承 DeepSeek 默认的思考开启，延迟与成本更高、temperature 失效，应由 Task 0003 决定是否给开关、Task 0010 定策略）；安全存储不可用时聊天侧错误归因为「未配置 API Key」而真实原因是系统密钥库不可用；流式事件广播给所有窗口（SPEC-0002 悬浮窗出现时需重新审视）。

真实 API key 联调已由用户完成并确认：密钥保存、流式回答、取消与错误提示均正常。评审后复跑：67 项测试通过、typecheck 与 build 通过。

任务关闭。Spec 轴无发现，Plan 六项全部完成，DoD 四项全部勾选。

### 2026-10-03（关于运行时观测的适用范围）

后续排查发现，我的执行沙箱对用户 profile 存在文件系统隔离：同一 %APPDATA%\deriva\deriva-data\deriva.db 路径，我的进程与用户的应用看到的是不同内容（同一时刻我的实例读到 0 个对话，用户应用显示 3 个）。因此本任务 Notes 中所有「运行时库里的键值/表结构」「密钥文件不含明文」之类的观测，只在本侧隔离视图内成立，用于证明代码路径正确，不代表用户真实文件的内容；真实环境的行为以用户截图与联调结论为准。详见 Task 0003 的对应记录。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
