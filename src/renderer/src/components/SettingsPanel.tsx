import { useCallback, useEffect, useState } from 'react'
import type { ApiKeyStatus, LlmConfig, WindowUiState } from '../../../shared/types'
import { toUserMessage } from '../lib/errors'
import type { ThemePreference } from '../lib/theme'
import {
  readPrivacyPreferences,
  savePrivacyPreferences,
  type PrivacyPreferences
} from '../lib/privacyPrefs'

/** API key and provider settings. Self-contained so App only decides whether it is visible. */
export function SettingsPanel({
  theme,
  onThemeChange,
  captureDefaultOriginal,
  onCaptureDefaultOriginalChange
}: {
  theme: ThemePreference
  onThemeChange(theme: ThemePreference): void
  captureDefaultOriginal: boolean
  onCaptureDefaultOriginalChange(value: boolean): void
}): React.JSX.Element {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [config, setConfig] = useState<LlmConfig>({
    baseUrl: '',
    model: '',
    contextStrategy: 'excerpt',
    summarySource: 'local'
  })
  const [notice, setNotice] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyPreferences>(() =>
    readPrivacyPreferences(window.localStorage)
  )
  const [displayInput, setDisplayInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [windowState, setWindowState] = useState<WindowUiState | null>(null)
  const [shortcutInput, setShortcutInput] = useState('')

  const load = useCallback(async () => {
    const [keyStatus, llmConfig, nextWindowState] = await Promise.all([
      window.api.llm.keyStatus(),
      window.api.llm.getConfig(),
      window.api.windowControl.getState()
    ])
    setStatus(keyStatus)
    setConfig(llmConfig)
    setWindowState(nextWindowState)
    setShortcutInput(nextWindowState.shortcut ?? '')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, message: string): Promise<void> {
    try {
      await action()
      setNotice(message)
      await load()
    } catch (cause) {
      setNotice(toUserMessage(cause))
    }
  }

  function updatePrivacy(next: PrivacyPreferences): void {
    setPrivacy(next)
    savePrivacyPreferences(window.localStorage, next)
  }

  function addExclusion(kind: 'display' | 'title'): void {
    const value = (kind === 'display' ? displayInput : titleInput).trim()
    if (value === '') return
    if (kind === 'display') {
      updatePrivacy({
        ...privacy,
        excludedDisplayIds: [...new Set([...privacy.excludedDisplayIds, value])]
      })
      setDisplayInput('')
    } else {
      updatePrivacy({
        ...privacy,
        excludedWindowTitles: [...new Set([...privacy.excludedWindowTitles, value])]
      })
      setTitleInput('')
    }
  }

  return (
    <section className="settings">
      <div className="settings__block">
        <h3>API Key</h3>
        <p className="mono">
          {status === null
            ? '读取中...'
            : status.hasKey
              ? '已配置（safeStorage 加密存储）'
              : status.encryptionAvailable
                ? '未配置'
                : '未配置；当前系统不可用安全存储，无法保存 Key'}
        </p>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await window.api.llm.saveKey(keyInput)
              setKeyInput('')
            }, 'API Key 已加密保存到本地。')
          }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="sk-...（仅保存在本机，不写入日志）"
            aria-label="DeepSeek API Key"
          />
          <button type="submit">保存</button>
          <button
            type="button"
            className="secondary"
            onClick={() => void run(() => window.api.llm.clearKey(), '已清除本地保存的 API Key。')}
          >
            清除
          </button>
        </form>
      </div>

      <div className="settings__block">
        <h3>外观</h3>
        <label className="settings__strategy">
          <span>主题</span>
          <select
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        {config.summarySource === 'model' && (
          <p className="hint">
            模型摘要会在每段回答之后额外调用一次模型，token 消耗相应增加；失败时自动回退本地截取。
          </p>
        )}
        <label className="settings__strategy">
          <span>书签摘要</span>
          <select
            value={config.summarySource}
            onChange={(event) =>
              setConfig({
                ...config,
                summarySource: event.target.value === 'model' ? 'model' : 'local'
              })
            }
          >
            <option value="local">本地截取首句（默认，不额外消耗）</option>
            <option value="model">模型生成摘要（每段回答多一次调用，消耗更多 token）</option>
          </select>
        </label>
      </div>

      <div className="settings__block">
        <h3>模型</h3>
        <div className="row">
          <input
            value={config.baseUrl}
            onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
            placeholder="Base URL"
            aria-label="Base URL"
          />
          <input
            value={config.model}
            onChange={(event) => setConfig({ ...config, model: event.target.value })}
            placeholder="模型名"
            aria-label="模型名"
          />
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                await window.api.llm.saveConfig(config)
              }, '模型设置已保存。')
            }
          >
            保存
          </button>
        </div>
        <label className="settings__strategy">
          <span>子对话上下文</span>
          <select
            value={config.contextStrategy}
            onChange={(event) =>
              setConfig({
                ...config,
                contextStrategy: event.target.value === 'full-chain' ? 'full-chain' : 'excerpt'
              })
            }
          >
            <option value="excerpt">仅引用片段（默认）</option>
            <option value="full-chain">引用片段 + 完整对话链</option>
          </select>
        </label>
      </div>

      <div className="settings__block">
        <h3>截图</h3>
        <label className="settings__strategy">
          <span>默认保存方式</span>
          <input
            type="checkbox"
            checked={captureDefaultOriginal}
            onChange={(event) => onCaptureDefaultOriginalChange(event.target.checked)}
          />
        </label>
        <p className="hint">
          勾选后每次截图默认保留原图，会占用更多本地空间；取消勾选则默认只保存缩略图。
        </p>
      </div>

      <div className="settings__block">
        <h3>隐私排除</h3>
        <label className="settings__strategy">
          <span>排除显示器 ID</span>
          <div className="row">
            <input
              value={displayInput}
              onChange={(event) => setDisplayInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addExclusion('display')
                }
              }}
              placeholder="例如 1"
              aria-label="排除显示器 ID"
            />
            <button type="button" onClick={() => addExclusion('display')}>
              添加
            </button>
          </div>
        </label>
        {privacy.excludedDisplayIds.length > 0 && (
          <div className="settings__exclusions">
            {privacy.excludedDisplayIds.map((id) => (
              <span key={id} className="settings__chip">
                {id}
                <button
                  type="button"
                  className="link danger"
                  onClick={() =>
                    updatePrivacy({
                      ...privacy,
                      excludedDisplayIds: privacy.excludedDisplayIds.filter((item) => item !== id)
                    })
                  }
                >
                  移除
                </button>
              </span>
            ))}
          </div>
        )}
        <label className="settings__strategy">
          <span>排除窗口标题</span>
          <div className="row">
            <input
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addExclusion('title')
                }
              }}
              placeholder="例如 私人"
              aria-label="排除窗口标题"
            />
            <button type="button" onClick={() => addExclusion('title')}>
              添加
            </button>
          </div>
        </label>
        {privacy.excludedWindowTitles.length > 0 && (
          <div className="settings__exclusions">
            {privacy.excludedWindowTitles.map((title) => (
              <span key={title} className="settings__chip">
                {title}
                <button
                  type="button"
                  className="link danger"
                  onClick={() =>
                    updatePrivacy({
                      ...privacy,
                      excludedWindowTitles: privacy.excludedWindowTitles.filter(
                        (item) => item !== title
                      )
                    })
                  }
                >
                  移除
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="settings__block">
        <h3>快捷入口</h3>
        <div className="row">
          <input
            value={shortcutInput}
            onChange={(event) => setShortcutInput(event.target.value)}
            placeholder="CommandOrControl+Shift+D"
            aria-label="全局快捷键"
          />
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                const next = await window.api.windowControl.setShortcut(
                  shortcutInput.trim() === '' ? null : shortcutInput.trim()
                )
                setWindowState(next)
              }, '快捷入口已保存。')
            }
          >
            保存
          </button>
        </div>
        {windowState?.shortcut !== null && windowState?.shortcutRegistered === false && (
          <p className="hint">该快捷键注册失败，可能已被其他应用占用，请换一个组合。</p>
        )}
      </div>

      {notice !== '' && <p className="hint">{notice}</p>}
    </section>
  )
}
