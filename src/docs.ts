// docs.ts — 读取打包的拆分文档。docs/ 与 src/、lib/ 都只隔一层，`..` 统一指向包根。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const DOC_TOPICS = {
  core: { file: 'CORE.md', label: '核心契约（必读）' },
  tools: { file: 'tools.md', label: '工具契约 + schema 禁止清单' },
  services: { file: 'services-events.md', label: '服务/事件/Context API' },
  llm: { file: 'llm-adapter.md', label: 'LLM 适配器' },
  compose: { file: 'compose-publish.md', label: '组合/打包/安装/发布' },
  preset: { file: 'preset.md', label: 'agent preset' },
} as const

export type DocTopic = keyof typeof DOC_TOPICS

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs')

export async function readDoc(topic: DocTopic): Promise<string> {
  const entry = DOC_TOPICS[topic]
  if (!entry) {
    const keys = Object.keys(DOC_TOPICS).join(', ')
    throw new Error(`unknown topic "${topic}"; available: ${keys}`)
  }
  return readFile(join(docsDir, entry.file), 'utf8')
}

export function topicLabel(topic: DocTopic): string {
  return DOC_TOPICS[topic]?.label ?? topic
}
