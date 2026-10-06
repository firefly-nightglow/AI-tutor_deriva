# Task 0006: 实现对话书签

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0006-ground-conversation-bookmarks.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

对话书签（FR-6）解决同一对话内"反复翻看上下文"的问题：每段 AI 输出自动生成书签，竖直排列于面板边缘，点击跳转。摘要生成方式按 OQ-1/OQ-5 决议落入 FR-16：用户可选"本地截取首句"（默认）或"模型生成摘要"（须提示额外 token 消费）。对应 Scenario 5。

## Acceptance Criteria

- [x] 每段 AI 输出自动生成一枚书签，竖直排列于该对话面板边缘；无 AI 输出时书签栏为空不占位
- [x] 点击书签滚动定位到对应段落并高亮
- [x] 设置项可在"本地截取首句 / 模型生成摘要"间切换，选择模型生成时界面明确提示额外 token 消费；默认本地截取
- [x] 书签数据持久化，重启后可用

## Plan

- [x] 书签生成器（本地截取模式）+ 数据层写入
- [x] 模型生成模式（复用 Task 0002 通道）与设置项 UI（含 token 提示）
- [x] 面板边缘书签栏组件 + 滚动定位 + 高亮
- [x] 重启恢复验证

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0003（对话面板）。

### 2026-10-04

完成 /ad-ground：doc/research/0006-ground-conversation-bookmarks.md（校验 valid: true，A1/B1/C2/D1，5 条 claim）。结论：跳转用平台原生 `scrollIntoView({ behavior: 'smooth', block: 'start' })`；不引入 scroll-into-view-if-needed 这类 ponyfill，因为该库自己的说明指出浏览器厂商已把它的能力并入 scrollIntoView 规范，而本项目只发布随包 Chromium，为不存在的差异付依赖不划算。书签的数据结构在 Task 0001 就已具备（summary / summary_source / position + (conversation_id, message_id) 唯一约束），本任务只补写入时机与读接口。

实现落点：

1. shared/text.ts 新增 summarizeBookmark（取首句、剥离标记、超长截断）。同时修正了标题/摘要的兜底：**整段剔除数学公式**而不是只去分隔符——此前 formula-first 的文本会留下 `_j M_ijx_j` 这种 LaTeX 残片；剥完为空则用占位词（新对话 / 未命名要点），绝不回退成原始标记。
2. LlmConfig 增加 summarySource（local 默认 / model），配置读写与校验同步更新；设置面板新增「书签摘要」选择项，模型一项的文案直接写明「每段回答多一次调用，消耗更多 token」（FR-16 要求的提示）。
3. 主进程在回答完成落库后生成书签：默认本地截断；切到模型摘要时复用既有 chat client 让模型给一句话概括，失败则回退本地截断，书签本身不会因此丢失。重试同一助手消息时走 updateSummary 覆盖旧摘要，不会留下过期标签。生成失败只记日志，不影响回答与落库。
4. 渲染层：ConversationPane 并行读取消息与书签；ConversationView 在面板右缘渲染书签栏（无书签时不渲染、不占位），点击用 scrollIntoView 平滑滚到对应消息并高亮 1.6 秒；消息节点复用 Task 0004 的 data-message-id 作为定位锚点。新增 `bookmarks:listByConversation` IPC 与 preload 契约。

验证：129 项测试通过。新增用例覆盖——summarizeBookmark 取首句、剥离公式、超长截断与空输入占位；回答完成后恰好生成一枚书签且 messageId/summary/summarySource 正确；书签栏按 position 渲染两条条目；点击条目调用带 smooth/start 选项的 scrollIntoView 并把对应消息标记为 is-highlighted。typecheck 与 build 通过，dev 启动自检正常。

未自动验证：模型摘要模式下的一次额外调用（需要真实 API key，属联调范畴）；书签栏在真实长会话中的观感（GROUND-0006 的 Limitations 已记录溢出与分组的评估触发点）。

### 2026-10-04（代码评审与关闭）

执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-04T11-11-45-task-0006-bookmarks.md。结论：0 Blocker / 1 Standards Concern / 3 Standards Note / 2 Spec Concern。

当轮修复：

1. **done 事件被书签生成推迟**（Concern）：此前先生成书签再发 done，默认本地截断无感，但切到模型摘要时每段回答都要多等一次完整模型往返，期间界面仍显示「生成中」且发送被锁。改为先发 done、再生成书签（请求在两者都结束前仍计为活跃，因此 answer 一完成输入框就解锁，书签稍后落库）。
2. **FR-16 的 token 提示藏在下拉选项里**（Concern）：现在选中「模型生成摘要」时，下拉框下方出现常驻提示，说明会额外调用一次模型、消耗更多 token、失败自动回退本地。

一条 Spec Concern 落成明文产品决策：**只有完成的回答才生成书签**，取消或失败的半截回答不生成——理由是针对学生没读完的半截文本做导航锚点没有意义，摘要也会误导。这条写进 Notes 以免日后被当成疏漏；用户若想要「中断也留书签」，说一声即可反转。

三条 Note 保持记录：书签 position 在创建时计算，将来若支持删除单条消息需要重排；书签栏没有 scroll-spy（FR-6 只要求点击跳转）；书签栏固定 156px，Task 0007 开三栏时需要决定窄栏形态。

用户已实操确认书签验证通过。评审后复跑：129 项测试通过、typecheck 与 build 通过。4 条验收标准、4 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
