// docs.ts — 读取打包的文档（手写契约 + 官方结构化参考 + 官方原文）。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, sep } from 'node:path'

export const DOC_TOPICS = {
  core: { file: 'CORE.md', label: '核心契约（必读）' },
  tools: { file: 'tools.md', label: '工具契约 + schema 禁止清单' },
  services: { file: 'services-events.md', label: '服务/事件/Context API' },
  llm: { file: 'llm-adapter.md', label: 'LLM 适配器' },
  compose: { file: 'compose-publish.md', label: '组合/打包/安装/发布' },
  preset: { file: 'preset.md', label: 'agent preset' },
  client: { file: 'client.md', label: '前端 UI 插件（client 侧）' },
  api: { file: 'api-index.md', label: '官方 reference 索引（权威 API 查询入口）' },
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

/**
 * 按 docs/ 内相对路径读取任意打包文档（结构化 ref/ 或官方原文 official/）。
 * 白名单约束：解析后的路径必须落在 docsDir 内，防止路径穿越。
 * @param relPath - 相对 docs/ 的路径，如 'ref/shell.md'、'official/develop/basic/tool.md'
 */
export async function readDocFile(relPath: string): Promise<string> {
  const target = resolve(docsDir, relPath)
  const root = resolve(docsDir)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`plugin_doc: path escapes the packaged docs root: ${relPath}`)
  }
  return readFile(target, 'utf8')
}

export function topicLabel(topic: DocTopic): string {
  return DOC_TOPICS[topic]?.label ?? topic
}
