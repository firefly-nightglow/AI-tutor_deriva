# Task 0010: 编写教学系统提示词 v0.1 并完成 v1 验收走查

**Status:** `done`
**Created:** `2026-10-02`
**Scope ref:** `doc/specs/0001-tree-chat.md`
**Evidence ref:** `doc/research/0010-ground-teaching-prompt.md`
**Owner:** `产品所有者（本人）`
**Execution:** `HITL`
**Spec ref:** `doc/specs/0001-tree-chat.md`
**Board ref:** ``

## Context

教学系统提示词初版是 SPEC-0001 成功标准之一：从 mattpocock/skills 的 teach skill 提取"最近发展区约束（从学生已掌握的知识出发，必须引入新前置知识时先解释它）"与"回答带出处"两条核心约束，作为 system prompt 生效。随后按规格 Success Criteria 做完整验收走查。HITL：提示词效果与验收结论由产品所有者本人判定。

## Acceptance Criteria

- [x] system prompt 包含：从学生声明的知识水平出发作答、不得默认使用超出该水平的前置知识、必须引入时先解释该前置知识、关键结论附出处
- [x] 用真实学习案例（如数列极限问题）验证：模型不再默认使用积分/斯特林公式等未学内容作答
- [x] 提示词文本存放在仓库内可版本化的位置（供 v2 提示词版本化迭代）

## Plan

- [x] 起草提示词 v0.1（提取 teach skill 的两条核心约束，结合 CONTEXT.md 术语）
- [x] 按 Success Criteria 逐条走查并记录结果
- [x] 走查发现的缺陷登记为新任务

## Notes

### 2026-10-02

任务创建，来源 SPEC-0001 拆解。依赖 Task 0001-0009 全部完成。

### 2026-10-05

完成 /ad-ground：doc/research/0010-ground-teaching-prompt.md（校验 valid: true，A1/B1/C2/D1，5 条 claim）。结论：提示词作为**可版本化资产**留在仓库内（`src/main/llm/system-prompt.ts`，带版本号与 changelog），由 Task 0002 建好的上下文管线作为第一条 system 消息注入；内容从用户指定的 teach skill 提炼四条硬约束，并针对 v1 没有知识画像的现实补一条可执行替代（未声明水平时先走最基础路线并邀请补充）。具名偏离：**不把 teach skill 原样搬运**——它假设有工作区文件（MISSION.md、lessons/*.html、学习记录目录）与多轮课程结构，整段塞进 system prompt 会挤占上下文并让模型试图写文件。

实现落点：

1. 重写 `system-prompt.ts` 为 v0.1.0：四条教学约束（先判断学生已掌握什么 / 不得默认使用超出水平的前置知识 / 必须先引入时先解释它 / 关键结论给出处且不编造来源）+ 三条表达要求（Markdown + LaTeX、单步信息量、中文），并加 `TUTOR_PROMPT_VERSION` 常量与 changelog 注释。
2. 新增 `system-prompt.test.ts`（3 个用例）：版本号断言、四条约束逐条断言、以及"未声明水平"这条 v1 替代规则的存在性断言——这使验收第 1 条从"人工看一眼"变成可回归的自动化检查。
3. 新增 `doc/product/v1-acceptance-walkthrough.md`：把 SPEC-0001 的 6 条 Success Criteria 逐条对照，标注证据来源与状态（自动 / 实操 / 待验），并附上提示词对照案例清单与判定标准。

验证：163 项测试通过（新增 3 项）；typecheck 与 build 通过。

**仍未完成的两项**：

1. **对照案例（HITL）**：需要用户用自己的 API key 在 Deriva 与网页版 DeepSeek 上各问同一个问题，确认提示词确实消除了"上来就用未学工具"的行为。清单与判定标准已写入走查文档（建议用例：数列极限、AᵀA 不可逆、大数定律、陌生定理、已学内容的反向验证）。
2. **代码评审**：本任务自身的评审尚未进行。

两项完成后即可置 done，届时 v1 的十个任务全部关闭。

### 2026-10-05（验收中发现：数学定界符不兼容）

用户做提示词对照验收时反馈：AI 输出的**数学符号又变成了"乱码"**（截图见 异常复核/task 0010）。看截图后确认不是编码问题、也不是提示词失效：**Markdown 的标题、加粗、列表都正常渲染，只有公式以原始文本出现**，而且形态是 `\( ... \)` 与 `\[ ... \]`。

根因：模型这次用了**纯 LaTeX 的定界符** `\(...\)`（行内）与 `\[...\]`（独立），而渲染管线只认 remark-math 支持的 `$...$` / `$$...$$`，于是整段公式被当作普通文本显示。这与 Task 0002 时那次"乱码"根因不同——那次是压根没有 Markdown/KaTeX 渲染，这次是定界符方言不匹配。

修复：在 `lib/markdownSource.ts` 增加 `normalizeMathDelimiters`，把 `\[`/`\]` 归一成 `$$`、`\(`/`\)` 归一成 `$`，再由既有的 `normalizeDisplayMath` 完成单行块级提升；**跳过大括号包裹的代码块**（那里的反斜杠是内容而不是数学）。因为 `markdownSource` 同时是"偏移所指的那份源码"的唯一出口，引用切片与 DOM 标注自动保持一致，没有引入新的偏移漂移。

验证：166 项测试通过（新增 3 项——两种定界符的归一结果、代码块内不被改写、以及"整段用反斜杠定界符的答案能产出 katex/katex-display 且不留反斜杠"）；typecheck 与 build 通过；dev 启动自检正常。**既有历史消息无需重发即可正确渲染**，因为转换发生在渲染时。

顺带记录的边界：Task 0004 之前保存的分支引用是按旧转换规则切片的，若原文含 `\(...\)`，其引用块在新规则下可能匹配不上（分支溯源标记不显示）。影响仅限标记的显示，不影响数据；如需修正可让 `branchRanges` 同时尝试两种形态。

### 2026-10-06（代码评审与 v1 收尾）

产品所有者确认全部验证完成。代码评审查看提示词注入、提示词约束测试、v1 验收走查和数学定界符修复，并复跑验证。

评审过程中发现并修复了一个回归：`normalizeDisplayMath` 仍只提升单行 `$$...$$`，导致多行 `\[...\]` 转换后的块级公式没有被提升；已改为支持独立的多行 `$$` 块，同时保留"不成对定界符不改写"与"不跨内部 `$$` 合并"的保护。

评审留痕：`.agentic/reviews/2026-10-06T00-28-50-task-0010-tutor-prompt-acceptance.md`。结论：Standards 0 Blockers / 0 Concerns / 1 Note，Spec 0 Blockers / 0 Concerns。唯一 Note 是行内代码中的 LaTeX 示例也会被定界符归一化，属于窄边界，不影响 v1 验收。

验证：168 项测试通过（31 个文件）；`npm run typecheck`、`npm run build` 通过；GROUND-0010 记录校验通过。任务关闭。

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `done` and Notes log closes the task
