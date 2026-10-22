# Task 0012: 截图提问入口、源选择与预览确认流程

**Status:** `done`
**Created:** `2026-10-08`
**Scope ref:** `doc/specs/0002-screen-capture-questions.md`
**Evidence ref:** ``
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0002-screen-capture-questions.md`
**Board ref:** ``

## Context

SPEC-0002 的第一条端到端垂直切片：用户从 Deriva 发起"截图提问"，在源选择器里挑窗口或显示器，预览截图，选缩略图/原图，输入问题发送，得到流式回答并存入对话。这一步打通后，"截屏工具 + 手工上传"的旧流程就有了替代物（Scenario 1/3，FR-1/FR-3/FR-4/FR-9）。HITL：真实屏幕上的源枚举、预览与提问闭环由产品所有者本人验收。

## Acceptance Criteria

- [x] 对话界面有"截图提问"入口，打开源选择器，窗口/显示器源带缩略图预览与名称
- [x] 选择目标后展示全尺寸预览，提供重新截取、取消、缩略图/原图保存选项（默认缩略图）和发送控件
- [x] 预览确认前任何屏幕内容不发送给模型；取消后不残留未确认截图文件
- [x] 问题可发到当前主对话/子对话，无打开对话时可新建主对话；空问题或纯空白不可发送
- [x] 屏幕提问与普通提问共用流式回答、错误/取消、部分内容保存、模型标识与教学提示词
- [x] 用户实操确认：完成一次窗口截图提问与一次显示器截图提问，回答正常、消息与附件入库

## Plan

- [x] 实现源选择器 UI（调用 Task 0011 枚举接口）与预览确认界面
- [x] 预览选项接入 Task 0011 的缩略图/原图生成与 AttachmentStore
- [x] 发送路径复用现有 composer/聊天服务，截图作为消息附件
- [x] 补 jsdom 用例（源选择、预览取消不发送、空问题拦截）
- [x] 真实屏幕实操验收（HITL）

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-08

任务创建，来源 SPEC-0002 拆解（Scenario 1/3，FR-1/FR-3/FR-4/FR-9）。依赖 Task 0011 的捕获管线。Evidence ref 留空：实现前若 UI 交互方案有不确定点，按 /ad-ground 轻量调研后回填。

### 2026-10-08

实现完成，状态置为 in-progress，等待真实屏幕验收。新增 `src/renderer/src/components/ScreenshotDialog.tsx` 与对话 composer 的“截图”入口；源选择器展示窗口/显示器预览，选择后调用 Task 0011 捕获接口（`keepOriginal: true` 以同时准备两种保存形态），预览页提供重新截取、取消、保留原图、问题输入和发送。主进程新增 `capture:sources:list` / `capture:source:capture` IPC，preload 暴露 `window.api.capture`；发送复用现有 `OutgoingImage.kind: 'capture'` 与聊天服务。

验证：`ScreenshotDialog` 4 项 jsdom 用例、ConversationView 截图入口断言、全量 `182` 项测试通过（33 个文件）；`npm run build`（含 node/web typecheck）通过。仍待用户实操窗口与显示器截图回合并确认回答/附件入库。

### 2026-10-11

真人验收反馈三类问题：截图预览与消息附件图片全部加载失败；窗口源列表随新窗口开启而不稳定；选择窗口后出现 `CaptureError: 屏幕来源没有可用内容`。根因与修复：

1. **图片加载失败**：renderer CSP 只写了 `default-src 'self'`，没有放行 `data:` 图片。已在 `src/renderer/index.html` 与 `electron.vite.config.ts` 的 dev CSP 中加入 `img-src 'self' data: blob:`，并补 CSP 回归测试。
2. **窗口列表不稳定/自身窗口混入**：现在通过 `BrowserWindow.getMediaSourceId()` 过滤 Deriva 自身窗口；源列表新增刷新按钮，并在窗口重新获得焦点时自动刷新。Windows 上被最小化或关闭的窗口本身不会稳定出现在 `desktopCapturer` 枚举中，因此界面会引导用户恢复目标窗口后重试。
3. **窗口捕获空内容**：捕获失败时按源名称回退匹配并最多重试 3 次；仍失败时给出“目标窗口可能已最小化或关闭”的可操作提示，而不是只显示来源 id。

修复后验证：全量 `183` 项测试通过（33 个文件）；`npm run build` 通过。待重新实操窗口/显示器截图闭合。

### 2026-10-13

用户验收截图确认页时指出预览空间有限，无法放大核对小字或公式。已在 `ScreenshotDialog` 的“确认截图”页加入放大查看：点击预览或“放大查看”按钮打开全屏缩放视图，支持 100%-400% 缩放、重置、关闭和原生滚动查看；Esc 会先关闭缩放视图，不退出截图确认。补 jsdom 用例覆盖打开、放大、重置与关闭。

验证：全量 `185` 项测试通过（34 个文件）；`npm run build` 通过。待用户重新验收确认截图放大查看。

### 2026-10-13

用户确认放大查看与截图提问闭环验收通过，执行 `/ad-review`，留痕：`.agentic/reviews/2026-10-13T22-53-26-task-0012-screenshot-question-flow.md`。评审对照 FR-5 发现原先只有每次截图的“保留原图”勾选，缺少设置中的默认保存方式；已补 `capturePrefs.ts`、设置页“截图 → 默认保存方式”开关，并让确认页以该默认值打开。

评审结论：Standards 0 Blockers / 0 Concerns / 2 Notes；Spec 0 Blockers / 0 Concerns（一项 FR-5 缺口已在评审中修复）。评审后验证：全量 `187` 项测试通过（35 个文件）；`npm run build` 通过；无新增 TODO/FIXME。Status 置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
