/**
 * Incremental server-sent-events decoder.
 *
 * Wire format per MDN: messages are separated by a pair of newlines, each field is `name: value`,
 * and a line starting with a colon is a comment (servers use it for keep-alive). Chunks arrive at
 * arbitrary boundaries, so partial lines stay buffered until their newline arrives.
 */
export interface SseEvent {
  data: string
  event?: string
}

export class SseDecoder {
  private pending = ''
  private dataLines: string[] = []
  private eventName: string | undefined

  push(chunk: string): SseEvent[] {
    this.pending += chunk
    const events: SseEvent[] = []
    let newlineIndex = this.pending.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.pending.slice(0, newlineIndex).replace(/\r$/, '')
      this.pending = this.pending.slice(newlineIndex + 1)
      const event = this.consumeLine(line)
      if (event) events.push(event)
      newlineIndex = this.pending.indexOf('\n')
    }
    return events
  }

  /** Dispatches a trailing event when the stream ends without a final blank line. */
  flush(): SseEvent[] {
    const trailing = this.pending.replace(/\r$/, '')
    this.pending = ''
    const events: SseEvent[] = []
    if (trailing !== '') {
      const event = this.consumeLine(trailing)
      if (event) events.push(event)
    }
    const last = this.dispatch()
    if (last) events.push(last)
    return events
  }

  private consumeLine(line: string): SseEvent | undefined {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return undefined

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') this.dataLines.push(value)
    else if (field === 'event') this.eventName = value
    return undefined
  }

  private dispatch(): SseEvent | undefined {
    if (this.dataLines.length === 0) {
      this.eventName = undefined
      return undefined
    }
    const event: SseEvent = { data: this.dataLines.join('\n') }
    if (this.eventName !== undefined) event.event = this.eventName
    this.dataLines = []
    this.eventName = undefined
    return event
  }
}
