// index.ts — 插件工厂：在 dsh 会话里注册三个工具，让 agent 能自举地制作插件。
//   plugin_doc      读打包的开发文档（按主题）
//   plugin_scaffold 生成合法 tool 插件骨架源码 + patch 片段
//   plugin_validate 对源码做禁止清单静态自查
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readDoc, topicLabel, type DocTopic } from './docs.js'
import { scaffoldPlugin } from './scaffold.js'
import { validatePlugin } from './validate.js'

export const name = 'plugin-factory'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 1. 读文档
  ctx.tools.register(defineTool({
    name: 'plugin_doc',
    description: 'Read the DeepSeek Harness plugin-development contract docs (packaged with this plugin). '
      + 'Use it to look up the authoritative API contract before writing plugin code. '
      + "topics: core (required core contract), tools (defineTool + schema rules), services (services/events), "
      + 'llm (LLM adapter), compose (compose/publish/install), preset (agent preset).',
    parameters: {
      topic: {
        type: 'string',
        required: true,
        enum: ['core', 'tools', 'services', 'llm', 'compose', 'preset'],
        description: 'Which doc to read',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return readDoc(args.topic as DocTopic)
    },
  }))

  // 2. 脚手架
  ctx.tools.register(defineTool({
    name: 'plugin_scaffold',
    description: 'Generate a valid DeepSeek Harness tool-plugin skeleton (source + patch snippet). '
      + 'Returns a guaranteed-loadable minimal plugin; the agent fills in the real logic and any '
      + 'complex parameter schema afterwards (read plugin_doc topic=tools for the schema rules first).',
    parameters: {
      name: { type: 'string', required: true, description: 'Plugin name (snake/kebab), e.g. weather-tool' },
      toolName: { type: 'string', required: true, description: 'Tool name (snake_case), e.g. get_weather' },
      description: { type: 'string', required: true, description: 'What the tool does and when to use it (the model reads this)' },
      paramName: { type: 'string', description: 'Name of the first (string) parameter, default "input"' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string' },
          patch: { type: 'string' },
          hint: { type: 'string' },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `// ===== ${_args.name}.ts =====\n${value.source}\n\n// ===== patch (--patch) =====\n${value.patch}\n\n${value.hint}` },
      ],
    },
    async execute(args) {
      return scaffoldPlugin(args)
    },
  }))

  // 3. 静态校验
  ctx.tools.register(defineTool({
    name: 'plugin_validate',
    description: 'Statically check plugin source against the defineTool guard rules (missing name/apply/inject, '
      + 'output schema/render, object additionalProperties, oneOf size). '
      + 'Not a full substitute for the real guard at load time — final authority is dsh loading the plugin.',
    parameters: {
      source: { type: 'string', required: true, description: 'The plugin TypeScript source text' },
      pluginName: { type: 'string', description: 'Optional plugin name for the report header' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rule: { type: 'string' },
                severity: { type: 'string' },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const issues = value.issues ?? []
        const ok = value.ok ?? false
        const header = `${ok ? 'OK' : 'FAIL'} — ${issues.length} issue(s)${_args.pluginName ? ` for ${_args.pluginName}` : ''}`
        if (issues.length === 0) return [{ type: 'text', text: header }]
        const body = issues
          .map(i => `[${i.severity}] ${i.rule}: ${i.detail}`)
          .join('\n')
        return [{ type: 'text', text: `${header}\n${body}` }]
      },
    },
    async execute(args) {
      return validatePlugin(args)
    },
  }))
}
