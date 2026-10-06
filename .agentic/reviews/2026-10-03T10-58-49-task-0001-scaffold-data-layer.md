# Review audit trail — Task 0001 scaffold and SQLite data layer

**Scope:** Task 0001 of SPEC-0001, reviewed as a whole-workspace change. No git baseline exists in this
repository (the earlier `git init` was reverted), so the review covers the full tree rather than a diff
range. Reviewed state is the working tree at 2026-10-03T10:58+08:00, after the product rename to Deriva.

**Shape:** Codex single-pass two-axis review (ad-review). One reviewer, axes reported separately.
Fresh-context fidelity is not claimed; this file is the packet for an optional user-spawned reviewer.

## Change inventory

Configuration: `.gitignore`, `package.json`, `package-lock.json`, `electron.vite.config.ts`,
`tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `README.md`,
`CONTEXT.md`.

Application: `src/main/index.ts`, `src/main/ipc.ts`, `src/main/llm/index.ts`,
`src/main/capture/index.ts`, `src/main/session/index.ts`, `src/main/db/{index,schema,rows,errors}.ts`,
`src/main/db/repositories/{index,subjects,conversations,messages,bookmarks}.ts`,
`src/preload/{index.ts,index.d.ts}`, `src/shared/{types,api,ipc-channels}.ts`,
`src/renderer/index.html`, `src/renderer/src/{main.tsx,App.tsx,styles.css}`.

Tests: `src/main/db/__tests__/{schema,repositories}.test.ts`.

## Standards sources read

- `AGENTS.md` (references the agentic kit `WORKFLOW.md` as the governing constitution)
- `CONTEXT.md` (domain glossary: 主对话, 子对话, 对话书签, 学习会话, 科目, 知识画像)
- `doc/adr/0001` desktop app form factor; `doc/adr/0002` API-only model access;
  `doc/adr/0003` MVP scope; `doc/adr/0004` v1 extension points (all accepted)
- `doc/research/0001-ground-electron-sqlite-scaffold.md` (implementation evidence receipt)

## Spec sources read

- `doc/tasks/0001-project-scaffold-data-layer.md` — 7 acceptance criteria, 7 plan items, DoD
- `doc/specs/0001-tree-chat.md` (SPEC-0001) — FR-1..FR-16, NFR-1..NFR-5, success criteria
- `doc/product/PRD.md` — MVP tier scope, constraints

## Verification evidence gathered during this review

- `npx vitest run` — 17 tests pass (2 files).
- `npm run typecheck` — node and web projects both clean.
- `npm run build` — main 17.81 kB, preload 1.37 kB, renderer 644.56 kB produced.
- `npm run dev` with the renamed package — main/preload built, renderer dev server on 5173,
  Electron launched; `%APPDATA%\deriva\deriva-data\deriva.db` created with `-wal`/`-shm`;
  dev smoke check printed `{"heading":"Deriva","hasBridge":true}`.
- Runtime DB opened read-only: `user_version=1`, `journal_mode=wal`, `foreign_keys=1`,
  tables `bookmarks, conversations, messages, subjects`, `messages` includes
  `content_type` and `attachments`.
- Dev HTML fetched from `http://localhost:5173/` contains an inline `<script type="module">`
  (React Refresh preamble) while the page CSP is `default-src 'self'; style-src 'self' 'unsafe-inline'`;
  with no `script-src`, inline scripts fall back to `default-src 'self'` and are blocked.
- No emoji in docs or source (the single non-ASCII symbol found is U+2192 in the SPEC-0001 success
  criteria, a typographic arrow, not an emoji).

## Standards-axis checklist applied

Electron security guidance (contextIsolation, sandboxing, no remote content), SQLite correctness
foreign-key and cascade semantics, migration idempotency, tree query determinism, IPC trust boundary,
test coverage of the shipping path, repository naming and dead code.

## Spec-axis checklist applied

Each of the 7 acceptance criteria mapped to an artefact and a verification line; each plan item mapped
to a file; SPEC-0001 FR-9, FR-11, FR-12, FR-13 and NFR-1 cross-checked for schema support even where
the implementing task is later in the chain.

## Findings summary

Standards: 0 Blockers, 3 Concerns, 5 Notes.
Spec: 0 Blockers, 1 Concern.

No Blocker on either axis. Concerns are recorded in the session reply and resolved in the same turn
where cheap; see the Task 0001 Notes entry dated 2026-10-03 for the resolution log.

## Resolution log (post-review, same turn)

- Standards Concern 1 (tree sibling order) — fixed: `ORDER BY created_at ASC, rowid ASC` in the
  subtree query, plus a three-sibling ordering test.
- Standards Concern 2 (CSP blocks the React Refresh preamble in dev) — fixed: a serve-only
  `transformIndexHtml` plugin relaxes `script-src` for the dev server; the packaged
  `out/renderer/index.html` was re-checked and still carries the strict policy.
- Standards Concern 3 (unvalidated subject name over IPC) — fixed: validation moved into the
  repository (`trim`, reject blank, `ValidationError`) and shared by `create` and `rename`; test added.
- Standards Note 4 (`sandbox: false`) — fixed by enabling `sandbox: true`; the dev smoke check still
  reports `hasBridge: true`, so the preload works under a sandboxed renderer.
- Standards Note 5 (unhandled rejection in the dev smoke check) — fixed with try/catch.
- Standards Note 6 (generic `electronAPI` surface) — fixed by removing the unused
  `@electron-toolkit/preload` dependency and the `window.electron` bridge; the packaged preload now
  only requires `electron`.
- Standards Note 7 (timing measured on an in-memory DB only) — fixed: the file-backed WAL test now
  asserts a single append under 50 ms as well.
- Standards Note 8 (no lint config) — left open deliberately; recorded as a follow-up in the task Notes.
- Spec Concern 1 (bookmarks lacked an update path) — fixed: `updateSummary(id, summary,
  summarySource)` added with a test; FR-16 will regenerate summaries through this path.

Post-fix verification: `npx vitest run` 20 tests pass, `npm run typecheck` clean, `npm run build`
produces all three bundles, and a dev launch renders `{"heading":"Deriva","hasBridge":true}` with the
database created under `%APPDATA%\deriva\deriva-data\`.

## Fresh-context escalation (2026-10-03)

Per the user's explicit request, this file was handed to the bundled `fresh-context-reviewer` subagent
with no inherited conversation history. Its verdict as returned:

Standards — 0 Blockers, 3 Concerns, 3 Notes; Spec — no real issues found.

- Standards Concern: `schema.ts:32` — `messages.parent_id` enforces existence but not same-conversation
  membership; `bookmarks` accepts mismatched conversation/message pairs; `source_message_id` may point
  outside the parent tree. Resolved by repository-level invariant checks in `messages.append`,
  `bookmarks.create` and `conversations.create` (composite foreign keys would require a table rebuild
  and are deferred), each with a negative test.
- Standards Concern: `src/main/ipc.ts:15` — `conversations.create` forwarded unvalidated renderer input.
  Resolved by validating title, title source, subject and parent existence inside the repository.
- Standards Concern: `repositories/conversations.ts:45` and `messages.ts` — child queries ordered by
  `created_at` alone, so same-millisecond siblings had no defined order. Resolved with `rowid`
  tie-breakers plus a sibling-order test.
- Standards Notes: the ADR-0004 llm seam was a stub (implemented in Task 0002); the dev smoke check
  only asserted that `window.api` existed (now invokes `databasePath()` and `llm.keyStatus()`);
  `shell.openExternal` lacked a protocol allowlist and rejection handling (both added).

Re-verification after the fixes: 61 tests pass, typecheck and build clean, dev smoke check reports
`hasBridge`, `hasLlmBridge`, `keyStatus` and `databasePath` all healthy. No Blocker was raised on
either axis, so Task 0001 stays `done`; the Concerns were fixed rather than logged.
