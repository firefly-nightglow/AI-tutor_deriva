import { useEffect, useRef, useState } from 'react'
import type { Conversation } from '../../../shared/types'
import type { ConversationGroup } from '../lib/grouping'

export interface SubjectSidebarProps {
  groups: ConversationGroup[]
  selectedConversationId: string | null
  collapsedIds: ReadonlySet<string>
  onToggleCollapsed(id: string): void
  /** Descendant totals per conversation, used by the delete confirmation (FR-11). */
  descendantCounts: Record<string, number>
  onSelectConversation(id: string): void
  onCreateConversation(subjectId: string | null): void
  onRenameConversation(id: string, title: string, subjectId: string | null): void
  onDeleteConversation(id: string): void
  onCreateSubject(name: string): void
  onRenameSubject(id: string, name: string): void
  onDeleteSubject(id: string): void
}

type Editing =
  | { kind: 'subject'; id: string; value: string }
  | { kind: 'conversation'; id: string; value: string; subjectId: string | null }
  | null

export function SubjectSidebar(props: SubjectSidebarProps): React.JSX.Element {
  const [newSubject, setNewSubject] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const confirmRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = confirmRef.current
    if (dialog === null) return
    // Guarded because jsdom (used by the tests) has no HTMLDialogElement implementation.
    if (pendingDelete === null) {
      if (typeof dialog.close === 'function') dialog.close()
    } else if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
  }, [pendingDelete])

  function submitSubject(): void {
    const name = newSubject.trim()
    if (name === '') return
    props.onCreateSubject(name)
    setNewSubject('')
  }

  function commitEditing(): void {
    if (editing === null) return
    const value = editing.value.trim()
    if (value !== '') {
      if (editing.kind === 'subject') props.onRenameSubject(editing.id, value)
      else props.onRenameConversation(editing.id, value, editing.subjectId)
    }
    setEditing(null)
  }

  return (
    <aside className="sidebar">
      <form
        className="sidebar__new-subject"
        onSubmit={(event) => {
          event.preventDefault()
          submitSubject()
        }}
      >
        <input
          value={newSubject}
          onChange={(event) => setNewSubject(event.target.value)}
          placeholder="新建科目"
          aria-label="新建科目名称"
        />
        <button type="submit">添加</button>
      </form>

      <div className="sidebar__groups">
        {props.groups.map((group) => {
          const key = group.subject?.id ?? 'unclassified'
          const isEditingSubject = editing?.kind === 'subject' && editing.id === group.subject?.id

          return (
            <section key={key} className="sidebar__group">
              <header className="sidebar__group-header">
                {isEditingSubject ? (
                  <form
                    className="inline-edit"
                    onSubmit={(event) => {
                      event.preventDefault()
                      commitEditing()
                    }}
                  >
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                      aria-label="科目名称"
                    />
                    <button type="submit">保存</button>
                    <button type="button" className="secondary" onClick={() => setEditing(null)}>
                      取消
                    </button>
                  </form>
                ) : (
                  <>
                    <h2>{group.subject?.name ?? '未分类'}</h2>
                    <div className="sidebar__group-actions">
                      <button
                        type="button"
                        className="link"
                        onClick={() => props.onCreateConversation(group.subject?.id ?? null)}
                      >
                        新建对话
                      </button>
                      {group.subject !== null && (
                        <>
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              setEditing({
                                kind: 'subject',
                                id: group.subject!.id,
                                value: group.subject!.name
                              })
                            }
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            className="link danger"
                            onClick={() => props.onDeleteSubject(group.subject!.id)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </header>

              {group.items.length === 0 ? (
                <p className="sidebar__empty">暂无对话</p>
              ) : (
                <ul className="sidebar__list">
                  {group.items.map(({ conversation, depth, hasChildren }) => {
                    const isEditing =
                      editing?.kind === 'conversation' && editing.id === conversation.id
                    const isSelected = props.selectedConversationId === conversation.id

                    return (
                      <li
                        key={conversation.id}
                        className={isSelected ? 'is-selected' : undefined}
                        style={{ paddingLeft: `${6 + Math.min(depth, 5) * 14}px` }}
                      >
                        {isEditing ? (
                          <form
                            className="inline-edit"
                            onSubmit={(event) => {
                              event.preventDefault()
                              commitEditing()
                            }}
                          >
                            <input
                              autoFocus
                              value={editing.value}
                              onChange={(event) =>
                                setEditing({ ...editing, value: event.target.value })
                              }
                              aria-label="对话标题"
                            />
                            <select
                              value={editing.subjectId ?? ''}
                              onChange={(event) =>
                                setEditing({
                                  ...editing,
                                  subjectId: event.target.value === '' ? null : event.target.value
                                })
                              }
                              aria-label="所属科目"
                            >
                              <option value="">未分类</option>
                              {props.groups
                                .filter((group2) => group2.subject !== null)
                                .map((group2) => (
                                  <option key={group2.subject!.id} value={group2.subject!.id}>
                                    {group2.subject!.name}
                                  </option>
                                ))}
                            </select>
                            <button type="submit">保存</button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setEditing(null)}
                            >
                              取消
                            </button>
                          </form>
                        ) : (
                          <>
                            {hasChildren ? (
                              <button
                                type="button"
                                className="sidebar__toggle"
                                aria-expanded={!props.collapsedIds.has(conversation.id)}
                                aria-label={props.collapsedIds.has(conversation.id) ? '展开子对话' : '折叠子对话'}
                                onClick={() => props.onToggleCollapsed(conversation.id)}
                              >
                                {props.collapsedIds.has(conversation.id) ? '▸' : '▾'}
                              </button>
                            ) : (
                              <span className="sidebar__toggle-placeholder" aria-hidden="true" />
                            )}
                            <button
                              type="button"
                              className="sidebar__item"
                              title={depth > 0 ? `子对话 L${depth}` : '主对话'}
                              onClick={() => props.onSelectConversation(conversation.id)}
                            >
                              {depth > 0 && <span className="sidebar__depth">L{depth}</span>}
                              {conversation.title}
                            </button>
                            <div className="sidebar__item-actions">
                              <button
                                type="button"
                                className="link"
                                onClick={() =>
                                  setEditing({
                                    kind: 'conversation',
                                    id: conversation.id,
                                    value: conversation.title,
                                    subjectId: conversation.subjectId
                                  })
                                }
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="link danger"
                                onClick={() => setPendingDelete(conversation)}
                              >
                                删除
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <dialog
        ref={confirmRef}
        className="confirm"
        aria-labelledby="confirm-delete-title"
        onClose={() => setPendingDelete(null)}
        onCancel={() => setPendingDelete(null)}
      >
        {pendingDelete !== null && (
          <div className="confirm__body">
            <h3 id="confirm-delete-title">删除「{pendingDelete.title}」？</h3>
            <p>
              {(props.descendantCounts[pendingDelete.id] ?? 0) > 0
                ? `将同时删除 ${props.descendantCounts[pendingDelete.id]} 个子对话。`
                : '这条对话没有子对话。'}
              删除后无法恢复。
            </p>
            <div className="confirm__actions">
              <button type="button" className="secondary" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button
                type="button"
                className="danger"
                aria-label="确认删除"
                onClick={() => {
                  props.onDeleteConversation(pendingDelete.id)
                  setPendingDelete(null)
                }}
              >
                删除
              </button>
            </div>
          </div>
        )}
      </dialog>
    </aside>
  )
}
