export const CAPTURE_ORIGINAL_DEFAULT_KEY = 'deriva.capture.keepOriginalDefault'

/** FR-5: the per-capture checkbox starts from this global preference, defaulting to thumbnail. */
export function readCaptureOriginalDefault(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(CAPTURE_ORIGINAL_DEFAULT_KEY) === '1'
  } catch {
    return false
  }
}

export function saveCaptureOriginalDefault(
  storage: Pick<Storage, 'setItem'> | null,
  value: boolean
): void {
  try {
    storage?.setItem(CAPTURE_ORIGINAL_DEFAULT_KEY, value ? '1' : '0')
  } catch {
    // Storage unavailable: the preference still applies for this session.
  }
}
