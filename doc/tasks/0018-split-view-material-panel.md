# Task 0018: 窗口级分屏与内嵌资料面板

**Status:** `done`
**Created:** `2026-10-17`
**Scope ref:** `doc/specs/0003-floating-window-split.md`
**Evidence ref:** `doc/research/0013-ground-split-material-panel.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0003-floating-window-split.md`
**Board ref:** ``

## Context

SPEC-0003 Scenario 3/5 与 FR-4/FR-5/FR-8/FR-10 要求把用户最初提出的“一边看 AI 输出，一边读文献、代码、网页、视频”落实为 Deriva 内嵌资料面板 + AI 对话面板的窗口级分屏。这里不控制其他软件窗口，而是在 Deriva 内提供一个受控的 WebContentsView 资料面板；加载失败不能影响对话侧，面板内容也必须遵守现有 Electron 安全边界。

2026-10-18 悬浮窗形态修订后，资料面板需要同时支持两种布局：普通窗口左右分屏；悬浮抽屉纵向堆叠（资料在上、对话在下），默认关闭。主进程仍通过 React 槽位同步 bounds，不按模式复制两套捕获逻辑。

## Acceptance Criteria

- [x] 用户可打开/关闭窗口级分屏；资料面板与 AI 对话面板同屏显示，两侧独立滚动，比例可拖拽调整
- [x] 普通窗口默认左右分屏；悬浮抽屉中资料面板默认关闭，打开后纵向堆叠（资料在上、对话在下），比例可拖拽调整
- [x] 资料面板至少可加载网页 URL；本地 PDF、代码与视频的支持矩阵由 `/ad-ground` 决定并记录
- [x] 外部链接交给系统浏览器；资料面板中的外部内容不能访问未经 bridge 的 Node 能力、本地文件或 IPC
- [x] 网页、文件或视频加载失败时显示失败原因、重试和关闭入口，AI 对话面板保持可用
- [x] 分屏开关与面板比例本地持久化；重启后恢复到合法显示器范围，面板损坏时退回普通窗口
- [x] 分屏下仍保留 SPEC-0001 的树状侧栏、书签、链路图、多面板、删除确认和设置入口；空间不足时可折叠但不丢失入口
- [x] 用户实操确认：在资料面板中阅读网页或文献，与另一侧 AI 对话同时滚动、切换比例并继续树状问答

## Plan

- [x] `/ad-ground`：确认 WebContentsView/BrowserView 方案、网页安全隔离、本地 PDF/代码/视频支持矩阵
- [x] 实现分屏布局、资料面板 WebContentsView 与对话面板并排承载
- [x] 支持普通模式横向槽位与悬浮模式纵向槽位，模式切换时同步更新 view bounds
- [x] 实现比例拖拽、面板开关、空间不足折叠与响应式最小宽度
- [x] 实现 URL 加载、外部链接策略、失败/重试/关闭降级
- [x] 实现分屏与比例持久化和显示器越界恢复
- [x] 补单元测试
- [x] 完成 HITL 验收

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-17

任务创建，来源 SPEC-0003 拆解（Scenario 3/5，FR-4/FR-5/FR-8/FR-10，NFR-3/NFR-4）。此任务先交付可见的资料面板；内部截图接线由 Task 0019 完成。本地 PDF/代码/视频支持优先级在 `/ad-ground` 决定。

`/ad-ground` 完成，记录：`doc/research/0013-ground-split-material-panel.md`（valid: true，Confidence: Conditional）。结论：保留现有 BrowserWindow 作为对话宿主，叠加一个 WebContentsView 资料面板，React 预留布局槽并同步 bounds；资料 view 使用独立 session、sandbox、contextIsolation、无业务 preload，并限制 will-navigate/setWindowOpenHandler/权限；URL 优先，本地 PDF/代码/视频通过 `deriva-material://` 协议前先做小 spike 验证 MIME/播放行为，失败则降级而不影响对话。

### 2026-10-18

SPEC-0003 修订后补充布局约束：普通窗口继续左右分屏；悬浮抽屉使用纵向堆叠（资料在上、对话在下），资料面板默认关闭，打开时对话区保留最小可用高度。WebContentsView 仍由 React 槽位驱动 bounds，主进程只负责按当前布局槽位定位与捕获。

### 2026-10-18

实现完成，状态置为 in-progress，等待 HITL。落地：

1. `src/main/material/panel.ts`：独立 `WebContentsView`、`persist:deriva-material` session、sandbox/contextIsolation/无 Node/无业务 preload；权限全拒绝；`window.open` 外链交给系统浏览器；URL 导航、前进/后退/刷新/停止、失败/崩溃状态、重试与关闭、可见性控制。
2. `src/main/material/protocol.ts`：`deriva-material://` 显式允许列表 + 本地文件选择器；PDF/代码/图片/视频/音频 MIME；Range 请求；允许列表持久化到 `deriva-data/material-files.json`；协议注册在资料面板自己的 session 上。
3. `src/renderer/.../MaterialPanel.tsx` + `App.tsx` + CSS：普通窗口横向分屏、悬浮抽屉纵向分屏；URL 栏、文件、前进/后退/刷新/关闭；比例拖动与按模式持久化；侧栏浮层打开时临时隐藏原生 view，避免原生层遮挡。
4. `materialPrefs.ts`：分屏开关、URL、显示标签、普通/悬浮比例本地持久化；重启恢复。

验证：

- `npm test`：45 个文件、225 项测试通过；`npm run typecheck`、`npm run build` 通过。
- 运行时 CDP：example.com 在资料 view 中加载；无效域名显示错误覆盖层并可恢复到 example.com；本地文本文件经 `deriva-material://` 加载，内容与 `text/plain` 正确；资料 view 内 `require`/`window.api`/`process` 均为 undefined；普通模式横向、悬浮模式纵向分屏；比例拖动从 0.5 到 0.5625 并持久化；重启后分屏开关与 URL 恢复。
- 修复：协议最初注册在默认 session，导致独立 session 的 `deriva-material://` 返回 ERR_FAILED；已改为注册到资料面板 session。

待 HITL：真实 PDF/视频播放、登录/Cookie 场景、`window.open` 外链、触屏分屏拖动、分屏下多对话面板与书签操作、用户验收。

### 2026-10-18 — 实机问题修复

用户反馈资料无法逐项移除、PDF 太小、超宽网页裁切、Markdown 原样显示和网页卡顿。截图中 Markdown 中文可读，但标记与 LaTeX 没有解析；原实现只有单个资料 view 和导航历史，没有独立资料列表，关闭面板仍保留最后 URL。

诊断假设与结果：

1. 资料持久化保留了关闭前 URL，缺乏移除操作（确认）：增加已打开资料列表、切换与移除当前资料；移除后持久化剩余列表，最后一项移除后保存空地址。重建原生 view 清空历史，避免后退恢复已移除资料；磁盘原文件不删除。
2. 普通网页缩放能直接缩放 PDF（否定）：Electron `setZoomFactor` 数值变化但 PDF 正文截图不变。单独通过受信任 Chromium PDF 查看器的缩放输入框操作，限制在初始大小的 100%–300%，保持当前页；网页和普通文件继续使用 Electron 缩放。
3. 网页自身隐藏横向溢出导致裁切（测试页确认）：只对 HTTP(S) 页面注入 html/body 横向溢出规则，保留页面内容宽度并显示原生横向滚动条。
4. Markdown 被 `text/plain` 原样返回（确认）：通过现有 ReactMarkdown/GFM/math 解析链生成隔离 HTML，KaTeX 输出原生 MathML，离线可读，无业务 bridge、脚本和外部资源权限；文本识别 UTF-8、带 BOM 的 UTF-16、GB18030 回退。
5. 重复尺寸和状态同步增加渲染开销（确认有冗余调用）：原生 bounds、可见性、状态通知去重；ResizeObserver 不再因每次拖动比例变化重新注册；地址编辑不逐字写 localStorage。该测量不证明第三方直播网站自身的播放/网络卡顿已全部解决，仍需原站实机反馈。

验证：资料与存档回归、界面移除与缩放边界回归；`scripts/material-panel-smoke.ts` 在独立 `node_modules/.cache/deriva-material-smoke` 配置运行，不修改用户数据库或资料允许列表。实际 Electron 检查：1400px 宽网页在 500px 槽中横移 300px；100 次相同 bounds 更新触发 0 次额外原生 setBounds；Markdown 中文与 MathML 渲染，Node/业务 bridge 不可访问；双页 PDF 在第 2 页从内置 60% 放大到 90%（相对 150%）再恢复 60%，仍停留第 2 页。已检查单页 PDF 缩放前后和 Markdown 截图；双页复测以 DOM/原生控件断言为准，测试截图按 `DERIVA_SMOKE_CAPTURE=1` 可选开启。

PDF 缩放适配依赖当前 Electron 39 的 Chromium 内置查看器 DOM；升级 Electron 时应重跑上述 smoke。适配器仅处理同一独立 session、固定内置扩展 URL、原文档 URL 匹配的查看器；控件不匹配时显示错误，保留 PDF 自身缩放入口。

最终检查：`npm test` 46 个文件、232 项通过；`npm run build`（包含 Node/Web 两侧 typecheck）通过；`git diff --check` 无空白错误。仍为 in-progress，等待本轮用户验收与后续代码评审。

### 2026-10-19 — 超宽网页与空白打开

用户确认大部分验收通过，补充两项要求：极宽网页可在不增加持续开销的前提下改善显示；资料面板每次打开不再恢复上一次未关闭的资料。

回归先复现：旧存储读取会返回 `https://old.test/` 而非空地址；实际 Electron 对网页请求 50% 缩放仍被钳制到 100%。截图中的水平滚动条已存在，排查优先级为固定宽度居中布局、100% 缩放下限、原生槽位裁切。固定宽度居中测试页进一步复现左边缘为负、水平滚动不能找回左侧内容；缩小后整个布局进入视口，无需修改网站内部组件。

修改：网页支持 25%–300% 原生缩放；PDF（包括通过 HTTP 打开的 PDF）与本地文件保留初始大小的 100% 下限。加载 DOM 就绪后识别缩放边界，不等待直播页的所有子资源结束。无轮询、额外窗口或播放器改写；缩放仅由用户操作触发。`readMaterialPrefs` 忽略旧 URL/标签/资料列表，`saveMaterialPrefs` 只写开关和比例；关闭再打开清空本次资料，挂载时清理旧偏好中的资料字段。本次打开期间仍可切换、移除多份资料，磁盘原文件不删除。SPEC-0003 FR-7 同步明确资料不恢复规则。

验证：单元/界面回归覆盖旧偏好迁移、只持久化布局、关闭重开为空、资料切换/移除及网页缩小边界；独立 Electron 测试中，500px 槽位的 1400px 居中网页缩到 25% 后，CSS 视口宽 2000px，内容左右边缘位于 300px/1700px，均可见。原生重复 bounds 去重仍有效；Markdown 与第 2 页 PDF 放大恢复回归通过，PDF 请求 50% 仍保持初始大小。隔离配置实际打开同一 B 站页面：标题为“2026KPL年总”，缩放前视口 500px、内容宽 1280px；缩至 25% 后视口 2000px、内容宽 1938px。该测量仅验证页面布局，未验证本次直播播放（测量时未发现 video 元素）。具体网站的缩放比例由用户按阅读需求选择，不承诺任意网页自动适应。

最终检查：`npm test` 46 个文件、235 项通过；`npm run build`（包含 typecheck）通过；`git diff --check` 无空白错误。仍为 in-progress，等待本轮实机验收与后续评审。

### 2026-10-19 — 评审收尾

用户确认本轮全部验收通过。按 task 范围执行单会话双轴评审，记录位于 `.agentic/reviews/2026-10-19-task-0018-material-panel.md`。发现并修复两项：跨站普通链接绕过系统浏览器策略（保留同站导航与显式地址栏加载）；原生 view 可能遮挡 DOM 模态弹窗（存在模态层时隐藏原生 view，关闭后恢复）。两条回归测试先失败后通过。复查后无未解决 Blocker/Concern；PDF 查看器私有控件适配的升级风险继续按既有 smoke 管理。

复验：全量 47 个文件、237 项测试通过；`npm run build`（含 typecheck）通过；隔离 Electron smoke 的网页横向滚动/25% 缩放、重复 bounds 去重、Markdown 中文/公式/隔离、PDF 第 2 页缩放与恢复全部通过。Task 0018 置 done；内部截图接线进入 Task 0019，不提前计入本任务。

### 2026-10-19 — 触控热区复查

追加规格轴复核发现资料工具栏按钮原为 28–40px，不满足 SPEC-0003 NFR-5 的 44px 热区约束。按钮、地址输入与资料选择控件已统一至少 44px；触屏设备通过 any-pointer:coarse 把分屏拖动条槽位扩至 44px，保留细线外观。完整应用隔离 smoke 新增普通/悬浮两种布局的实际按钮尺寸断言。此项作为第三个已修复规格阻塞记录，不以用户先前验收掩盖规格差异。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
