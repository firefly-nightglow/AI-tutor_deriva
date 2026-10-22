# GROUND-0011: SPEC-0002 屏幕捕获方案（desktopCapturer 静态截图 + 全屏覆盖层选区）

**Status:** recorded
**Decision:** 捕获走 Electron `desktopCapturer.getSources`，以物理分辨率 `thumbnailSize` 取窗口/显示器静态截图；区域选择用"先截全屏、再在每显示器一个全屏无边框覆盖窗里展示截图、拖拽框选、主进程 `nativeImage.crop`"的形态；捕获前隐藏 Deriva 自身窗口并等待重绘；图片参数定为——模型输入与默认缩略图统一为最长边 1280px JPEG q80，"保留原图"为全物理分辨率 JPEG q90（单边不超 8192px，超过 AttachmentStore 上限时降档保存并提示）；发送复用 v1 已有的 `image_url` 图片管线，不改动 LLM 客户端。
**Decision ref:** doc/specs/0002-screen-capture-questions.md
**Confidence:** Strong

## Decision and confidence

Happy path：SPEC-0002 需要三种捕获——窗口、显示器、区域。三者共用同一条主进程管线：`desktopCapturer.getSources({ types, thumbnailSize: 物理像素尺寸 })` 直接返回内容缩略图（A1），`nativeImage` 完成裁剪、缩放与 JPEG/PNG 编码（A2）。区域选择不走系统截图工具（无法编程嵌入预览-确认-发送流程），而采用被两个独立开源项目验证过的形态：先按物理分辨率截全屏，再在目标显示器上打开全屏无边框覆盖窗展示这张图，用户用指针拖拽出矩形，CSS 像素经 scaleFactor 换算成物理像素后主进程裁剪（B1 的 crop 实现含缩放换算、边界钳制与最小尺寸保护；B2 的覆盖层选区交互含 DPI 换算与过小区域丢弃）。捕获瞬间先隐藏 Deriva 自己的窗口避免自拍，等待约 150-200ms 重绘后再截（B1）。

图片参数（SPEC-0002 OQ-2 的决议）：DeepSeek 官方 Vision 文档说明每张图在推理前会被重缩放到约 1300x1300 总像素、单图 token 上限 1024（A3）。因此默认缩略图与模型输入统一为最长边 1280px 的 JPEG q80——典型宽高比下总像素已低于服务端重采样阈值，模型可见细节无损失，同时控制上传体积与本地占用。"保留原图"保存全物理分辨率 JPEG q90，单边封顶 8192px（A3 的硬上限）；AttachmentStore 当前单文件上限 4MB（C2），4K 原图可能超出，实现时将捕获类附件上限提至 8MB，仍超出则降档保存缩略图并提示（NFR-2 的显式约束）。发送侧零改动：v1 的 `wireContent` 已把 `images` 数组转成 `image_url` 内容部件（C3），DeepSeek 的 `detail: high` 等价于保留原图（A3），图片只允许出现在 user 消息——现有管线恰好只在 user 消息上挂附件（C3、A3）。

Axis-2 verdict: Strong。捕获 API 与图像处理 API 有官方文档 + 生产级开源实现双重确认；模型输入格式与 token 规则有官方文档确认，且 v1 管线已在真实 API 上验证过图片消息；两处具名偏离均有参考实现自身的注释作为理由。

具名偏离：

1. **不引入 screenshot-desktop 兜底**。B1（Specter-AI）以 desktopCapturer 为主、screenshot-desktop 为备，但其文件头注释说明引入备用是因为"screenshot-desktop 依赖解包的 Windows 二进制，在 asar 内经常失败"。本项目的打包配置（asarUnpack 仅 better-sqlite3）下该兜底同样脆弱，且 desktopCapturer 才是它在打包环境真正依赖的主路径。少一个原生二进制，少一类打包故障。
2. **区域选区交互移植自 Tauri 参考**。B2（Swen）的选区视图是 Tauri/Vue 实现；本项照其交互形态（截屏垫底 + 拖拽选区 + DPI 换算 + 后端裁剪）用 Electron BrowserWindow 重写。这是框架移植，不是行为偏离。

## Evidence

### E1 — desktopCapturer 用物理分辨率 thumbnailSize 即可拿到窗口/显示器全尺寸静态截图

**Strength:** High
**Provenance:** A1, B1

A1（Electron desktopCapturer 官方文档）：`getSources(options)` 接受 `types: ['screen','window']` 与 `thumbnailSize`，缩略图默认仅 150x150，需自定义尺寸；返回 `DesktopCapturerSource[]`，字段含 `id`、`name`、`thumbnail`、`display_id`、`appIcon`（另有 DesktopCapturerSource 结构文档确认）。Windows 无 macOS 式屏幕录制授权要求（文档仅标注 macOS 10.15+ 需用户同意）。B1（Specter-AI screen-capture.ts:84-108）正是用 `screen.getPrimaryDisplay()` 逻辑尺寸乘 `scaleFactor` 得到物理像素，作为 `thumbnailSize` 传入，按 `display_id` 匹配后 `thumbnail.toPNG()`，并校验空图——这是打包环境可用的生产实现。

### E2 — "截屏垫底 + 全屏覆盖层拖拽选区 + 主进程裁剪"是被双重验证的区域选择形态

**Strength:** High
**Provenance:** A2, B1, B2

B2（Swen screenshot.vue:1-30, 115-135）：全屏窗口展示预截图 `<img>`，mousedown/mousemove/mouseup 拖出选区，`dpi = naturalWidth / window.screen.width` 做坐标换算，过小区域丢弃，随后调后端 `cut_image`。B1（Specter-AI screen-capture.ts:255-285）：`nativeImage.createFromBuffer` 后用 `scaleX/scaleY`（图像尺寸 ÷ 显示器逻辑尺寸）换算裁剪框，含边界钳制与最小尺寸保护，`img.crop(...).toPNG()`。A2（nativeImage 官方文档）确认 `crop(rect)`、`resize(options)`、`toPNG`、`toJPEG(quality)`、`toDataURL`、`getSize`、`getScaleFactors` 均为现成 API。本项目把 B2 的交互用 Pointer Events 重写以同时覆盖鼠标与触控（SPEC-0002 NFR-5）。

### E3 — deepseek-flash 的图片输入规则决定了缩略图/原图参数

**Strength:** High
**Provenance:** A3, A4

A3（DeepSeek Vision 官方文档）：`deepseek-flash` 在 user 消息中接受图片，OpenAI 兼容 `image_url` 内容部件，支持 base64 data URL，格式 JPEG/PNG/GIF/WebP；每张图推理前自动重缩放至约 1300x1300 总像素，单图 token 上限 1024；`detail: low` 缩到 512x512，`high`/`original` 保留原图；单边最大 8192px；system/assistant 消息带图返回 400。A4（Create Chat Completion API 参考）确认 `content` 可为内容部件数组（text/image_url/file），`image_url.url` 接受最长 8192 字符的 http(s) URL 或 base64 data URL。由此：1280px 缩略图不损失模型可见细节；原图受 8192px 单边约束；附件只能挂 user 消息。

### E4 — v1 已有完整图片管线，发送侧零改动

**Strength:** High
**Provenance:** C2, C3

C2（src/main/attachments.ts:13-58）：AttachmentStore 以文件存图、data URL 往返读取、支持 png/jpeg/webp/gif、单文件上限 4MB、删除消息时清理文件。C3（src/main/llm/client.ts:117-126 + src/main/llm/types.ts:4-5）：`ChatMessage.images` 为 data URL 数组，`wireContent` 已把带图消息转成 OpenAI 风格 `image_url` 内容部件（`detail: 'high'`）；`context.ts` 的 `historyOf` 已从消息附件还原 images。即 SPEC-0002 只需在 capture 模块产出 data URL 图片并复用 `historyOf`，LLM 客户端不需要任何改动。

### E5 — capture 是 ADR-0004 预留的空模块，无先前实现尝试

**Strength:** High
**Provenance:** C1, D1

C1（src/main/capture/index.ts:1-7）：文件只有模块边界注释，明确"v2 adds screenshot capture and selection-to-ask here"。D1：`git log --all --oneline` 全仓库仅 3 个提交（Initial commit、release: v1.0.0、docs README），`git log --all --oneline -- src/main/capture` 与 `--grep=capture` 均无结果，属可复现的 no prior attempt found。

### E6 — 1280px 缩略图/全分辨率原图的参数拆分是安全推断

**Strength:** Medium
**Provenance:** A3, B1

A3 给出服务端重采样阈值（约 1300x1300 总像素、1024 token 上限），B1 的 `toJpegBase64(png, maxWidth=1600, quality=82)` 给出一个生产参考值。本项目取 1280px（略低于服务端阈值、体积更小）作为缩略图与模型输入，全分辨率 JPEG q90 作为"保留原图"。强度记 Medium：1300x1300 是"约值"，1280px 是按宽高比留余量的工程取值，不是可精确证明的最优点；反转条件是对照实验发现公式小字在 1280px 下识别变差，则上调至 1568px 或跟随 B1 的 1600px。

## Source register

- **A1:** Electron 官方文档 desktopCapturer（getSources 的 types/thumbnailSize/fetchWindowIcons 参数、DesktopCapturerSource 字段、macOS 授权说明），https://www.electronjs.org/docs/latest/api/desktop-capturer 与 https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source (accessed 2026-10-08 via Invoke-WebRequest of the official docs pages)
- **A2:** Electron 官方文档 nativeImage（crop、resize、toPNG、toJPEG、toDataURL、getSize、getScaleFactors），https://www.electronjs.org/docs/latest/api/native-image (accessed 2026-10-08 via Invoke-WebRequest)
- **A3:** DeepSeek 官方 Vision 指南（image_url 内容部件、base64、服务端重缩放至约 1300x1300 总像素、1024 token/图上限、detail 语义、8192px 单边上限、仅 user 消息），https://api-docs.deepseek.com/guides/vision (accessed 2026-10-08 via Invoke-WebRequest)
- **A4:** DeepSeek 官方 Create Chat Completion 参考（user content 可为部件数组、image_url.url 格式与 8192 字符上限），https://api-docs.deepseek.com/api/create-chat-completion (accessed 2026-10-08 via Invoke-WebRequest)
- **B1:** Specter-AI（用户先前指定的参考项目）src/main/screen-capture.ts:84-108 物理分辨率截屏、:67-81 隐藏自身窗口与重绘等待、:255-285 scaleFactor 裁剪、:288-305 JPEG 缩放编码，https://github.com/umairinayat/Specter-AI (accessed 2026-10-08 via raw.githubusercontent.com fetch of src/main/screen-capture.ts)
- **B2:** Swen（用户先前指定的参考项目）src/views/screenshot.vue:1-30 全屏截屏垫底拖拽选区、:115-135 DPI 换算与后端裁剪调用，https://github.com/USTCKevinF/Swen (accessed 2026-10-08 via raw.githubusercontent.com fetch of src/views/screenshot.vue)
- **C1:** 仓库内 src/main/capture/index.ts:1-7，ADR-0004 预留的空模块边界 (accessed 2026-10-08 via local shell)
- **C2:** 仓库内 src/main/attachments.ts:13-58，图片附件文件存储、data URL 往返、4MB 单文件上限 (accessed 2026-10-08 via local shell)
- **C3:** 仓库内 src/main/llm/client.ts:117-126 与 src/main/llm/types.ts:4-5，images 数组转 image_url 部件、historyOf 附件还原 (accessed 2026-10-08 via local shell)
- **D1:** `git log --all --oneline`（仅 3 个提交）、`git log --all --oneline -- src/main/capture`、`git log --all --oneline --grep=capture` 均无结果，结论 no prior attempt found (accessed 2026-10-08 via local shell)

## Limitations and reversal

本记录不能证明：多显示器不同缩放比例下覆盖层坐标换算在所有 DPI 组合下无偏移（需要在真实双屏设备上实测，SPEC-0002 Edge Cases 已列入）；窗口级截图对最小化窗口、硬件加速视频窗口（DRM 画面可能黑屏）的行为；触控拖拽在全屏覆盖层上的实际手感。反转条件：若实测发现 desktopCapturer 缩略图在特定 Windows 版本/显卡组合下黑屏或模糊，则引入 B1 同款 `hideOverlay + 重绘等待` 之外的兜底（WGC 或直接 BitBlt 的原生模块），并记录新 ADR。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0011-ground-screen-capture.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
