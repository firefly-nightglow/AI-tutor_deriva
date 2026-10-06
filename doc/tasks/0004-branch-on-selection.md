# Task 0004: 实现选中内容开子对话与多层嵌套

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0004-ground-branch-on-selection.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

选中 AI 输出内容发起追问是本产品的核心交互（FR-3、FR-4），直接解决"追问与原回答逻辑关系丢失"的痛点。上下文策略按 OQ-2 决议：默认仅携带被选片段 + 用户问题，"携带完整对话链"作为设置项。对应 Scenario 2、3。

## Acceptance Criteria

- [x] 鼠标或触屏选中 AI 输出文本后浮出"追问"入口（触控热区 >= 44px，NFR-5）
- [x] 确认追问后创建子对话：被选片段以引用块置顶（跨段落、含公式时保留原始 Markdown/LaTeX 源码），并随提问发送给模型
- [x] 子对话可无限嵌套，5 层深度内创建、问答、回看全部正常
- [x] 设置项可切换上下文策略：仅被选片段（默认）/ 完整对话链
- [x] 子对话与父节点的引用关系持久化，重启后完整恢复

## Plan

- [x] 文本选中检测与浮动"追问"按钮组件（含触屏支持）
- [x] 子对话创建流程（引用块、上下文组装策略、数据层写入）
- [x] 上下文策略设置项（默认片段 / 完整链）
- [x] 5 层嵌套的端到端手动验证

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0003（对话面板）。

### 2026-10-03

完成 /ad-ground：doc/research/0004-ground-branch-on-selection.md（校验 valid: true，A2/B3/C2/D1，6 条 claim）。结论：用 Selection API 做选中检测、Range.getBoundingClientRect 定位浮动按钮；引用文本不取渲染后的可见字符，而是用 remark 插件给块级元素写上源码偏移（node.data.hProperties 是 mdast-util-to-hast 官方支持的附加属性机制），选中后按偏移从原始 Markdown 切片，保证公式拿到完整 LaTeX。具名偏离：引用粒度是块级而非精确字符级——KaTeX 渲染输出内部没有源码偏移，做字符级映射要改动它的 DOM 且容易切出半个 $$；块级粒度牺牲一点精确度换取引用永远语法完整。

实现落点：数据层新增迁移 2（conversations.source_quote）、Conversation 的 sourceQuote 字段、仓储的引用校验与 listAll；上下文新增 createBranchAnchorBlock 与 createConversationHistoryBlockWithParentChain，LlmConfig 增加 contextStrategy（excerpt 默认 / full-chain）；渲染层新增 remarkSourceOffsets 标注、lib/selection.ts、选中即浮出的「追问」按钮（44px 热区）、引用块置顶、消息元素 data-message-id、侧栏按 depth 缩进的树形渲染、设置面板的上下文策略选择；App 负责以 parentConversationId + sourceMessageId + sourceQuote 创建子对话并切换过去。

验证证据：93 项测试通过（新增 schema 断言 source_quote 列、仓储断言引用 trim 落库与空白引用被拒、上下文断言分支注入引用块且只有 full-chain 才前置祖先消息、分组断言三级嵌套 depth 为 0/1/2、渲染断言引用块在消息区之前且公式被排版、MarkdownContent 断言偏移能切回原始 Markdown）；typecheck 与 build 通过；dev 启动自检正常，隔离视图内 user_version=2 且 conversations 含 source_quote。

尚未自动验证的两条：**选中文本浮出追问入口** 与 **5 层嵌套的创建与回看**。原因是选区与浮动定位依赖真实 DOM 与鼠标/触屏事件，当前测试环境是 node（未引入 jsdom 与 testing-library），自动化只能覆盖到「偏移标注正确」与「引用块渲染正确」这一层；若要自动化这两条，需补 jsdom + @testing-library/react 两个开发依赖。

已知取舍：引用为块级粒度（只选一句话会带入整段，理由见 ground 记录）；侧栏缩进视觉封顶在第 5 层，更深的层级仍以角标显示，完整的树状侧栏行为（虚拟化与性能）仍归 Task 0005。

代码评审尚未进行，状态保持 in-progress。

### 2026-10-03（用户实测反馈：选中与追问失效）

用户实操反馈两个问题，均已定位到根因并修复（截图位于 异常复核\task 0004）。

**问题一：公式选取不灵敏、引用内容错位成乱码。** 根因是**偏移基准不一致**：为了让单行 `$$...$$` 渲染成块级公式，MarkdownContent 会先把源码做一次规范化（在 `$$` 前后插入换行），而解析与偏移标注针对的是规范化后的字符串；但切片引用时用的却是原始 `message.content`。每提升一次单行公式，其后所有偏移就漂移 2 个字符，于是用户选中的整段"例如固定 B, C 时，+ 完整公式"被切成了 `CS 时,` 和只剩 `A =` 的公式残片。修复：新增 `markdownSource()` 作为"偏移所指的那份源码"的唯一出口，渲染与切片都走它；并补测试断言规范化后切片能取回完整段落。

**问题二：明明没选中也可能弹出按钮。** 根因是判定只看了 `rangeCount`，没有排除**折叠选区**——单击会留下一个折叠 range（且上一轮选区可能仍在），路径照样通过。修复：要求 `!selection.isCollapsed` 且 `selectionText(selection) !== ''`。

**问题三（由测试新发现）：选中公式时按钮完全不出现。** 我补的 jsdom 交互测试立刻复现：mdast-util-math 把块级公式生成为 `<pre data-source-*> <code class="math-display">`，而 rehype-katex 会把整棵子树替换掉，偏移随 `pre` 一起消失，选区向上找不到任何带偏移的祖先。修复：新增 rehype 插件 `rehypeWrapMathBlocks`，在 rehype-katex 之前给携带偏移的 `pre` 套一层 `div[data-source-*]`，让偏移在被替换后仍然存活。

**问题四（公式选区乱码）：** KaTeX 同时输出无障碍用的 MathML 层与视觉 HTML 层，两层都可被选中，拖选时会交错复制出乱码。修复：`.katex .katex-mathml { user-select: none }`，保留无障碍语义但不参与选区。

**UI 打磨（按用户建议）：** 追问按钮改为圆角矩形（8px，不再是椭圆），默认浅蓝、hover 加深并上浮 2px、按下更深；位置改为贴在选区**右端外侧 12px**，并对窗口右边界做钳制，不再压住被选文字；保持 44px 最小热区（NFR-5）。

**新增开发依赖**（经用户同意）：jsdom 30.1.1、@testing-library/react 16.3.3、@testing-library/dom 10.4.2。新增 `ConversationView.selection.test.tsx`（jsdom 环境），三个用例覆盖：公式后段落的引用不漂移、折叠选区与无选区都不弹按钮、选中块级公式能取到完整 LaTeX 源码。这把此前只能靠人工的两条验收变成了可回归的自动化用例。

**黑夜模式（用户追加需求）：** 已实现。styles.css 全量改为设计令牌（`--bg/--surface/--text/--accent/...`），浅色为默认，深色通过 `:root[data-theme='dark']` 与 `@media (prefers-color-scheme: dark)` 两处提供；设置面板新增"外观：跟随系统 / 浅色 / 深色"，选择写入 localStorage；主进程用 `nativeTheme.shouldUseDarkColors` 设置 BrowserWindow 的 backgroundColor，避免深色下启动白闪。影响面：属于纯表现层改动，不涉及 IPC 与数据层；KaTeX 用 currentColor 自动适配；`color-scheme` 让 select/textarea/滚动条跟随主题。维护约束写在 styles.css 顶部：新组件必须引用令牌而不是写死颜色。

修复后：102 项测试通过（新增 3 个选中交互用例与 5 个主题用例）、typecheck 与 build 通过、dev 启动自检正常。

验收状态更新：第 1 条（选中浮出追问入口）已由 jsdom 交互测试覆盖，勾选；第 3 条（5 层嵌套的创建与回看）仍待用户实操确认。

### 2026-10-04（标题乱码、草稿保存、图片输入）

**标题乱码修复。** 用户反馈：选中公式追问后，新标题在正式生成前显示为原始 LaTeX（截图里是 `$$ A = X_{(!)}(C\odot B)...`），但引用块本身正常。根因是子对话标题由 `summarizeTitle(quote)` 从 **Markdown/LaTeX 源码**派生，源码里自然带着 `$$`、`\sum`、`\odot`。修法：追问按钮现在把**可见文本**（`selectionText`，即学生看到的那串符号）一并传给 App，标题优先用它；`summarizeTitle` 同时加了兜底，会把残留的 `$`、反斜杠命令与花括号去掉，避免只有源码可用时又出现 LaTeX 噪声。引用块仍保存原始源码，两者各取所需。

**草稿保存（用户建议 1）。** 新增 src/renderer/src/lib/drafts.ts：按对话 id 把未发送的输入存进 localStorage（清空即删除条目，storage 不可用时静默降级）。ConversationView 初始值从草稿读取、每次输入即写入、发送后清空。因为面板按对话 id 重新挂载，切走再切回即可恢复原样，重启应用同样保留。

**图片输入（用户建议 2）。** 端到端实现：

1. 输入框支持粘贴（Ctrl+V，只在剪贴板含图片时拦截）与「图片」按钮选择文件，最多 4 张，带缩略图与移除；只挂图片时也可发送（此时正文可以为空）。
2. 主进程新增 src/main/attachments.ts：图片以文件形式落在 userData 下的 deriva-data\attachments\（`<uuid>.<ext>`），消息行只存元数据 JSON（id/name/mime/bytes）。校验白名单 MIME 与 4 MB 上限，拒绝空内容；新增 `attachments:read` IPC 供渲染层按 id 取回 data URL 显示。
3. 消息线上格式按 DeepSeek 官方 API 参考实现：带图消息的 `content` 变成内容数组 `[{type:'text',text}, {type:'image_url',image_url:{url,detail:'high'}}]`（官方明确支持 base64 data URL，格式限 JPEG/PNG/GIF/WebP，与本项目白名单一致）；正文为空时不发空的 text 部分。`detail` 显式取 `high`：这些图通常是公式或教材页，默认降采样到 512×512 会让符号不可读。
4. 上下文管线：历史 block 现在会读回消息上的附件并转成 data URL 一起带上，因此带图提问在后续轮次与子对话里依然能被模型看到（受上下文策略影响的是「带不带祖先对话」，不是「带不带图片」）。
5. 附件目录与数据库同处 userData，卸载重装不会混入仓库；消息删除时附件文件暂时保留（清理策略留给后续任务，已在 Notes 记录）。

验证：113 项测试通过（新增附件存储 3 项、附件解析 2 项、图片内容部件 1 项；另有草稿 3 项与主题 5 项来自同日早些时候），typecheck 与 build 通过，dev 启动自检正常。

用户已确认：五层嵌套与选中追问的问题均验证通过。

### 2026-10-04（代码评审与关闭）

执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-04T02-48-39-task-0004-selection-branch-attachments.md。结论：0 Blocker / 2 Standards Concern / 3 Standards Note / 2 Spec Note。

当轮处理：

1. **附件文件从不清理**（Concern，已修）：AttachmentStore 新增 removeAll(ids)，删除对话的处理改为先收集整棵子树内所有消息引用的附件 id，删完行再删文件；补单测（删两张中的一张，断言另一张仍在）。
2. **历史图片每轮重发**（Concern，转为开放决策）：带图消息会连同 base64 与 detail:high 在每一轮请求中重发，多图对话的成本与上下文占用会累积。策略（只带本轮 / 只带最近 N 张 / 保持现状）留到 v2 屏幕截图共用这条管线时一并决定，此处记录以免遗忘。
3. 超过 4 张图片此前静默丢弃（Note，已修）：输入框现在提示「一条消息最多 4 张图片」并说明忽略了几张。
4. 另两条 Note 保持记录：图片写盘发生在消息插入之前，插入失败会留孤儿文件（当前唯一可达的失败是对话不存在，而该分支在落盘前就会抛错）；窗口底色取自系统主题而应用可显式钉住主题，浅色系统上选深色启动仍会闪一下浅色。

两条 Spec Note 属信息性：块级引用粒度是 GROUND-0004 具名记录的取舍；图片输入复用 ADR-0004 为 v2 预留的 attachments 字段。

评审后复跑：114 项测试通过、typecheck 与 build 通过。5 条验收标准、4 条计划项、4 条 DoD 全部勾选，任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
