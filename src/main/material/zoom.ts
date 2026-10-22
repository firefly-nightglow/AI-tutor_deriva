import { webContents, type WebContents } from 'electron'

const PDF_VIEWER_URL = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'
const initialPdfZoom = new WeakMap<WebContents, number>()

export async function minimumMaterialZoom(contents: WebContents): Promise<number> {
  if (!/^https?:\/\//.test(contents.getURL())) return 1
  const pdf = await contents.executeJavaScript(`document.contentType === 'application/pdf' || !!document.querySelector('embed[type="application/pdf"]')`)
  return pdf ? 1 : 0.25
}

/** Chromium's PDF guest ignores setZoomFactor on its host; operate its own zoom control instead. */
export async function zoomMaterial(contents: WebContents, factor: number): Promise<void> {
  const pdf = await contents.executeJavaScript(`document.contentType === 'application/pdf' || !!document.querySelector('embed[type="application/pdf"]')`)
  if (!pdf) {
    contents.setZoomFactor(factor)
    return
  }
  const source = contents.getURL().split('#')[0]
  for (const guest of webContents.getAllWebContents()) {
    if (guest.isDestroyed() || guest.session !== contents.session || guest.getURL() !== PDF_VIEWER_URL) continue
    const initial = initialPdfZoom.get(guest) ?? null
    const result = await guest.executeJavaScript(`(() => {
      const viewer = document.querySelector('pdf-viewer');
      if (viewer?.originalUrl?.split('#')[0] !== ${JSON.stringify(source)}) return null;
      const input = viewer.shadowRoot?.querySelector('viewer-toolbar')?.shadowRoot?.querySelector('#zoom-controls input');
      if (!input) return null;
      const base = ${JSON.stringify(initial)} ?? parseFloat(input.value) / 100;
      if (!Number.isFinite(base) || base <= 0) return null;
      input.value = String(Math.round(base * ${factor} * 100)) + '%';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return base;
    })()`)
    if (typeof result === 'number') {
      initialPdfZoom.set(guest, result)
      return
    }
  }
  throw new Error('PDF 缩放控件尚未就绪，请稍后重试或使用 PDF 内置缩放按钮。')
}
