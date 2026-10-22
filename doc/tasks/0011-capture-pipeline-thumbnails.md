# Task 0011: 屏幕捕获管线与缩略图/原图生成

**Status:** `done`
**Created:** `2026-10-08`
**Scope ref:** `doc/specs/0002-screen-capture-questions.md`
**Evidence ref:** `doc/research/0011-ground-screen-capture.md`
**Owner:** `产品所有者（本人）`
**Execution:** `AFK`
**Spec ref:** `doc/specs/0002-screen-capture-questions.md`
**Board ref:** ``

## Context

SPEC-0002 的所有交互（截图提问、选中即问、预览确认）都依赖同一条主进程捕获管线：枚举窗口/显示器源、按物理分辨率静态截图、隐藏自身窗口防自拍、生成模型输入用的缩略图与可选原图。GROUND-0011 已确认路径：desktopCapturer.getSources + nativeImage 裁剪缩放编码，缩略图最长边 1280px JPEG q80，原图全分辨率 JPEG q90（单边封顶 8192px）。本任务只做主进程管线与单元测试，不接 UI——它是后续任务的地基，先把最不确定的捕获与图像处理验证掉。

## Acceptance Criteria

- [x] `src/main/capture/` 提供枚举接口：列出可用窗口与显示器源（id、名称、缩略图预览、display_id），支持按显示器与窗口标题过滤（供 FR-7 隐私排除复用）
- [x] 指定源可按物理分辨率静态截图（thumbnailSize = 逻辑尺寸 × scaleFactor），空图/无源给出可分类错误
- [x] 截图前自动隐藏 Deriva 全部自有窗口并等待重绘（约 150-200ms），截图后恢复
- [x] 支持对截图做物理像素矩形裁剪（边界钳制、过小区域返回明确错误）
- [x] 缩略图生成：最长边 1280px、JPEG q80；原图生成：全分辨率 JPEG q90、单边封顶 8192px；两者输出 data URL
- [x] AttachmentStore 捕获类附件单文件上限从 4MB 提至 8MB，超出时调用方降档为缩略图并返回标记
- [x] 上述行为有单元测试（desktopCapturer/screen 可注入替身），既有 168 项测试不回归

## Plan

- [x] 在 `src/main/capture/` 实现源枚举与静态截图（desktopCapturer 可注入，便于测试）
- [x] 实现自有窗口隐藏/恢复与重绘等待
- [x] 实现裁剪（scaleFactor 换算、钳制、最小尺寸）与缩略图/原图编码
- [x] 调整 `src/main/attachments.ts` 上限为 8MB 并补测试
- [x] 编写 capture 单元测试并全量回归（vitest + typecheck + build）

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-10-08

任务创建，来源 SPEC-0002 拆解（FR-1/FR-5 的数据层部分，NFR-2）。GROUND-0011 已调研通过，Evidence ref 直接指向该记录，本任务不再重复四源调研。

### 2026-10-08

实现完成，状态置为 in-progress，等待代码评审。落地文件：`src/main/capture/types.ts`（可注入平台接口与结构化错误）、`screen-capture.ts`（枚举/过滤、物理分辨率捕获、防自拍、裁剪、缩略图/原图编码与 8MB 降级标记）、`electron.ts`（desktopCapturer/screen/BrowserWindow 生产适配器）、`index.ts`（Node 安全的公共出口）；附件存储新增 `kind: 'capture'` 的 8MB 上限，普通图片仍为 4MB。

验证：聚焦测试 11 项通过；全量 `175` 项测试通过（32 个文件）；`npm run build`（含 node/web typecheck）通过。捕获模块按设计未接入 UI，后续 Task 0012 再接线。

### 2026-10-08

完成 `/ad-review`，留痕：`.agentic/reviews/2026-10-08T20-55-29-task-0011-capture-pipeline.md`。评审发现并修复区域选择重新截屏的问题：改为 `beginRegionCapture` 保存一张主进程 native image，`cropCapture` 对同一张图裁剪，`releaseCapture` 与 5 分钟 TTL 控制内存；`captureRegion` 保留为同一路径的便捷包装。两条非阻塞 Note（窗口源回退主显示器尺寸、渲染进程可声明 capture 类型）留给 Task 0013/0014 的真实场景处理。

评审后验证：聚焦测试 13 项、全量 177 项通过（32 个文件）；`npm run build` 通过；无新增 TODO/FIXME。Status 置为 done。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
