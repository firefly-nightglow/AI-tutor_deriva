# Review audit trail — Task 0003 main conversation UI and subject management

**Scope:** Task 0003 (subject sidebar, conversation pane, composer, local title derivation, empty
states) plus the IPC surface it added. No git baseline exists, so the review covers the working tree.
Reviewed state is the tree at 2026-10-03T19:39+08:00.

**Shape:** Codex single-pass two-axis review (ad-review). One reviewer, axes reported separately.
Fresh-context fidelity is not claimed; this file is the packet for an optional user-spawned reviewer.

## Change inventory (relative to Task 0002)

New: `src/shared/text.ts`; `src/renderer/src/components/SubjectSidebar.tsx`, `ConversationView.tsx`,
`ConversationPane.tsx`, `SettingsPanel.tsx`; `src/renderer/src/lib/grouping.ts`; tests
`src/shared/__tests__/text.test.ts`,
`src/renderer/src/components/__tests__/{SubjectSidebar,ConversationView}.test.tsx`,
`src/renderer/src/lib/__tests__/grouping.test.ts`.

Changed: `src/shared/{ipc-channels,api}.ts` (five write channels plus a dedicated `listRoots` channel),
`src/main/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts` (dev smoke check now reports sidebar
mount, group count and conversation count), `src/renderer/src/App.tsx` (rewritten as the shell),
`src/renderer/src/styles.css` (rewritten as a two-column work layout).

## Standards sources read

- `AGENTS.md` (agentic kit `WORKFLOW.md`), `CONTEXT.md` (主对话 / 子对话 / 科目 vocabulary)
- `doc/adr/0001`..`doc/adr/0004` (accepted)
- `doc/research/0003-ground-conversation-ui.md` (implementation evidence receipt)

## Spec sources read

- `doc/tasks/0003-main-conversation-subjects-ui.md` — 6 acceptance criteria, 5 plan items, DoD
- `doc/specs/0001-tree-chat.md` — FR-1, FR-2, FR-9, FR-10, FR-12, FR-14, NFR-5
- `doc/product/PRD.md` — MVP tier, Chinese-first audience

## Verification evidence gathered during this review

- `npx vitest run` — 83 tests pass (14 files), including server-rendered assertions for the sidebar
  grouping, markdown/KaTeX output, model badge, disabled composer and empty state.
- `npm run typecheck` and `npm run build` clean.
- Dev smoke check: `{"sidebarMounted":true,"groupsRendered":1,"conversationCount":0,...}`.
- User screenshots (19:19 and 19:24) showing the shipped UI with three conversations, a six-message
  conversation, KaTeX-rendered formulas, the `deepseek-flash` badge and an `已取消` message.

## Standards-axis checklist applied

React state ownership and effect dependencies, streaming lifecycle (start → delta → terminal),
renderer/IPC error surfacing, subscription churn, focus and disabled-state handling, accessibility
labels, dead API surface.

## Spec-axis checklist applied

Each acceptance criterion mapped to an artefact and a verification line: subject CRUD with duplicate
rejection and a visible message, sidebar grouping and re-homing, multi-turn answers with markdown and
KaTeX plus a model badge, local title derivation and manual rename, blank-input and double-submit
guards with an empty state, and restart persistence.

## Findings summary

Standards: 0 Blockers, 2 Concerns, 2 Notes. Spec: 0 Blockers, 1 Concern.

All three Concerns were fixed in the same turn; the Notes are recorded for later tasks.

## Resolution log (post-review, same turn)

- Standards Concern 1 (streaming buffer never cleared) — fixed: `ConversationPane` now clears
  `streamingText` after the terminal `reload()` resolves, so a finished answer renders once as the
  stored message instead of twice.
- Standards Concern 2 (unstable `onConversationChanged`) — fixed: `App` wraps it in `useCallback`, so
  the pane's subscription effect no longer re-subscribes on every parent render.
- Spec Concern 1 (English, IPC-wrapped error text) — fixed two ways: user-facing domain errors are now
  Chinese (`「X」已存在，请换一个名字。`, `科目名称不能为空`, `对话标题不能为空`, `找不到对话（id）`,
  `API Key 不能为空`), and a new `src/renderer/src/lib/errors.ts` strips Electron's
  `Error invoking remote method '<channel>': Error: ` prefix before the message reaches the UI.
- Standards Note 1 (stream keeps running when the pane unmounts) — recorded for Task 0007.
- Standards Note 2 (`listBySubject` unused by the renderer) — kept deliberately for Task 0005/0007.

Post-fix verification: 85 tests pass (the new `toUserMessage` test covers the wrapper stripping and the
untouched-message case), `npm run typecheck` clean, `npm run build` produces all three bundles.
