# Task 0003: 实现主对话界面与科目管理

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0003-ground-conversation-ui.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

主对话是树状对话的顶层容器（CONTEXT.md）。本任务覆盖 FR-1（科目管理）、FR-2 的界面部分（连续问答、流式渲染、KaTeX）、FR-10（标题自动生成与重命名）、FR-14（空输入拦截），以及空状态引导。对应 Scenario 1 与 Scenario 7 的界面部分。

## Acceptance Criteria

- [x] 科目可创建、重命名、删除；科目名重名被拒绝并提示（FR-12）
- [x] 左侧列表按科目分组、组内按时间排序展示主对话；主对话可改挂科目；无科目时归入"未分类"
- [x] 主对话内连续多轮问答，Markdown + KaTeX 正确渲染，每条消息显示模型名
- [x] 对话标题默认取首条提问摘要（本地截取），可手动重命名；标题允许重名
- [x] 空输入不可发送；发送中禁止重复提交；无对话时显示引导创建入口
- [x] 应用重启后全部对话完整恢复（FR-9 验证）

## Plan

- [x] 左侧科目/对话列表组件（分组、排序、改挂、CRUD）
- [x] 对话面板组件（消息流、KaTeX/Markdown 渲染、模型 badge）
- [x] 输入框与发送逻辑（空输入拦截、防重复提交）
- [x] 标题自动生成（本地截取首句）与重命名交互
- [x] 空状态与引导页

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0001（数据层）与 Task 0002（问答通道）。

### 2026-10-03

注意：本任务的「Markdown + KaTeX 正确渲染」所需组件已在 Task 0002 的联调修复中提前落地，位于 src/renderer/src/components/MarkdownContent.tsx（含 remark-gfm / remark-math / rehype-katex、KaTeX 字体与样式、单行 `$$...$$` 提升为块级公式、原始 HTML 禁用）。本任务应直接复用该组件，不要另写一套渲染逻辑。

已知待改进（由本任务决定）：流式过程中尚未闭合的数学定界符会被 KaTeX 渲染成错误样式（rehype-katex 内部回退，不会抛错），可考虑「正文随流式更新、公式待段落闭合后再排版」等策略；另外 1.55 MB 的 renderer bundle 若成为问题，可在本任务评估按需加载 KaTeX。

由 Task 0002 评审转交的三条 Note，请在本任务一并决定：

1. 请求未显式设置 `max_tokens` 与 thinking 模式，当前继承 DeepSeek 默认（思考模式开启）：数学推理质量更好但延迟与成本更高，且 `temperature` 在思考模式下无效。本任务需要决定是否在界面上暴露「深度思考」开关；提示词层面的策略由 Task 0010 定。
2. 当系统安全存储不可用时，`apiKeyStore.read()` 返回 null，聊天失败提示会说「尚未配置 API Key」，归因不准。设置面板应能区分「未配置」与「系统密钥库不可用」两种状态。
3. 流式事件目前广播给所有窗口。当前只有一个窗口所以无害，等 SPEC-0002 的悬浮窗出现时需要按窗口路由。

### 2026-10-03

完成 /ad-ground：doc/research/0003-ground-conversation-ui.md（校验 valid: true，A2/B2/C3/D1，6 条 claim）。结论是渲染层沿用本地状态与按需上提：App 只持科目列表、主对话列表与当前选中对话；消息与流式状态放在对话面板内。具名偏离是暂不引入状态管理库（早期路线里提过 Zustand），依据是 React 官方「先本地状态与上提、再考虑 context/reducer 扩展」的顺序与同为 Electron+React 的 Specter-AI 未引入状态库；重新评估触发点写定为 Task 0007 的多栏共享状态。

实现落点：共享层新增 text.ts（summarizeTitle，本地截取标题）并补 5 个写操作 IPC 通道 + listRoots 通道；渲染层拆为 App（外壳与共享状态）、SubjectSidebar（科目分组、对话列表、内联改名与改挂、两步删除确认）、ConversationView（消息流、Markdown+KaTeX、模型 badge、输入与取消）、ConversationPane（容器：加载消息、订阅流式事件、发送/取消/重试、首问自动命名）、SettingsPanel（密钥与模型设置）、lib/grouping.ts（分组纯函数）；样式重写为两栏工作型布局。

顺带修正一处语义错误：此前 IPC 把 listBySubject(null) 映射成 listRoots()（全部根对话），与仓储层「null 表示未分类」的契约冲突。现在拆出独立的 listRoots 通道，listBySubject(null) 恢复为未分类桶。

验证证据：83 项测试通过（新增 3 个文件：summarizeTitle 单测、分组纯函数单测、SubjectSidebar 与 ConversationView 的服务端渲染断言——覆盖按科目分组与未分类、选中态、Markdown 标题与 KaTeX 渲染、模型 badge、空草稿与流式中的禁用、错误与重试入口、无消息时的引导）；typecheck 与 build 通过；dev 自检输出 sidebarMounted:true、groupsRendered:1，说明新外壳已挂载。

FR-9 持久化验证：用一次性写入探针经真实 IPC 创建对话（id 8415bdd9-3020-4b68-aa03-b55ceb5f5d8a），**强杀进程后重启仍能读到该行**（WAL 恢复），随后用删除探针清掉（removed:1, remaining:0），同时验证了删除路径。探针代码与临时脚本已全部移除，源码中无残留。

一处需要用户复核的异常：检查 %APPDATA%\deriva\deriva-data\ 时发现，用户 16:41 的联调会话只写入了 api-key.json（密钥保存成功），**数据库主库与 WAL 中没有任何对话或消息行**（主库时间戳停在 10:56，WAL 大小也未变化），与「看到了 AI 输出」不符。写入路径本身已被探针证明可用且持久，因此原因未定论；请用户在 Task 0003 的新界面上重新走一遍「新建对话 → 提问 → 看着流式回答 → 重启应用确认对话还在」，以确认是否复现。

代码评审尚未进行，故状态保持 in-progress。

### 2026-10-03（异常定位：沙箱文件系统隔离）

上一节记录的「用户联调会话未在数据库留下任何行」经排查**不是产品缺陷**，而是我方执行环境的观测错误。

证据链：用户截图显示应用侧栏有 3 个对话（「什么是张量的CP分解」与两条「流式验证」），当前对话 6 条消息且公式正常排版；同一张截图里 VS Code 终端还留有该次运行打印的自检输出，其中 databasePath 与我读到的路径完全一致（%APPDATA%\deriva\deriva-data\deriva.db）。而我：(1) 对该路径下的 deriva.db 与 deriva.db-wal 做原始字节搜索，找不到这三个标题中的任何一个；(2) 直接运行一次 dev 实例读取同一路径，自检回报 conversationCount:0，用户的应用同时显示 3 个对话。同一绝对路径、两侧内容不同，说明我的沙箱对用户 profile 做了文件系统隔离（也解释了此前读取 api-key.json 报 Access denied、以及递归遍历 C:\Users\night glow 被静默阻断）。

因此：用户数据未丢失；此前基于我侧文件系统的「数据库为空」结论作废。相应地，Task 0001/0002 中关于运行时持久化的观测只能证明代码路径在沙箱视图内自洽，真实环境的持久化由用户截图佐证——两次「流式验证」对话跨越多次应用启动仍然存在，FR-9 由此确认。

副作用与后续做法：我的 dev 运行会写入隔离视图，不会污染用户真实数据（是保护而非风险）；但**任何需要检查用户真实数据的验证都必须由用户执行**，我只能验证代码路径与渲染结果。为便于今后快速判断，dev 自检现在额外输出 conversationCount（本次定位就是靠它）。

同时，用户截图还确认了此前几条只能靠单测支撑的验收：Markdown 标题、KaTeX 公式（SVD、arg max、求和号均正常排版）、模型 badge（deepseek-flash）、已取消状态显示、多轮问答与首问自动命名（「什么是张量的CP分解」即由首问生成）。

### 2026-10-03（代码评审与关闭）

执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-03T19-39-05-task-0003-conversation-ui.md。结论：0 Blocker / 2 Standards Concern / 2 Standards Note / 1 Spec Concern。

当轮修复三条 Concern：

1. ConversationPane 只在终态清了 activeRequest 与 streaming，**从不清 streamingText**，而 reload 会把完整回答作为正式消息加入列表，导致同一段回答渲染两遍（正式消息 + 残留流式块），直到切换对话或重启才消失。改为 reload 落地后清空流式缓冲。
2. App 传入的 onConversationChanged 是内联箭头函数，每次渲染都是新引用，而它是 ConversationPane 订阅副作用的依赖项，导致每次父组件重渲染都退订再订阅。改为 useCallback 固定。
3. FR-12 要求的「重名并提示」此前提示是英文且被 Electron 包了一层，用户看到的是 `Error invoking remote method 'db:subjects:create': Error: Subject name already exists: X`。现在领域错误消息改为中文（「X」已存在、科目名称不能为空、对话标题不能为空、找不到对话（id）、API Key 不能为空），并新增 src/renderer/src/lib/errors.ts 的 toUserMessage 剥掉 Electron 包装前缀，App / ConversationPane / SettingsPanel 统一使用。

两条 Note 转交后续：切换对话时流式请求继续在后台跑（主进程照常落库，回来能看到结果），是否在卸载时取消留给 Task 0007 统一决定；conversations.listBySubject 渲染层暂未使用，保留给树状侧栏与多栏过滤。

评审后复跑：85 项测试通过、typecheck 与 build 通过。本任务 6 条验收标准、5 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
