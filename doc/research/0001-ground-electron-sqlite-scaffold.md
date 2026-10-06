# GROUND-0001: electron-vite + React + better-sqlite3 脚手架与数据层实现路径

**Status:** recorded
**Decision:** 采用 electron-vite 官方 React+TS 模板的工程布局（src/main、src/preload、src/renderer/src，tsconfig 分 node/web），better-sqlite3 置于 dependencies 并在 app.getPath('userData') 下建库，连接建立时开启 foreign_keys 与 WAL，用 PRAGMA user_version 做迁移，preload 经 contextBridge 暴露类型安全 IPC。
**Decision ref:** doc/tasks/0001-project-scaffold-data-layer.md
**Confidence:** Strong

## Decision and confidence

Happy path：以 electron-vite 官方 react-ts 模板为骨架（B1），它给出被验证过的三段式目录、tsconfig 拆分、`postinstall: electron-builder install-app-deps` 与 `@renderer` 别名；依赖归类按 electron-vite 官方依赖处理规则执行（A3）——better-sqlite3 用于主进程，放 `dependencies` 被外部化并随包分发，React/DOM 等渲染进程依赖放 `devDependencies` 被打包；数据库放在 `app.getPath('userData')` 子目录（A1），连接时执行 `PRAGMA foreign_keys = ON`（A7：外键约束默认关闭，必须逐连接开启）与 `journal_mode = WAL`（A5），schema 迁移用 `PRAGMA user_version`（A8），树形级联删除依赖 `ON DELETE CASCADE`；主进程能力经 preload + contextBridge 暴露给渲染进程（A2、B1）。

三处偏离，均已具名理由：

1. 依赖版本不取 npm `latest`（Electron 44.5.1 / TypeScript 7.0.2 / Vite 8.3.2），而取官方模板锁定并经其 CI 验证的组合（Electron ^39.2.6 / TypeScript ^5.9.3 / Vite ^7.2.6）。理由：模板组合是唯一有共同验证证据的版本集合，取 latest 会把三个未验证的大版本差同时引入脚手架任务。
2. 原生模块 ABI 处理采用 `electron-builder install-app-deps`（B1、B2 的既有脚本）而非直接调用 `electron-rebuild`（A6 提到的通用做法）。理由：本项目的打包器就是 electron-builder，同一工具完成重建与打包，模板与 Specter-AI 均如此；二者做的是同一件事（按 Electron ABI 重建原生模块）。
3. 单元测试运行在 Node 下而非 Electron 下时存在 ABI 冲突（postinstall 会把 better-sqlite3 重建为 Electron ABI）。本任务的验收要求包含数据层单元测试与写入耗时断言，故实施时须先确定测试运行时；若 Node 直跑失败，改用 `ELECTRON_RUN_AS_NODE=1` 以 Electron 二进制运行 vitest，或退化为测试前按 Node ABI 重建。此项为实施期可验证的工程细节，不改变上述架构决策。

Axis-2 verdict: Strong。这是一个可逆的脚手架决策，A/B 双源在工程布局与依赖归类上完全一致，偏离项均有明确理由与退路。

修订（2026-10-02，实施期实证）：E4 的 ABI 结论只适用于从源码编译原生模块的旧路径。实施时安装并检查 better-sqlite3 13.0.3 后确认其分发的是按平台命名的 Node-API 预编译产物（prebuilds/win32-x64.node 等 8 个平台文件），lib/binding.js 直接 require 该文件，依赖仅 node-addon-api（E10）。因此 electron-rebuild / electron-builder install-app-deps 不再必要，package.json 的 postinstall 已移除；第三条偏离中担心的 Node 与 Electron 双 ABI 冲突不成立，单元测试与运行时共用同一份二进制。asarUnpack 保留，因为打入 asar 的原生 .node 无法被加载。

## Evidence

### E1 — 应用自有数据文件应写入 app.getPath('userData') 的子目录

**Strength:** High
**Provenance:** A1

Electron 官方 API 文档说明 userData 默认为 appData 加应用名，约定用户数据写入此目录，且建议放进 userData 下的子目录而非直接写入 userData 根，以避免与 Chromium 自带的 Cache、GPUCache、Local Storage 等子目录冲突。

### E2 — electron-vite 官方 react-ts 模板是可用的工程骨架

**Strength:** High
**Provenance:** A3, B1

B1 的四个文件（package.json、electron.vite.config.ts、src/main/index.ts、src/preload/index.ts）给出完整可运行骨架：main 入口位于 ./out/main/index.js、renderer 用 @vitejs/plugin-react 与 @renderer 别名、preload 用 contextBridge 暴露 API、dev 脚本为 electron-vite dev。A3 补足依赖处理规则。

### E3 — 依赖归类：主进程依赖放 dependencies，渲染进程依赖放 devDependencies

**Strength:** High
**Provenance:** A3, B1, B2

A3 明确：package.json dependencies 中的依赖在主进程与 preload 中被视为外部依赖、不打包，并在 electron-builder 打包时随包分发；渲染进程使用的依赖宜装为 devDependencies 以缩小最终包体积，因为打包工具默认排除 devDependencies。B1 与 B2 的 package.json 均按此规则组织（B2 把 electron-store 等主进程依赖放 dependencies，把 react/react-dom/vite 放 devDependencies）。

### E4 — 原生模块必须按 Electron ABI 重建，并在 asar 打包时解包

**Strength:** High
**Provenance:** A6, B1, B2

A6（better-sqlite3 官方排障文档）指出：使用 Electron 时需用 electron-rebuild；若使用 app.asar 打包，必须确保原生库被 unpacked。B1 与 B2 均在 postinstall 执行 electron-builder install-app-deps；B2 另在 electron-builder 配置中为原生依赖设置 asarUnpack。

### E5 — SQLite 外键约束默认关闭，级联删除必须逐连接开启

**Strength:** High
**Provenance:** A7, A4

A7 原文：Foreign key constraints are disabled by default (for backwards compatibility), so must be enabled separately for each database connection。因此 ON DELETE CASCADE 只有在连接建立后执行 PRAGMA foreign_keys = ON 才会生效。A4 提供 better-sqlite3 的 db.pragma() 接口用于执行该语句。

### E6 — WAL 模式是 better-sqlite3 官方推荐的高并发读写设置

**Strength:** High
**Provenance:** A5

A5 原文建议 `db.pragma('journal_mode = WAL')`，用以显著提升并发读写性能，并说明 WAL 在单进程单线程访问下不会遇到 checkpoint starvation 问题（本应用为单主进程访问，适用）。

### E7 — schema 迁移可用 PRAGMA user_version

**Strength:** High
**Provenance:** A8, A4

A8 原文：The user_version pragma will get or set the value of the user-version integer at offset 60 in the database header. The user-version is an integer that is available to applications to use however they want. SQLite makes no use of the user-version itself。A4 提供 better-sqlite3 执行 pragma 的接口，足以实现按版本号顺序执行的迁移。

### E8 — 主进程能力经 preload + contextBridge 暴露，保持 contextIsolation

**Strength:** High
**Provenance:** A2, B1

A2 指出 Context Isolation 自 Electron 12.0.0 起为默认行为，禁用了 Node.js integration 时仍可通过 preload 脚本经 contextBridge 向渲染进程暴露自定义 API。B1 的 preload 实现正是 contextBridge.exposeInMainWorld 的标准写法。

### E9 — 仓库内无可复用的既有实现

**Strength:** High
**Provenance:** C1, D1

C1 的全仓扫描显示仓库仅含文档与参考图片，无 package.json、无 src 目录，故无仓库内先例可循。D1 显示该目录尚不是 git 仓库，无历史提交可供检索，属可复现的"无先例"。

### E10 — better-sqlite3 13 分发 Node-API 预编译产物，无需为 Electron 重建

**Strength:** High
**Provenance:** B3, A4

安装后检查发行包：node_modules/better-sqlite3/prebuilds/ 下是按平台命名的 8 个 .node 文件（含 win32-x64.node），文件名不含 NODE_MODULE_VERSION 后缀；lib/binding.js 第 44 行直接以 prebuilds/<target>.node 路径 require；package.json 的依赖只有 node-addon-api。Node-API 的 ABI 稳定性意味着同一份二进制在 Node 与 Electron 下均可加载，故无需 electron-rebuild。A4 提供该库的公开 API 说明，B3 是本机安装产物的实证。
## Source register

- **A1:** Electron 官方文档，app.getPath(name) 与 userData 说明，https://www.electronjs.org/docs/latest/api/app (accessed 2026-10-02 via curl fetch of official docs page)
- **A2:** Electron 官方安全指南，contextIsolation 默认值与 contextBridge 用法，https://www.electronjs.org/docs/latest/tutorial/security (accessed 2026-10-02 via curl fetch of official docs page)
- **A3:** electron-vite 官方文档 Dependency Handling，dependencies 与 devDependencies 在 main/preload/renderer 中的处理规则，https://electron-vite.org/guide/dependency-handling (accessed 2026-10-02 via curl fetch of official docs page payload)
- **A4:** better-sqlite3 官方 API 文档，Database、pragma、prepare、transaction 接口，https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md (accessed 2026-10-02 via curl fetch of raw.githubusercontent.com)
- **A5:** better-sqlite3 官方性能文档，WAL 模式建议与注意事项，https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md (accessed 2026-10-02 via curl fetch of raw.githubusercontent.com)
- **A6:** better-sqlite3 官方排障文档，Electron 需 electron-rebuild 且 asar 中原生库须 unpacked，https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md (accessed 2026-10-02 via curl fetch of raw.githubusercontent.com)
- **A7:** SQLite 官方外键文档，外键约束默认关闭、需逐连接 PRAGMA foreign_keys = ON，https://www.sqlite.org/foreignkeys.html (accessed 2026-10-02 via curl fetch of official docs page)
- **A8:** SQLite 官方 PRAGMA 文档，user_version 语义，https://www.sqlite.org/pragma.html (accessed 2026-10-02 via curl fetch of official docs page)
- **B1:** alex8088/quick-start 仓库 electron-vite react-ts 模板，package.json、electron.vite.config.ts、src/main/index.ts、src/preload/index.ts，https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/react-ts (accessed 2026-10-02 via curl fetch of raw.githubusercontent.com)
- **B2:** umairinayat/Specter-AI package.json，同一技术形态（Electron + React + TS + electron-vite + electron-builder）的已发布应用，含 install-app-deps 与 asarUnpack 配置，https://github.com/umairinayat/Specter-AI/blob/main/package.json (accessed 2026-10-02 via curl fetch of raw.githubusercontent.com)
- **B3:** 本机安装产物 node_modules/better-sqlite3@13.0.3 检查，prebuilds/ 含 8 个按平台命名的 N-API 产物且 lib/binding.js:44 直接 require 该文件，依赖仅 node-addon-api (accessed 2026-10-02 via local shell)
- **C1:** 仓库全量文件扫描，D:\projects\ai-tutor 下仅有 CONTEXT.md、doc/ 文档与参考图片，无 package.json 与 src，结论"no analog found"（命令：Get-ChildItem -Recurse -File，排除 .png） (accessed 2026-10-02 via local shell)
- **D1:** git -C D:\projects\ai-tutor status --short 返回 fatal: not a git repository，仓库无历史提交，结论"no prior attempt found" (accessed 2026-10-02 via local shell)

## Limitations and reversal

本记录不能证明：better-sqlite3 的当前版本在 Electron 39 与 Node 24 两套 ABI 下的构建是否开箱可用；本机是否已具备原生模块编译工具链（Python 与 Visual Studio Build Tools）；Electron 主进程窗口在无显示环境下能否启动以供自动化验收。前两项在 npm install 与首次构建时立刻暴露，若预编译二进制不可用且工具链缺失，则需先补齐构建环境或改用其他 SQLite 绑定。第三项若成立，则 `npm run dev` 的窗口验收只能由人工确认。反转条件：若 electron-vite 5 与 Electron 39 的组合在本机不可运行，则回退到 npm latest 组合并重跑本记录。

修订（2026-10-02）：上述前两项顾虑已被 E10 与实测消解——原生模块不需要本机编译工具链，vitest 在 Node 下 16 项测试全部通过，electron-vite build 亦成功产出 main/preload/renderer 三份产物。第三项仍待 Electron 二进制可用后验证。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0001-ground-electron-sqlite-scaffold.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
