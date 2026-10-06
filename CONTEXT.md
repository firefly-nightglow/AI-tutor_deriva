# Deriva - Domain Glossary

_Lazy artifact - only contains terms that have been resolved through grilling, spec drafting, or explicit capture. Empty entries are worse than no entry; speculation belongs elsewhere._

_Maintained by `/ad-domain`._

## Language

### 主对话 (Conversation)

**Definition:** 一次完整学习问答的顶层对话容器，归属于一个科目，其输出内容可被选中并派生子对话；用户在完全理解上一轮输出后的进一步提问仍留在同一主对话内。

_Avoid_: 线程、thread、session — "session" 已预留给学习会话，"thread" 易与实现层线程混淆。

### 子对话 (Branch)

**Definition:** 用户选中主对话（或上层子对话）输出中的公式、定理或推导步骤后发起的追问，与被选内容形成父子包含关系，可无限嵌套（子子对话）。

_Avoid_: 分支对话、fork — "fork" 在 git 语境下有既有含义。

### 对话书签 (Bookmark)

**Definition:** 同一对话内 AI 每段输出自动总结生成的导航条目，竖直排列于对话框边缘，点击即跳转到对应输出位置。

### 学习会话 (Study Session)

**Definition:** 用户点击"开始学习"到"结束学习"（可暂停）之间的时间段，期间 AI 读取屏幕内容，结束后产出纪要式总结、思维导图与检验提问。

_Avoid_: 课程、lesson — "lesson" 易与教学课件混淆。

### 科目 (Subject)

**Definition:** 用户自建的对话分类单位（如"线性代数"），主对话按科目分组、科目内按时间排序，默认归入"未分类"。

### 知识画像 (Knowledge Profile)

**Definition:** 系统持续维护的"学生已掌握/未掌握知识"档案，作为系统提示词的一部分约束 AI 从学生已掌握的知识出发作答（源自 teach skill 的 learning-records 与最近发展区思想，v3 落地）。

## Relationships

- 一个**科目**包含多个**主对话**，主对话在科目内按时间排序。
- 一个**主对话**包含多个**子对话**，子对话可递归包含子对话，形成树。
- 一段 AI 输出对应一个**对话书签**；一次选中追问产生一个**子对话**。
- 一次**学习会话**期间产生的屏幕内容与问答，汇入**知识画像**。

## Flagged ambiguities

(empty)
