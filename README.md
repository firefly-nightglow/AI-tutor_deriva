# Deriva

Deriva 是一个面向大学本科生的 Windows 桌面 AI 学习助手，用来辅助阅读经典教材、公开课和其他课外高质量资料时的自学。名称取自 **derivation**：知识从主干推导、衍生出枝杈，对应产品的核心形态——树状对话。

当前发布版本：`v1.0.0`。产品范围见 [PRD](doc/product/PRD.md)，v1 功能契约见 [Spec 0001](doc/specs/0001-tree-chat.md)。

## 解决的痛点

- **学习流被打断**：常见做法是切到浏览器查定理、再打开网页版 AI 提问，最后切回资料。Deriva 把问答放回桌面应用内，并用完整树状对话保存学习过程，减少反复切换造成的中断。
- **AI 回答超出当前知识水平**：内置教学系统提示词要求模型先判断学生已掌握什么，不从学生未学过的二级结论或高级工具出发；必须引入前置知识时，先解释它，再继续推导。
- **线性对话丢失逻辑关系**：针对某段推导、公式或定理的追问，不再只是下一条聊天记录，而是挂在被选内容下形成子对话、子子对话；主问题和追问分支可以并排查看。
- **长对话难以回看**：自动书签、树状侧栏、单对话链路图和按科目分类的对话存档，用于在几十轮问答之后仍能快速定位历史内容。
- **数据不可控**：对话、书签、引用关系和附件索引全部写入本地 SQLite；模型调用只走用户自己的 DeepSeek API Key，不使用云端账号或外部数据库。

## 当前范围

v1.0.0 已实现：

- 完整树状对话：主对话、子对话、子子对话，以及基于选中 AI 输出内容创建分支。
- 树状侧栏、对话书签、单对话链路图、多面板并排对照。
- 科目分类的多对话存档，以及对话重命名、删除确认、重名规则和模型标识。
- DeepSeek API 流式对话，Markdown 与 KaTeX 数学公式渲染，错误分类、取消和部分内容保存。
- 本地 SQLite 持久化，应用重启后恢复科目、对话树、消息、书签和引用关系。
- 教学系统提示词 v0.1，以及浅色、深色和跟随系统主题。

以下能力已列入产品路线图，但 **v1.0.0 尚未实现**：

- 屏幕边缘吸附悬浮窗、全局热键和窗口级分屏。
- 屏幕感知、截图提问、选中屏幕内容提问。
- 视频字幕提取、纪要式总结、思维导图、自动出题、费曼模式、知识画像。
- 跨主对话的全局链路图、对话搜索和标签系统。

## 技术栈

- Electron 39 + React 19 + TypeScript
- electron-vite + Vite
- better-sqlite3（本地 SQLite，WAL 模式）
- React Flow（`@xyflow/react`）+ dagre（链路图布局）
- react-markdown + remark-math + KaTeX（Markdown 与公式渲染）
- Electron `safeStorage`（API Key 本地加密）

## 环境要求

- Windows 10/11 x64。
- Node.js `^20.19.0` 或 `>=22.12.0`；推荐使用当前 Node.js 22 LTS。该要求来自项目安装的 Vite 7。
- npm（随 Node.js 安装即可）。
- 网络访问：安装依赖时需要下载 Electron 等包；使用应用时需要能够访问 DeepSeek API。

检查版本：

```powershell
node --version
npm --version
```

## 安装依赖与启动

```powershell
git clone https://github.com/firefly-nightglow/AI-tutor_deriva.git
cd AI-tutor_deriva
npm install
npm run dev
```

`npm run dev` 会启动 Electron 开发窗口。源码改动会由 electron-vite 重新构建并刷新渲染进程。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发环境 |
| `npm test` | 运行 Vitest 测试 |
| `npm run typecheck` | 检查主进程与渲染进程 TypeScript 类型 |
| `npm run build` | 类型检查并构建到 `out/` |
| `npm run start` | 预览已构建的应用 |
| `npm run build:win` | 生成 Windows x64 安装包，输出到 `dist/` |

如果国内网络导致 Electron 下载缓慢，可在 PowerShell 中临时设置镜像后再执行 `npm install`：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm install
```

## 配置 DeepSeek API Key

Deriva 不内置共用 Key，也不嵌入 DeepSeek 网页版。模型调用使用你自己的 DeepSeek API Key（ADR-0002）。

1. 前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。
2. 启动 Deriva，点击右上角的 **设置**。
3. 在 **API Key** 输入框中填写 `sk-...`，点击 **保存**。
4. 新建主对话并发送一个问题，确认能够流式返回回答。

默认模型设置：

| 配置 | 默认值 |
| --- | --- |
| Base URL | `https://api.deepseek.com` |
| 模型 | `deepseek-flash` |

设置面板还提供“模型生成摘要”和“子对话上下文：引用片段 + 完整对话链”等选项；切换到模型摘要会增加 API 调用和 token 消耗。普通使用无需创建 `.env`，API Key 不需要写入环境变量。

Key 的本地存储行为：

- 使用 Electron `safeStorage` 加密后写入 `%APPDATA%\deriva\deriva-data\api-key.json`。
- 明文不会写入仓库、SQLite、日志或诊断信息。
- 系统无法提供安全存储时，Deriva 会拒绝保存 Key，不会退化为明文存储。
- 设置页的 **清除** 按钮会删除本地保存的 Key。

## 已实现功能

### 树状学习对话

- 创建、重命名、删除科目；主对话按科目归档，默认进入“未分类”。
- 主对话内连续多轮问答，回答流式输出，Markdown、代码块和 LaTeX 公式正确渲染。
- 选中 AI 输出中的文本、公式或定理后发起“追问”，生成父子包含关系的子对话。
- 子对话可继续嵌套；已验证至少 5 层，树状侧栏对深层节点使用层级角标。
- 引用块保留被选内容的 Markdown/LaTeX 来源；分支删除后，父对话中的来源标记会消失。

### 导航与对照

- 树状侧栏：展开、折叠、定位和打开任意对话节点。
- 对话书签：自动为回答生成导航条目，支持点击跳转、高亮和折叠书签栏。
- 链路图：以主对话为根展示整棵对话树，节点之间使用曲线连接，点击节点打开对应内容。
- 多面板对照：主对话、子对话和子子对话可同时打开；默认可视区平铺 3 栏，面板可关闭、独立滚动和拖拽调整宽度。

### 本地数据与模型

- SQLite 保存科目、对话树、消息、书签和引用关系，启用 WAL 与外键约束。
- 流式过程中断或请求失败时保留已收到的部分内容；401、402、429 和超时有明确的用户提示。
- 切换模型后，历史回答保留原模型标识，新回答记录新模型标识。
- API Key 使用 Electron `safeStorage` 加密；主进程与渲染进程之间通过类型安全的 preload bridge 通信。

### 教学提示词

- `src/main/llm/system-prompt.ts` 中的 v0.1 提示词作为每次请求的第一条 system message 注入。
- 约束模型先判断学生水平，不默认使用超水平前置知识；必须引入新概念时先解释，关键结论附带依据或出处。
- 未声明学习水平时，默认从最基础路线讲解，并邀请学生补充已学内容。

## 项目结构

```text
src/main/          Electron 主进程
  db/              SQLite schema、迁移、仓储与树查询
  llm/             模型客户端、SSE、上下文管线、Key 存储、教学提示词
  capture/         v2 屏幕感知预留模块
  session/         v3 学习会话预留模块
src/preload/       contextBridge 类型安全桥接
src/renderer/      React 界面、树状侧栏、书签、链路图和多面板
src/shared/        主进程与渲染进程共用类型、IPC 通道和 API 契约
doc/               PRD、Spec、ADR、任务、调研和验收记录
.agentic/          各任务评审留痕
```

## 文档

- [产品需求文档](doc/product/PRD.md)
- [v1 树状对话规格](doc/specs/0001-tree-chat.md)
- [v1 验收走查](doc/product/v1-acceptance-walkthrough.md)
- [领域词汇 CONTEXT.md](CONTEXT.md)
- [ADR-0001：Windows 桌面应用形态](doc/adr/0001-desktop-app-form-factor.md)
- [ADR-0002：仅 API 接入模型](doc/adr/0002-api-only-model-access.md)
- [ADR-0003：v1 范围与版本分期](doc/adr/0003-mvp-scope-floating-window-tree-chat.md)
- [ADR-0004：v2/v3 扩展点](doc/adr/0004-v1-extension-points-for-v2-v3.md)
