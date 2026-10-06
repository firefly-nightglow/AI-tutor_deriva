import { useCallback, useEffect, useState } from 'react'
import type { ApiKeyStatus, LlmConfig } from '../../../shared/types'
import { toUserMessage } from '../lib/errors'
import type { ThemePreference } from '../lib/theme'

/** API key and provider settings. Self-contained so App only decides whether it is visible. */
export function SettingsPanel({
  theme,
  onThemeChange
}: {
  theme: ThemePreference
  onThemeChange(theme: ThemePreference): void
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

  const load = useCallback(async () => {
    const [keyStatus, llmConfig] = await Promise.all([
      window.api.llm.keyStatus(),
      window.api.llm.getConfig()
    ])
    setStatus(keyStatus)
    setConfig(llmConfig)
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

      {notice !== '' && <p className="hint">{notice}</p>}
    </section>
  )
}
