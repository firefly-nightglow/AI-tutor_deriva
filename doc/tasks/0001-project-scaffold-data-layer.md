# Task 0001: 搭建项目脚手架与 SQLite 数据层

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0001-ground-electron-sqlite-scaffold.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

SPEC-0001 的全部功能都建立在两个地基上：可运行的 Electron + React + TypeScript + Vite 工程，以及承载科目、对话树、消息、书签的 SQLite 数据层（NFR-1）。这是树状对话任务链的第一个任务，后续 0002-0010 全部依赖它。

## Acceptance Criteria

- [x] `npm run dev` 可启动 Electron 窗口并渲染 React 占位页面
- [x] SQLite 数据库文件在用户数据目录自动创建，包含 subjects、conversations、messages、bookmarks 四张表，messages 以 parent_id 构成树
- [x] 数据层提供类型安全的 CRUD 接口（创建/读取/更新/删除科目、对话、消息、书签），并有单元测试覆盖
- [x] 单条消息写入耗时测试通过（普通笔记本 < 50ms，NFR-1）
- [x] 级联删除在数据库层可用（删除节点时其子树一并删除，供 FR-11 使用）
- [x] messages 表包含 content_type（默认 text）与 attachments（JSON，默认可为空）两个字段，为 v2 截图消息与 v3 特殊内容预留（ADR-0004）
- [x] 主进程按模块划分目录：db / llm / capture / session，其中 capture 与 session 本任务仅建占位空模块（ADR-0004）

## Plan

- [x] electron-vite 脚手架初始化（Electron + React + TS），目录约定 src/main、src/preload、src/renderer
- [x] 接入 better-sqlite3，编写 schema 迁移机制与四张表
- [x] 编写数据层模块 src/main/db/（CRUD + 树查询 + 级联删除）
- [x] 编写数据层单元测试（含树查询、级联删除、写入耗时断言）
- [x] IPC 通道定义（preload 暴露类型安全 API 给渲染进程）
- [x] messages 表加入 content_type 与 attachments 预留字段
- [x] 主进程建立 capture 与 session 占位模块目录

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。

### 2026-10-02

按 ADR-0004 追加 v2/v3 扩展点预留：messages 表 content_type/attachments 字段、主进程 capture/session 占位模块。

### 2026-10-02

完成 /ad-ground 四源调研，证据记录 doc/research/0001-ground-electron-sqlite-scaffold.md（校验 valid: true，A8/B2/C1/D1）。结论：采用 electron-vite 官方 react-ts 模板骨架，better-sqlite3 置 dependencies，userData 下建库，foreign_keys + WAL + user_version 迁移。

### 2026-10-02

实现完成度：脚手架、数据层、IPC、占位模块均已落地。`npm run typecheck`（node + web）通过；`npm run build` 产出 out/main、out/preload、out/renderer 三份产物；`npx vitest run` 17 项测试全部通过，覆盖 CRUD、5 层嵌套树、级联删除、外键开关、user_version、WAL 文件库重开、写入耗时 < 50ms。

实施期发现并修订了一处调研结论（已回写证据记录 E10）：better-sqlite3 13.0.3 分发的是按平台命名的 Node-API 预编译产物（prebuilds/win32-x64.node），Node 与 Electron 共用同一份二进制，因此 package.json 不再需要 `postinstall: electron-builder install-app-deps`，调研时担心的双 ABI 冲突不成立；asarUnpack 保留。

待验证项：`npm run dev` 启动 Electron 窗口、以及运行时在 userData 下自动建库。阻塞原因是 Electron 二进制（130MB）下载极慢（单连接约 22 KB/s），已改为 8 分片并行下载。

### 2026-10-03

Electron 二进制安装完成。过程：官方源与镜像单连接约 20-40 KB/s，curl 的 `--retry` 会截断 `-o` 目标文件导致重试丢进度，故改为分片下载 + 逐片长度校验 + 临时文件改名落盘；8 片拼接后 SHA-256 为 4478410a35a8399b7745085096695a37877f176755182a71e27eddc245cd98d5，与 node_modules/electron/checksums.json 中 electron-v39.8.10-win32-x64.zip 的官方值一致。解压到 node_modules/electron/dist 并写入 path.txt 后，install.js 的 isInstalled 判定为 true（后续 npm install 不会重复下载），`electron --version` 输出 v39.8.10。

窗口验收：`npm run dev` 成功，main/preload 构建通过、renderer dev server 起在 5173、Electron 主进程与渲染进程均正常；运行后 %APPDATA%\ai-tutor\ai-tutor-data\ 下自动生成 ai-tutor.db（含 -wal/-shm 边车文件）。以只读方式打开该运行时库核对：user_version=1、journal_mode=wal、foreign_keys=1、四张表齐全、messages 含 content_type 与 attachments。

渲染验收：为排除"窗口开着但页面空白"的可能，在 main/index.ts 增加仅 dev 生效的一次性自检（did-finish-load 后读取 h1 文本与 preload 桥接是否可达）。实测输出 `{"heading":"AI Tutor","hasBridge":true}`，确认 React 已挂载且 contextBridge 生效。

剩余 DoD 项：代码评审（WORKFLOW §10）尚未进行，故任务状态停在 in-progress；本地测试（17 项）与 typecheck 全部通过，源码无遗留 TODO/FIXME。

### 2026-10-03

产品定名 Deriva。落点：package.json 的 name/description/author 改为 deriva，build.productName 与 appId 改为 Deriva / com.deriva.app；main/index.ts 的 userData 子目录与库文件名改为 deriva-data / deriva.db，dev 自检日志前缀改为 [deriva]；renderer 标题与 h1 改为 Deriva；README、CONTEXT.md、PRD 同步。ADR-0001 与 ground 记录中的旧称、以及本文件此前的历史日志条目按决策记录纪律保持原样，不改写。改名后重跑：新库建于 %APPDATA%\deriva\deriva-data\deriva.db，dev 自检输出 {"heading":"Deriva","hasBridge":true}。

代码评审：执行 /ad-review 单次双轴评审，留痕 .agentic/reviews/2026-10-03T10-58-49-task-0001-scaffold-data-layer.md。结论 0 Blocker / 3 Standards Concern / 1 Spec Concern，无阻塞项。

评审发现与处置（同轮修复）：

1. conversations.listTree 的递归查询没有排序，兄弟分支顺序未定义 —— 改为 ORDER BY created_at ASC, rowid ASC，并补两个以上兄弟节点的顺序断言。
2. CSP 未声明 script-src，dev 下 Vite 注入的 React Fast Refresh 内联脚本被拦截 —— 在 electron.vite.config.ts 加仅 serve 生效的 transformIndexHtml 放宽 script-src，打包产物仍保留 index.html 中的严格 CSP（已核对 out/renderer/index.html 未放宽）。
3. 科目名未在 IPC 侧校验，空白名可入库 —— 校验下沉到仓储层（trim、拒绝空串、抛 ValidationError），create 与 rename 共用，并补测试。
4. bookmarks 缺更新路径，与任务要求的四类实体 CRUD 不符 —— 新增 updateSummary(id, summary, summarySource)，供 FR-16 切换摘要来源时复用，并补测试。
5. sandbox: false 关闭了渲染进程沙箱 —— 改为 sandbox: true，同时移除未被使用的 @electron-toolkit/preload 暴露面（preload 仅保留类型化的 window.api，打包产物只 require("electron")）；dev 实测自检仍通过，说明沙箱下 preload 正常。
6. dev 自检的 executeJavaScript 未捕获异常 —— 补 try/catch。
7. 写入耗时断言此前只测内存库 —— 在文件库（WAL）测试中补同样的 < 50ms 断言。

未修复、留作后续（Note 级）：仓库暂无 lint 脚本与 ESLint 配置，风格漂移不受约束；建议在 UI 任务开始前补上。

评审保真度说明：这是 ad-review 在 Codex 上的默认单次双轴形态，不是真正 fresh-context 评审。本次无 Standards 发现触及 AGENTS/ARCHITECTURE/CONTEXT/ADR 等约束性文档，未触发升级建议；留痕文件已落盘，如需 §10 理想形态可据此显式派生评审 subagent。

最终状态：20 项测试通过，typecheck（node + web）通过，build 产出 main/preload/renderer，dev 启动并可渲染。任务关闭。

### 2026-10-03（fresh-context 复核）

按 ad-review 的升级路径显式派生 fresh-context 评审 subagent 复核（输入为留痕文件 .agentic/reviews/2026-10-03T10-58-49-task-0001-scaffold-data-layer.md，刻意不给它本会话上下文）。结论：0 Blocker / 3 Standards Concern / 0 Spec Finding。

三条 Concern 与处置：

1. messages.parent_id 只保证被引用消息存在，不保证同属一个对话；bookmarks 的 conversation_id 与 message_id 可以是错配组合；conversations.source_message_id 也可以指向父对话之外的消息 —— 改为在仓储写入路径校验跨实体不变量：messages.append 要求父消息属于同一对话，bookmarks.create 要求消息属于同一对话，conversations.create 要求引用的消息存在且属于声明的父对话，并各补一条否定用例。复合外键需要重建表（SQLite 不能直接加约束），留待有真实数据前的后续迁移，不在本次引入。
2. conversations.create 直接转发渲染进程输入（空标题、不存在的 subject/parent、非法 titleSource）—— 在仓储层补校验：标题 trim 后非空、titleSource 必须在枚举内、subject 与 parent 必须存在，并补测试。
3. listChildren 与 messages 的子消息查询只按 created_at 排序，同毫秒兄弟节点顺序不确定 —— 与 listTree 一致补 rowid 并列项（另将 listRoots/listBySubject 改为 updated_at DESC, rowid DESC），补三分支顺序断言。

三条 Note 与处置：llm 模块当时只有空占位（已在 Task 0002 中实现真正的 context block 管线）；dev 自检只验证 window.api 存在（已扩展为实际调用 databasePath() 与 llm.keyStatus()，并回报 hasLlmBridge）；shell.openExternal 未做协议白名单且未处理 rejection（已限制为 http(s) 并捕获失败）。

复核后复跑：61 项测试通过、typecheck 与 build 通过、dev 启动自检回报 hasBridge/hasLlmBridge/keyStatus/databasePath 全部正常。无阻塞项，本任务维持 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
