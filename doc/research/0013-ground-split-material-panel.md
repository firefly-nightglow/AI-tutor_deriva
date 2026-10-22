# GROUND-0013: 窗口级分屏与内嵌资料面板

**Status:** recorded
**Decision:** 保留现有 BrowserWindow 作为 AI 对话 renderer 宿主，在其 `contentView` 上增加一个独立 WebContentsView 作为资料面板；React 侧预留资料面板的布局槽，并通过 ResizeObserver/IPC 把 bounds 同步给主进程，主进程用 `view.setBounds` 定位。资料面板使用独立 session/partition、`sandbox:true`、`contextIsolation:true`、`nodeIntegration:false`、无业务 preload；外部链接统一交给系统浏览器，`will-navigate`/`setWindowOpenHandler`/权限请求全部显式限制。网页 URL 优先支持；本地 PDF/代码/视频先用自定义 `deriva-material://` 协议做最小实现，并在实现前用小规模 spike 验证 Chromium PDF/视频行为，失败则展示降级而不影响对话。
**Decision ref:** doc/tasks/0018-split-view-material-panel.md
**Confidence:** Conditional

## Decision and confidence

Electron 官方文档的 WebContentsView 示例直接把两个 WebContentsView 加入 `contentView`，并分别 `setBounds`，这提供了一条比 BrowserView 更现代、生命周期更清晰的分屏路径。对 Deriva 现有架构而言，最稳妥的接入不是把整个应用重写成 BaseWindow + 双 view，而是保留现有 BrowserWindow 作为对话 UI，只在其 contentView 上叠加一个资料 WebContentsView；React 仍负责整体布局，但把资料槽的像素 bounds 报给主进程。这样对话、树状侧栏和现有 IPC 不需要重写。

安全边界必须由资料 view 自己提供：独立 session/partition、contextIsolation、sandbox、nodeIntegration=false、无业务 preload；对远程内容执行 `will-navigate` 限制、`setWindowOpenHandler` 外链策略和 permission request handler。网页 URL 是确定的 happy path；本地 PDF/代码/视频的 MIME 与 Chromium 内置查看器行为尚未被本项目实测，因此置信度不是 Strong，实施前必须做一个小 spike（不是完整功能）验证协议映射、PDF 查看和视频播放。

Axis-2 verdict: Conditional。WebContentsView 挂载和边界设置由官方文档与公开管理器实现双重确认；本地文件内容矩阵仍需 spike 后定稿，采用“URL 先行、本地协议扩展、失败降级”的缓解方案。

## Evidence

### E1 — WebContentsView + contentView.addChildView + setBounds 是官方分屏路径

**Strength:** High
**Provenance:** A1, B1

A1 的官方示例创建两个 WebContentsView，分别 `contentView.addChildView(view)`、`view.webContents.loadURL(...)`、`view.setBounds({x,y,width,height})`。B1（derekazhang/electron-webcontentsview-manager `packages/ewm-main/src/wcv-manager.ts:368-374`、`view-pool.ts:38-44`）在生产型管理器中同样使用 `contentView.addChildView/removeChildView`，并在 view 池中使用 `new WebContentsView({ webPreferences })`；`setBounds` 在节点布局更新时调用。这比 BrowserView 更符合当前 Electron 39 的 view 生命周期。

### E2 — 现有 BrowserWindow 可以作为对话宿主，资料面板作为叠加 view

**Strength:** High
**Provenance:** A1, B2, C1

A1 的 WebContentsView 可加入 BrowserWindow 的 contentView；C1（src/main/index.ts:41-109）现有窗口已经承载 React renderer，无需迁移。B2（nyshk97/browser `src/renderer/components/SplitRow.tsx:16-40`）提供了分屏两侧布局与可调整比例的 renderer 参考，但不承担 WebContentsView 本身；本项目由 React 预留资料面板槽，主进程负责实际 view bounds。

### E3 — 外部内容需要完整的导航、窗口和权限边界

**Strength:** High
**Provenance:** A2, A3, B1

A2 的安全清单要求开启 context isolation、sandbox、禁用 nodeIntegration、限制 permission request、定义 CSP；A3 明确 `will-navigate` 与 `setWindowOpenHandler` 的 URL 校验方式。B1 的 WebContentsView 创建使用 `contextIsolation:true`、`nodeIntegration:false`。资料面板不应加载业务 preload，不应把 Deriva 的 `window.api` 暴露给外部网页；外链只通过受控的 `shell.openExternal` 打开。

### E4 — 加载失败与渲染崩溃需要显式降级

**Strength:** High
**Provenance:** A3

同一份 WebContents 文档（A3）提供 `did-fail-load` 与 `render-process-gone` 事件；`will-navigate` 与 `setWindowOpenHandler` 也属于同一生命周期。资料面板失败时应在 React 槽位显示重试/关闭，而不是让整个窗口空白；对话面板仍由 BrowserWindow renderer 正常工作。

### E5 — 本地 PDF/代码/视频支持需要协议与 spike，而不是直接放开 file://

**Strength:** Medium
**Provenance:** A5, A2

A5 的 protocol 文档提供 `registerSchemesAsPrivileged` 与 `protocol.handle(scheme, handler)`；A2 要求对外部内容设置安全边界。直接允许任意 `file://` 会让远程页面获得本地文件访问面。建议用 `deriva-material://` 协议映射到用户明确选择的本地文件，并在实现前用 spike 验证 Chromium 对 PDF、代码文本和视频的 MIME/播放行为。强度为 Medium：协议 API 确定，但 PDF/视频内置查看器的具体行为尚未实测。

### E6 — 没有先前分屏实现，现有代码只有单窗口

**Strength:** High
**Provenance:** C1, D1

C1 显示 main/index.ts 只有一个 BrowserWindow；D1 的 git log 没有 WebContentsView、split 或 floating 相关提交。分屏应新增独立 MaterialPanelController/主进程模块，不污染聊天服务或捕获服务。

## Source register

- **A1:** Electron WebContentsView 官方文档（`contentView.addChildView`、`view.setBounds`、两个 view 的示例），https://www.electronjs.org/docs/latest/api/web-contents-view (accessed 2026-10-17 via Invoke-WebRequest)
- **A2:** Electron Security 官方教程（contextIsolation、sandbox、nodeIntegration、permission、will-navigate、setWindowOpenHandler），https://www.electronjs.org/docs/latest/tutorial/security (accessed 2026-10-17 via Invoke-WebRequest)
- **A3:** Electron WebContents 官方文档（will-navigate、setWindowOpenHandler、did-fail-load、render-process-gone、capturePage），https://www.electronjs.org/docs/latest/api/web-contents (accessed 2026-10-17 via Invoke-WebRequest)
- **A5:** Electron protocol 官方文档（registerSchemesAsPrivileged、protocol.handle），https://www.electronjs.org/docs/latest/api/protocol (accessed 2026-10-17 via Invoke-WebRequest)
- **B1:** derekazhang/electron-webcontentsview-manager packages/ewm-main/src/wcv-manager.ts:368-374 与 view-pool.ts:38-44，WebContentsView 挂载、移除、创建与销毁，https://github.com/derekazhang/electron-webcontentsview-manager (accessed 2026-10-17 via GitHub Contents API)
- **B2:** nyshk97/browser src/renderer/components/SplitRow.tsx:16-40，分屏两侧布局与拖拽标签交互，https://github.com/nyshk97/browser (accessed 2026-10-17 via raw.githubusercontent.com)
- **C1:** 仓库内 src/main/index.ts:41-109，单 BrowserWindow 与现有 preload/security 配置 (accessed 2026-10-17 via local shell)
- **D1:** `git log --all --oneline` 仅 3 个提交；`git log --all --oneline --grep=WebContentsView`、`--grep=split`、`--grep=floating` 均无结果，结论 no prior attempt found (accessed 2026-10-17 via local shell)

## Limitations and reversal

本记录不能证明：WebContentsView 与 Windows 触控滚动、DRM 视频、第三方登录页、Chromium PDF 查看器的最终兼容性；也不能证明自定义 `deriva-material://` 协议在 PDF/视频 MIME 下不需要额外处理。实施前应做最小 spike 验证这些内容，再决定是否支持本地 PDF/视频或先只交付 URL 面板。反转条件：若自定义协议无法让 PDF/视频正常加载，则退回“网页 URL + 普通文本/代码”优先级，并把本地 PDF/视频支持登记为后续任务，而不是放开不受控的 file://。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0013-ground-split-material-panel.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
