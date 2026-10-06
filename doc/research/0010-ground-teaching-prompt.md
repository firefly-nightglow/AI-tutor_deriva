# GROUND-0010: 教学系统提示词 v0.1 与 v1 验收走查

**Status:** recorded
**Decision:** 教学提示词作为 v0.1 固化在 src/main/llm/system-prompt.ts（带版本号与改动说明），由既有上下文管线作为**第一条 system 消息**注入；内容从 teach skill 提炼四条硬约束——从学生声明/已表现出的水平出发、不默认使用超出该水平的前置知识、必须引入新前置知识时先解释它、关键结论给出处——并补一条 v1 特有的处理：学生未声明水平时先按最基础路线作答并邀请其说明已学内容（因为知识画像要 v3 才有）。v1 验收走查写成一份逐条对照 Success Criteria 的记录，能在自动化里证的标注证据，只有真实 API key 才能证的标注为待用户实操。
**Decision ref:** doc/tasks/0010-tutor-prompt-acceptance.md
**Confidence:** Strong

## Decision and confidence

Happy path：提示词放在仓库内的 TS 模块里而不是直接写进调用处，理由与 ADR-0004 的扩展点一致——它是**可版本化的产品资产**，Task 0002 已经把它作为 `assembleContext` 的第一条 system 消息注入（C1），所以 v0.1 只需要把内容写扎实、把版本号与改动记录留在文件里。DeepSeek 的 API 参考把 `system` 定义为消息角色之一（A1），这正是提示词生效的机制。

内容依据来自用户指定的 teach skill（B1）。它的三条做法直接对应本产品的痛点：用 learning records 计算最近发展区（原文：These should be used to calculate the zone of proximal development）、不信任模型自己的记忆（原文：Never trust your parametric knowledge）、关键论断要带引用（原文：Lessons should be littered with citations - links to external resources to back up any claim made）。本产品的 v1 只实现其中的**约束**部分（回答贴合水平、带出处），而"用学习记录算 ZPD"需要 v3 的知识画像，因此 v0.1 用一条可执行的替代规则补位：学生没声明水平时，先给最基础、不依赖高级工具的解法，并请其补充已学内容。

一处具名偏离：

1. **不把 teach skill 原样写进 system prompt**。该 skill 是为"在某个工作区里持续教学"设计的流程文档（MISSION.md、lessons/*.html、RESOURCES.md、学习记录目录），体量大且假设有文件系统与多轮课程结构；我们的产品是即时问答，把它整段塞进 system prompt 会挤占上下文、并让模型试图写文件。因此只提炼可迁移的约束（水平锚定、先解释前置、带出处），其余（课程编排、交互式课件、社区）留在后续版本按需引入。

Axis-2 verdict: Strong。提示词注入机制有 API 文档与仓库既有实现双重确认；内容约束有用户指定参考的原文支撑；唯一的取舍（不整段搬运）有参考文档自身的结构差异作为理由。

## Evidence

### E1 — 提示词以 system 消息注入，位置在上下文管线最前

**Strength:** High
**Provenance:** A1, C1

A1（DeepSeek API 参考）把 `system` 列为消息角色之一，与 user/assistant 并列，用于给出全局指令。C1（src/main/llm/context.ts 的 `assembleContext`）已实现"system prompt → 可插拔 context blocks → 对话链"的顺序，Task 0002 的集成测试断言过模型收到的第一条消息就是 system prompt。因此本任务不需要改调用链，只需要改提示词内容。

### E2 — 水平锚定与出处要求来自用户指定的教学参考

**Strength:** High
**Provenance:** B1

B1（mattpocock/skills 的 teach SKILL.md）给出三条与本产品痛点直接对应的做法：learning records 用于计算 zone of proximal development；Never trust your parametric knowledge；Lessons should be littered with citations。本任务的四条硬约束正是这三条的工程化改写（把"记录驱动"降级为"声明驱动"，因为 v1 没有知识画像）。

### E3 — 参考文档的形态与本产品不同，不能整段搬运

**Strength:** Medium
**Provenance:** B1

B1 自身描述的是一个教学工作区：MISSION.md、reference/*.html、lessons/*.html、assets/、NOTES.md 等。这些假设本产品不存在（即时问答、无文件系统工作区），因此只提炼约束而保留结构。强度记 Medium：这是对两份文档用途差异的判断，不是可测量的结论。

### E4 — 仓库内已有提示词落点与验收依据

**Strength:** High
**Provenance:** C1, C2

C1：`src/main/llm/system-prompt.ts` 已导出 `TUTOR_SYSTEM_PROMPT_V0` 并被 chat service 使用，本任务在其上迭代并加版本号。C2：SPEC-0001 的 Success Criteria 列举了 6 条可观察结果（3 层嵌套、多栏开关、重启不丢、FR-3/5/6/7/9 手动验收、API key + 提示词生效、20 轮内 2 次点击定位），本任务的走查记录逐条对照它们。

### E5 — 仓库无历史提交

**Strength:** High
**Provenance:** D1

D1：`git log` 与 `git status` 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，属可复现的 no prior attempt found。

## Source register

- **A1:** DeepSeek 官方 API 参考 Create Chat Completion，`system` 角色与消息数组结构，https://api-docs.deepseek.com/api/create-chat-completion (accessed 2026-10-03 via curl fetch of official docs page)
- **B1:** mattpocock/skills 的 teach SKILL.md，最近发展区、Never trust your parametric knowledge、Lessons should be littered with citations，https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md (accessed 2026-10-05 via the local copy saved from an earlier successful fetch of raw.githubusercontent.com; a re-fetch on this date was rate-limited)
- **C1:** 仓库内 `src/main/llm/system-prompt.ts` 与 `src/main/llm/context.ts` 的 assembleContext，system prompt 作为第一条消息注入 (accessed 2026-10-05 via local shell)
- **C2:** 仓库内 `doc/specs/0001-tree-chat.md` 的 Success Criteria 六条与 `doc/tasks/0010-tutor-prompt-acceptance.md` 的验收项 (accessed 2026-10-05 via local shell)
- **D1:** git log 与 git status 在 D:\projects\ai-tutor 均返回 fatal: not a git repository，结论 no prior attempt found (accessed 2026-10-05 via local shell)

## Limitations and reversal

本记录不能证明：提示词在真实模型上是否真的消除了"用未学工具作答"的行为——这需要用户用自己的 API key 跑对照案例（有/无提示词各问一次数列极限这类问题），属本任务标记 HITL 的部分；也不能证明提示词长度对回答质量的影响（当前只有少量规则）。反转条件：若对照案例显示模型仍默认使用积分/斯特林公式等未学内容，则加强约束的措辞（例如把"不要默认使用"改为"在给出高级解法前必须先确认学生是否学过该工具"）并重跑案例。

## Audit path

Run `node .agents/skills/ad-ground/scripts/validate-record.mjs doc/research/0010-ground-teaching-prompt.md`, then reopen every source in the register. Structural validity proves the map, not the source content.
