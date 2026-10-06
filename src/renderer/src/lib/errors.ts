/**
 * Turns a rejected IPC call into something worth showing a user.
 *
 * Electron prefixes handler rejections with `Error invoking remote method '<channel>': Error: `,
 * which is noise in the UI; the domain message underneath is already written for the reader.
 */
export function toUserMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '').trim()
}
