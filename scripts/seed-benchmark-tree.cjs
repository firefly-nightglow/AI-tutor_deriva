/**
 * One-off benchmark seeder for the NFR-4 check (see Task 0005).
 *
 * Creates a 1000-node conversation tree (1 root + 999 descendants, 4-ary) under a dedicated subject
 * so the sidebar can be exercised at scale. Run it with the app closed:
 *
 *   node scripts/seed-benchmark-tree.cjs
 *
 * Remove the benchmark afterwards by deleting the 「性能基准」 subject in the app, which cascades the
 * whole tree; attachment files are unaffected because the seeded messages carry none.
 */
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const Database = require('better-sqlite3')

const NODES = Number(process.argv[2] ?? 1000)
const SUBJECT_NAME = '性能基准'
const file = join(process.env.APPDATA, 'deriva', 'deriva-data', 'deriva.db')

const db = new Database(file)
db.pragma('foreign_keys = ON')
const now = Date.now()

const existing = db.prepare('SELECT id FROM subjects WHERE name = ?').get(SUBJECT_NAME)
if (existing) {
  console.log(`benchmark subject already exists (${existing.id}); delete it in the app first`)
  db.close()
  process.exit(0)
}

const subjectId = randomUUID()
const insertSubject = db.prepare(
  'INSERT INTO subjects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
)
const insertConversation = db.prepare(
  `INSERT INTO conversations (
     id, subject_id, parent_conversation_id, source_message_id, source_quote,
     title, title_source, model, created_at, updated_at
   ) VALUES (?, ?, ?, NULL, NULL, ?, 'manual', NULL, ?, ?)`
)
const insertMessage = db.prepare(
  `INSERT INTO messages (
     id, conversation_id, parent_id, role, content, content_type,
     attachments, model, status, created_at, updated_at
   ) VALUES (?, ?, NULL, 'assistant', ?, 'text', NULL, 'deepseek-flash', 'complete', ?, ?)`
)

const seed = db.transaction(() => {
  insertSubject.run(subjectId, SUBJECT_NAME, now, now)
  const ids = []
  for (let index = 0; index < NODES; index += 1) {
    const id = randomUUID()
    const parentId = index === 0 ? null : ids[Math.floor((index - 1) / 4)]
    insertConversation.run(id, subjectId, parentId, `基准节点 ${index}`, now + index, now + index)
    insertMessage.run(randomUUID(), id, `基准节点 ${index} 的回答内容`, now + index, now + index)
    ids.push(id)
  }
  return ids[0]
})

const rootId = seed()
console.log(`seeded ${NODES} conversations under subject "${SUBJECT_NAME}"`)
console.log(`root conversation id: ${rootId}`)
console.log('open the app, time expanding the tree, then delete the subject to clean up')
db.close()
