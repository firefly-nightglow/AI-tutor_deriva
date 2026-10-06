import { useEffect, useMemo, useState } from 'react'
import { parseMessageAttachments } from '../../../shared/attachments'

/** Resolves stored attachment ids into data URLs so a sent picture shows up in the transcript. */
export function MessageAttachments({ raw }: { raw: string | null }): React.JSX.Element | null {
  const attachments = useMemo(() => parseMessageAttachments(raw), [raw])
  const [urls, setUrls] = useState<Record<string, string>>({})

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

  if (attachments.length === 0) return null

  return (
    <div className="message__attachments">
      {attachments.map((attachment) =>
        urls[attachment.id] === undefined ? (
          <span key={attachment.id} className="message__attachment-name">
            {attachment.name}
          </span>
        ) : (
          <img key={attachment.id} src={urls[attachment.id]} alt={attachment.name} />
        )
      )}
    </div>
  )
}
