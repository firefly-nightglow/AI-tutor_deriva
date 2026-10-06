# ADR-0002: API-only model access (DeepSeek official API), drop embedded web version

**Status:** `accepted`
**Date:** `2026-10-02`
**Deciders:** `产品所有者（本人）`

## Context

最初设想让用户二选一：嵌入 DeepSeek 网页版，或填写自己的 API key。但产品的三个关键机制都要求程序完全掌控对话数据与上下文注入：(1) 屏幕感知功能需要把 OCR/截图内容程序化注入对话上下文；(2) 树状对话（主/子/子子对话、书签、链路图）需要自行存储和渲染对话结构并存入 SQLite；(3) 教学系统提示词（从学生已掌握的知识出发作答）必须以 system prompt 形式生效。嵌入的网页版是封闭应用，以上三点均无受支持的实现方式，且登录态、滑块验证、页面改版会导致其随时失效。

经 DeepSeek 官方文档核实，`deepseek-flash`（DeepSeek-V4.1-Flash）支持视觉、1M 上下文、thinking 模式，输入价格约 $0.3/百万 token（高峰、cache miss），单一模型即可同时覆盖普通对话与截图理解，无需接入第二家视觉模型或强依赖本地 OCR。

## Decision

We will 仅支持用户填写自己的 DeepSeek API key 接入模型，key 仅存储于本地。架构上实现 OpenAI 兼容协议的适配层，默认模型为 `deepseek-flash`；第一版 UI 只暴露 DeepSeek，未来接其他 OpenAI 兼容厂商（Kimi、通义、智谱）仅需修改 base URL 与模型名。

## Consequences

- 正面：对话数据完全自有，树状对话、书签、上下文注入均可实现；系统提示词可生效，直接解决"AI 从学生未掌握的知识出发作答"的痛点；视觉能力现成，功能 2（屏幕感知）的技术风险从研究级降为工程级；成本对学生可忽略。
- 负面：用户需要自行注册 DeepSeek 开放平台并申请 API key（需提供新手引导）；无法免费使用网页版额度，产生按量计费（量级为每天几分钱）。
- 中性：`deepseek-v4-pro` 不支持视觉但推理能力更强，后续可评估"文本对话走 pro、截图理解走 flash"的双模型路由。

## Alternatives Considered

* Electron webview 嵌入 deepseek.com — 无法程序化注入上下文、无法拆分对话树、逆向使用随时失效。
* 本地 OCR（PaddleOCR / WinRT OCR）+ 纯文本模型 — 数学公式识别质量差，且 deepseek-flash 已原生支持视觉，不再必要（仍可作为 v2 的降本备选）。
* 接入第二家视觉模型（Qwen-VL / GLM-4V）— 多一个 provider 多一份 key 管理与账单复杂度，deepseek-flash 视觉能力核实后不再需要。
