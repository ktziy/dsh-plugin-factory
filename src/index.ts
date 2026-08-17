// index.ts — 插件工厂：在 dsh 会话里注册三个工具，让 agent 能自举地制作插件。
//   plugin_doc      读打包的开发文档（按主题）
//   plugin_scaffold 生成合法 tool 插件骨架源码 + patch 片段
//   plugin_validate 对源码做禁止清单静态自查
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readDoc, type DocTopic } from './docs.js'
import {
  scaffoldPlugin, scaffoldClientPlugin, scaffoldServicePlugin, scaffoldEventPlugin,
  scaffoldLlmAdapterPlugin, scaffoldConversationNodePlugin,
} from './scaffold.js'
import { validatePlugin, validateClientPlugin } from './validate.js'

export const name = 'plugin-factory'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 1. 读文档
  ctx.tools.register(defineTool({
    name: 'plugin_doc',
    description: 'Read the DeepSeek Harness plugin-development contract docs (packaged with this plugin). '
      + 'Use it to look up the authoritative API contract before writing plugin code. '
      + "topics: core (required core contract), tools (defineTool + schema rules), services (services/events), "
      + 'llm (LLM adapter), compose (compose/publish/install), preset (agent preset), client (Web UI plugins), '
      + 'api (official reference index: where to look up every ctx service/event).',
    parameters: {
      topic: {
        type: 'string',
        required: true,
        enum: ['core', 'tools', 'services', 'llm', 'compose', 'preset', 'client', 'api'],
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
    description: 'Generate a DeepSeek Harness plugin skeleton. '
      + 'kind=tool: host tool plugin (defineTool). kind=service: host Service class. kind=event: host event listener. '
      + 'kind=llm-adapter: host LLM adapter. kind=client: Web UI plugin (settings.section slot). '
      + 'kind=client-node: Web UI conversation node. Returns files to write plus next-step hints.',
    parameters: {
      kind: { type: 'string', enum: ['tool', 'service', 'event', 'llm-adapter', 'client', 'client-node'], description: 'Which plugin kind to scaffold (default tool)' },
      name: { type: 'string', required: true, description: 'Plugin/package name (kebab), e.g. weather-tool' },
      toolName: { type: 'string', description: '(tool) Tool name snake_case' },
      description: { type: 'string', description: '(tool) Tool description the model reads' },
      paramName: { type: 'string', description: '(tool) First string parameter name' },
      serviceName: { type: 'string', description: '(service) Service name mounted on ctx, e.g. metrics' },
      eventName: { type: 'string', description: '(event) Event name to listen, e.g. tools/result' },
      eventDesc: { type: 'string', description: '(event) What the listener does' },
      adapterClass: { type: 'string', description: '(llm-adapter) Adapter class name, e.g. MyProviderAdapter' },
      providerName: { type: 'string', description: '(llm-adapter) Provider route name, e.g. my-provider' },
      sectionId: { type: 'string', description: '(client) Settings section id (kebab)' },
      sectionLabel: { type: 'string', description: '(client) Settings section nav label' },
      nodeKind: { type: 'string', description: '(client-node) Node kind (kebab), e.g. review-job' },
      nodeLabel: { type: 'string', description: '(client-node) Node display label' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
          hint: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const files = value.files ?? []
        const body = files.map(f => `// ===== ${f.path} =====\n${f.content}`).join('\n\n')
        return [{ type: 'text', text: `${body}\n\n${value.hint ?? ''}` }]
      },
    },
    async execute(args) {
      switch (args.kind) {
        case 'service':
          return scaffoldServicePlugin({ name: args.name, serviceName: args.serviceName ?? '' })
        case 'event':
          return scaffoldEventPlugin({ name: args.name, eventName: args.eventName ?? '', eventDesc: args.eventDesc ?? '' })
        case 'llm-adapter':
          return scaffoldLlmAdapterPlugin({ name: args.name, adapterClass: args.adapterClass ?? '', providerName: args.providerName ?? '' })
        case 'client':
          return scaffoldClientPlugin({ name: args.name, sectionId: args.sectionId ?? '', sectionLabel: args.sectionLabel ?? '' })
        case 'client-node':
          return scaffoldConversationNodePlugin({ name: args.name, nodeKind: args.nodeKind ?? '', nodeLabel: args.nodeLabel ?? '' })
        default: {
          const tool = scaffoldPlugin({ name: args.name, toolName: args.toolName ?? '', description: args.description ?? '', paramName: args.paramName })
          return {
            files: [
              { path: `${args.name}.ts`, content: tool.source },
              { path: `${args.name}.patch.yml`, content: tool.patch },
            ],
            hint: tool.hint,
          }
        }
      }
    },
  }))

  // 3. 静态校验
  ctx.tools.register(defineTool({
    name: 'plugin_validate',
    description: 'Statically check plugin source against the guard rules. '
      + 'kind=tool: defineTool host rules (missing name/apply/inject, output schema/render, object additionalProperties, oneOf size). '
      + 'kind=client: client-side UI rules (apply/inject, slots usage). '
      + 'Not a full substitute for the real guard at load time — final authority is dsh loading the plugin.',
    parameters: {
      kind: { type: 'string', enum: ['tool', 'client'], description: 'Which plugin kind to validate (default tool)' },
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
      return args.kind === 'client' ? validateClientPlugin(args) : validatePlugin(args)
    },
  }))
}
