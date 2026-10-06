import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ContextStrategy, LlmConfig, SummarySource } from '../../shared/types'
import { ValidationError } from '../db/errors'

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  contextStrategy: 'excerpt',
  summarySource: 'local'
}

const CONTEXT_STRATEGIES: readonly ContextStrategy[] = ['excerpt', 'full-chain']
const SUMMARY_SOURCES: readonly SummarySource[] = ['local', 'model']

export interface LlmConfigStore {
  read(): LlmConfig
  save(config: LlmConfig): LlmConfig
}

/** Non-secret provider settings, kept next to the encrypted key so other OpenAI-compatible hosts are a config change. */
export function createLlmConfigStore(filePath: string): LlmConfigStore {
  function normalize(config: LlmConfig): LlmConfig {
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim().replace(/\/+$/, '') : ''
    const model = typeof config.model === 'string' ? config.model.trim() : ''
    if (!/^https?:\/\/.+/.test(baseUrl)) throw new ValidationError('baseUrl 必须是 http(s) 地址')
    if (model === '') throw new ValidationError('模型名不能为空')
    const contextStrategy = CONTEXT_STRATEGIES.includes(config.contextStrategy)
      ? config.contextStrategy
      : DEFAULT_LLM_CONFIG.contextStrategy
    const summarySource = SUMMARY_SOURCES.includes(config.summarySource)
      ? config.summarySource
      : DEFAULT_LLM_CONFIG.summarySource
    return { baseUrl, model, contextStrategy, summarySource }
  }

  return {
    read() {
      if (!existsSync(filePath)) return { ...DEFAULT_LLM_CONFIG }
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<LlmConfig>
        return normalize({ ...DEFAULT_LLM_CONFIG, ...parsed })
      } catch {
        return { ...DEFAULT_LLM_CONFIG }
      }
    },
    save(config) {
      const normalized = normalize(config)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8')
      return normalized
    }
  }
}
