# Deriva

Windows 桌面学习助手。产品范围见 [doc/product/PRD.md](doc/product/PRD.md)，当前迭代是 v1 的树状对话（[doc/specs/0001-tree-chat.md](doc/specs/0001-tree-chat.md)）。

## 当前进度

Task 0001（脚手架与本地数据层）已完成：Electron + React + TypeScript 工程、SQLite 四张表、类型安全的 CRUD 数据层与单元测试。主进程模块边界按 ADR-0004 划分为 `db` / `llm` / `capture` / `session`，后两者在 v1 是空占位。

Task 0002（模型通道）代码已实现、待用户用真实 API Key 联调：`src/main/llm/` 下包含 OpenAI 兼容的流式客户端、增量 SSE 解析、safeStorage 加密的密钥存储、可配置的 provider 设置，以及 `system prompt -> 可插拔 context blocks -> 对话链` 的上下文管线（v1 只注册对话链 block）。

## 模型接入

- 默认 provider 为 DeepSeek：`baseUrl=https://api.deepseek.com`，`model=deepseek-flash`。两者都可在应用设置里改，为将来接其他 OpenAI 兼容厂商预留。
- API Key 由 Electron `safeStorage` 加密后写入 `%APPDATA%\deriva\deriva-data\api-key.json`，明文不落盘、不写日志；系统不支持安全存储时直接拒绝保存，不会退化为明文。
- 流式事件走 `llm:chat:event` 推送通道；失败按 DeepSeek 官方状态码分类（401 鉴权、402 余额、429 限流、超时 30 秒），失败与取消都会保留已生成的部分内容。

## 命令

```bash
npm install     # 安装依赖
npm run dev     # 启动 Electron 开发窗口
npm test        # 运行数据层单元测试
npm run typecheck
npm run build:win
```

## 依赖与网络说明

- `better-sqlite3` 13.x 内置按平台命名的 N-API 预编译产物（`prebuilds/win32-x64.node`），Node 与 Electron 共用同一份二进制，因此不需要 `electron-rebuild` / `electron-builder install-app-deps`。
- 国内网络下安装 Electron 二进制较慢时，可临时指定镜像后再安装，例如在 PowerShell 中设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。仓库不写死镜像配置，避免 npm 对自定义配置发出警告。

## 目录结构

```
src/main/       Electron 主进程
  db/           SQLite schema、迁移与仓储（CRUD、树查询、级联删除）
  llm/          v2 模型接入占位（ADR-0004）
  capture/      v2 屏幕感知占位（ADR-0004）
  session/      v3 学习会话占位（ADR-0004）
src/preload/    contextBridge 类型安全桥接
src/renderer/   React 界面
src/shared/     主进程与渲染进程共用的类型、IPC 通道与 API 契约
doc/            PRD、规格、ADR、任务与调研记录
```
