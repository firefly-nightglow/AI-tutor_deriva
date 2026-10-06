# Review audit trail — Task 0004 branch-on-selection, attachments, drafts and theming

**Scope:** Task 0004 (selection, the floating ask button, quoting, branch creation, context strategy,
nesting) plus the follow-up fixes and the two features the user added afterwards (draft persistence and
image input) and the dark theme. No git baseline exists, so the review covers the working tree.
Reviewed state is the tree at 2026-10-04T02:48+08:00.

**Shape:** Codex single-pass two-axis review (ad-review). One reviewer, axes reported separately.
Fresh-context fidelity is not claimed; this file is the packet for an optional user-spawned reviewer.

## Change inventory (relative to Task 0003)

New: `src/shared/attachments.ts`; `src/main/attachments.ts`; `src/renderer/src/components/MessageAttachments.tsx`;
`src/renderer/src/lib/{selection,drafts,theme}.ts`; `src/renderer/src/components/__tests__/ConversationView.selection.test.tsx`;
`src/main/__tests__/attachments.test.ts`; `src/shared/__tests__/attachments.test.ts`;
`src/renderer/src/lib/__tests__/{drafts,theme}.test.ts`.

Changed: `src/shared/{types,text,ipc-channels,api}.ts`; `src/main/{index,ipc}.ts`; `src/main/db/{schema,rows}.ts`
(migration 2 adds `conversations.source_quote`); `src/main/db/repositories/conversations.ts`;
`src/main/llm/{client,context,chat-service,types,config,index}.ts`; `src/preload/index.ts`;
`src/renderer/src/{App.tsx,styles.css}`; `src/renderer/src/components/{ConversationView,ConversationPane,SubjectSidebar,SettingsPanel,MarkdownContent}.tsx`;
`src/renderer/src/lib/grouping.ts`.

New dev dependencies, agreed with the user: `jsdom`, `@testing-library/react`, `@testing-library/dom`.

## Standards sources read

- `AGENTS.md` (agentic kit `WORKFLOW.md`), `CONTEXT.md`
- `doc/adr/0001`..`doc/adr/0004` (accepted); ADR-0004 reserved `messages.attachments` for v2 messages
- `doc/research/0004-ground-branch-on-selection.md` (implementation evidence receipt)

## Spec sources read

- `doc/tasks/0004-branch-on-selection.md` — 5 acceptance criteria, 4 plan items, DoD
- `doc/specs/0001-tree-chat.md` — FR-3, FR-4, NFR-5, and the out-of-scope list
- `doc/product/PRD.md` — cost-transparency constraint

## Verification evidence gathered during this review

- `npx vitest run` — 113 tests pass (20 files). The jsdom suite covers the selection path: a paragraph
  after a promoted formula quotes without drift, a collapsed caret and an empty selection produce no
  button, and a selection over a display formula yields the LaTeX source.
- `npm run typecheck` (node + web) and `npm run build` clean; KaTeX fonts present in the bundle.
- Dev smoke check: `{"heading":"Deriva","hasBridge":true,"hasLlmBridge":true,"sidebarMounted":true,
  "groupsRendered":1,"conversationCount":0,...}`.
- User screenshots confirming the shipped behaviour: quote block renders the formula correctly, the
  dark theme applies, five levels of nesting show in the sidebar, and the composer accepts images.
- DeepSeek API reference re-read for the image content-part shape
  (`content: string | object[]`, `{type:'image_url', image_url:{url, detail}}`, data URLs allowed,
  formats JPEG/PNG/GIF/WebP) — the wire format matches the whitelist.

## Standards-axis checklist applied

Selection lifecycle and stale state, offset/coordinate consistency between render and slice, KaTeX
replacement effects on annotations, file-system side effects and their cleanup, secret-free logging,
cost of re-sending payloads, theme resolution timing versus window chrome, React effect dependencies.

## Spec-axis checklist applied

Each acceptance criterion mapped to an artefact and a verification line, plus a check that the two
user-requested additions (drafts, image input) do not contradict SPEC-0001's out-of-scope list.

## Findings summary

Standards: 0 Blockers, 2 Concerns, 3 Notes. Spec: 0 Blockers, 0 Concerns, 2 Notes.

Both Concerns are recorded below; the bounded one (attachment cleanup on conversation delete) is fixed
in the same turn, the other (re-sending history images) is recorded for a follow-up decision.

## Resolution log (post-review, same turn)

- Standards Concern 1 (attachment files were never deleted) — fixed: `AttachmentStore.removeAll(ids)`
  added, and the conversation-delete handler now collects every attachment id in the deleted subtree
  before removing the rows and unlinks those files afterwards. Covered by a unit test that deletes one
  of two stored images and asserts the other survives.
- Standards Note 3 (images written before the message row exists) — left as recorded: the write still
  happens inside the append call, so an insert failure would orphan files. It is now bounded by the
  delete path above plus the fact that the only reachable failure is an unknown conversation, which
  `start` rejects before reaching the append.
- Standards Note 4 (window background follows the OS theme, not the pinned preference) — left as
  recorded; fixing it means persisting the preference where the main process can read it.
- Standards Note 5 (silently dropping images past the cap) — fixed: the composer now shows
  `一条消息最多 4 张图片` and reports how many were ignored.
- Standards Concern 2 (history images re-sent on every turn) — recorded as an open decision in the
  Task 0004 Notes. The natural home for the policy is v2's screenshot work, which will share this
  pipeline and its cost model.
- Spec Notes 1 and 2 — informational, no action: the block-granular quote is a GROUND-0004 deviation,
  and image input deliberately reuses ADR-0004's reserved attachment field.

Post-fix verification: 114 tests pass, `npm run typecheck` clean, `npm run build` produces all three
bundles.
