import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/**
 * Electron ships no context menu of its own, so a right click inside the app does nothing by
 * default — which blocks pasting an API key. Roles keep the native behaviour (including clipboard
 * access) while the labels stay in the product language.
 */
export function attachContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const flags = params.editFlags
    const template: MenuItemConstructorOptions[] = []

    if (params.isEditable) {
      template.push(
        { role: 'undo', label: '撤销', enabled: flags.canUndo },
        { role: 'redo', label: '重做', enabled: flags.canRedo },
        { type: 'separator' },
        { role: 'cut', label: '剪切', enabled: flags.canCut },
        { role: 'copy', label: '复制', enabled: flags.canCopy },
        { role: 'paste', label: '粘贴', enabled: flags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: '全选', enabled: flags.canSelectAll }
      )
    } else if (params.selectionText.trim() !== '') {
      template.push({ role: 'copy', label: '复制', enabled: flags.canCopy })
    }

    if (template.length === 0) return
    Menu.buildFromTemplate(template).popup({ window })
  })
}
