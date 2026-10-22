import { useEffect, useMemo, useState } from 'react'
import { parseMessageAttachments } from '../../../shared/attachments'

/** Resolves stored attachment ids into data URLs so a sent picture shows up in the transcript. */
export function MessageAttachments({ raw }: { raw: string | null }): React.JSX.Element | null {
  const attachments = useMemo(() => parseMessageAttachments(raw), [raw])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    if (attachments.length === 0) return
    let cancelled = false
    void Promise.all(
      attachments.map(async (attachment) => [attachment.id, await window.api.attachments.read(attachment.id)] as const)
    ).then((entries) => {
      if (cancelled) return
      setUrls(
        Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => entry[1] !== null)
        )
      )
    })
    return () => {
      cancelled = true
    }
  }, [attachments])

  useEffect(() => {
    if (viewer === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setViewer(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewer])

  if (attachments.length === 0) return null

  return (
    <div className="message__attachments">
      {attachments.map((attachment) => {
        const url = urls[attachment.id]
        if (url === undefined) {
          return (
            <span key={attachment.id} className="message__attachment-name">
              {attachment.name}
            </span>
          )
        }
        return (
          <figure key={attachment.id} className="message__attachment">
            <button
              type="button"
              className="message__attachment-button"
              aria-label={`查看 ${attachment.name}`}
              onClick={() => setViewer({ url, name: attachment.name })}
            >
              <img src={url} alt={attachment.name} />
            </button>
            {attachment.captureVariant !== undefined && (
              <figcaption className="message__attachment-caption">
                {attachment.captureVariant === 'original' ? '原图' : '仅保留缩略图'}
              </figcaption>
            )}
          </figure>
        )
      })}

      {viewer !== null && (
        <div className="attachment-viewer" role="dialog" aria-modal="true" aria-label="查看附件">
          <button type="button" className="secondary" onClick={() => setViewer(null)}>
            关闭
          </button>
          <img src={viewer.url} alt="查看附件原图" />
        </div>
      )}
    </div>
  )
}
