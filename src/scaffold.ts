// scaffold.ts — 生成合法的 tool 插件骨架源码（确定性模板，不调 LLM）。
// 产物是「绝对合法、可直接跑」的最小骨架，参数部分留 TODO 让 agent 按 tools.md 填写。

export interface ScaffoldInput {
  name: string        // 插件名（snake/kebab），如 'weather-tool'
  toolName: string    // 工具名（snake_case），如 'get_weather'
  description: string // 工具说明（模型看到）
  paramName?: string  // 第一个参数名，默认 'input'
}

export interface ScaffoldOutput {
  source: string  // 完整插件源码
  patch: string   // --patch 加载片段（绝对路径占位）
  hint: string    // 后续步骤提示
}

function kebabToSnake(s: string): string {
  return s.replace(/-/g, '_')
}

export function scaffoldPlugin(input: ScaffoldInput): ScaffoldOutput {
  const name = input.name.trim() || 'my-plugin'
  const toolName = kebabToSnake(input.toolName.trim() || 'my_tool')
  const description = input.description.trim() || 'Describe what this tool does and when to use it.'
  const paramName = input.paramName?.trim() || 'input'
  const paramDesc = `The ${paramName} to process`

  const source = `import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = '${name}'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: '${toolName}',
    description: ${JSON.stringify(description)},
    parameters: {
      ${paramName}: { type: 'string', required: true, description: ${JSON.stringify(paramDesc)} },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      // TODO: 在这里实现你的逻辑。args 已按 parameters 校验并推导类型。
      // 硬规则：返回值必须符合 output.schema；抛异常 = isError；遵守 exec.signal。
      return \`processed \${args.${paramName}}\`
    },
  }))
}
`

  const patch = `# 加载该插件（--patch）：
- insert:
    - id: ${name}
      # Windows 必须 file:///C:/... ；Unix 用 /absolute/path/to/...
      name: 'file:///C:/absolute/path/to/${name}.ts'
`

  const hint = `下一步：
1. 把 source 写入 ${name}.ts（用 fs 工具）。
2. 若要加更多参数/复杂 schema（嵌套 object、oneOf、enum），先读 plugin_doc(topic='tools') 的 §3 禁止清单，避免注册即 FAILED。
3. 加载验证：无模型自测用 ctx.tools.execute；端到端用 headless。详见 plugin_doc(topic='compose')。`

  return { source, patch, hint }
}

// ===== client（前端 UI）插件脚手架 =====

export interface ScaffoldClientInput {
  name: string          // 包名（kebab），如 'my-settings-ui'
  sectionId: string     // 设置节 id（kebab），如 'my-settings'
  sectionLabel: string  // 设置节导航显示名，如 'My Settings'
}

export interface ScaffoldFile {
  path: string
  content: string
}

export interface ScaffoldClientOutput {
  files: ScaffoldFile[]
  hint: string
}

function toPascal(s: string): string {
  return s.split(/[-_\s]+/).filter(Boolean).map(w => w[0]!.toUpperCase() + w.slice(1)).join('') || 'MySection'
}

/**
 * 生成一个最小可渲染的 client UI 插件：注册一个 React 组件到 settings.section 槽位。
 * 产物 = 同一 npm 包的两面：host 半（空 apply）+ client 半（slots 挂组件）+ dsh.client/dsh.bundle 声明。
 */
export function scaffoldClientPlugin(input: ScaffoldClientInput): ScaffoldClientOutput {
  const name = input.name.trim() || 'my-ui-plugin'
  const sectionId = (input.sectionId.trim() || 'my-section').replace(/[-_\s]+/g, '-')
  const sectionLabel = input.sectionLabel.trim() || 'My Section'
  const component = toPascal(sectionId) + 'View'

  const packageJson = JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    main: 'lib/index.js',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './client': { types: './lib/client.d.ts', default: './lib/client.js' },
      './package.json': './package.json',
    },
    dsh: {
      client: {
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-ui-slots',
          '@deepseek-ai/dsh-client-ui-settings',
        ],
        platform: 'web',
      },
      bundle: { patch: './cordis.patch.yml' },
    },
    files: ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/client.d.ts', 'cordis.patch.yml'],
    scripts: {
      build: 'tsc -p tsconfig.json && tsdown',
      prepare: 'npm run build',
    },
    devDependencies: {
      '@deepseek-ai/dsh-client-runtime': '^0.1.0-rc.6',
      '@deepseek-ai/dsh-client-ui-settings': '^0.1.0-rc.6',
      '@types/node': '^22.0.0',
      '@types/react': '^18.3.0',
      react: '^18.3.0',
      tsdown: '^0.22.2',
      typescript: '^5.6.0',
    },
  }, null, 2) + '\n'

  const hostIndex = `// host 半：client UI 插件在 Node 侧通常无需逻辑，空 apply 即可。
export function apply(): void {}
`

  const clientIndex = `// client 半：注册一个 React 组件到 settings.section 槽位。
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

function ${component}(props: SettingsSectionOwnerProps) {
  // TODO: 在这里写你的设置界面。props.close 是关闭设置面板的 shell 按钮。
  return createElement('div', null, '${sectionLabel} — 在这里写你的设置界面')
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: '${sectionId}',      // section key（驱动 only 过滤）
    order: 0,                // 导航位置
    label: '${sectionLabel}', // 导航显示名（本地化文本由注册方提供）
  }, ${component}))
}
`

  const patch = `- insert:
    - id: ${name}
      name: ${name}
`

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/index.ts"]
}
`

  const tsdownConfig = `import { defineConfig } from 'tsdown'

// 浏览器平台模块表（external，与 dsh 的 packages/client/web/src/platform.ts 一致）
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "${name}", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
`

  const hint = `下一步：
1. 把 files 写入对应路径（package.json / src/index.ts / src/client/index.ts / cordis.patch.yml / tsconfig.json / tsdown.config.ts）。
2. 构建：pnpm install（装 devDependencies，会跑 prepare）→ 产出 lib/index.js + lib/client.js；或 pnpm run build。
3. 打包安装：pnpm pack → dsh plugin --profile web add ./${name}-0.1.0.tgz，重启 web。
4. 若要挂到别的槽位（sidebar / conversation.chat.node / tool.call.toolview 等），先读 plugin_doc(topic='client') §3 槽位清单。`

  return {
    files: [
      { path: 'package.json', content: packageJson },
      { path: 'src/index.ts', content: hostIndex },
      { path: 'src/client/index.ts', content: clientIndex },
      { path: 'cordis.patch.yml', content: patch },
      { path: 'tsconfig.json', content: tsconfig },
      { path: 'tsdown.config.ts', content: tsdownConfig },
    ],
    hint,
  }
}

// ===== host 侧：Service 服务 =====

export interface ScaffoldServiceInput {
  name: string        // 包名（kebab），如 'metrics-service'
  serviceName: string // 服务名（挂在 ctx 上），如 'metrics'
}

export function scaffoldServicePlugin(input: ScaffoldServiceInput): ScaffoldClientOutput {
  const name = input.name.trim() || 'my-service'
  const serviceName = input.serviceName.trim() || 'myService'
  const className = toPascal(serviceName) + 'Service'

  const index = `import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { ${serviceName}: ${className} }
}

export default class ${className} extends Service {
  constructor(ctx: Context) {
    super(ctx, '${serviceName}')
    // 同步初始化写在这里
  }

  // TODO: 在这里定义服务方法，供消费方 inject 后调用。
  // 消费方：export const inject = ['${serviceName}']，然后 ctx.${serviceName}.xxx()
}
`

  const patch = `- insert:
    - id: ${name}
      name: ${name}
`

  const hint = `下一步：
1. 把 files 写入对应路径（src/index.ts / cordis.patch.yml）。
2. 挂载：该 Service 类作为插件被 load（default export 类形式）。消费方 inject=['${serviceName}'] 即可用。
3. 提供服务时用类形式；可选依赖用 ctx.get('${serviceName}')。详见 plugin_doc(topic='services') §2。`

  return {
    files: [
      { path: 'src/index.ts', content: index },
      { path: 'cordis.patch.yml', content: patch },
    ],
    hint,
  }
}

// ===== host 侧：事件监听 =====

export interface ScaffoldEventInput {
  name: string        // 包名（kebab），如 'tool-logger'
  eventName: string   // 监听的事件名（namespace/action），如 'tools/result'
  eventDesc: string   // 事件用途说明
}

export function scaffoldEventPlugin(input: ScaffoldEventInput): ScaffoldClientOutput {
  const name = input.name.trim() || 'my-listener'
  const eventName = input.eventName.trim() || 'tools/result'
  const eventDesc = input.eventDesc.trim() || 'handle the event'

  const index = `import type { Context } from '@deepseek-ai/cordis'

export const name = '${name}'

export function apply(ctx: Context) {
  // ${eventDesc}
  ctx.on('${eventName}', (payload) => {
    // TODO: ${eventDesc}
    console.log('[${name}] ${eventName}', payload)
  })
}
`

  const patch = `- insert:
    - id: ${name}
      name: ${name}
`

  const hint = `下一步：
1. 把 files 写入对应路径（src/index.ts / cordis.patch.yml）。
2. 事件分发模式（emit/parallel/serial/bail/waterfall）是公开约定，按事件声明用对应方法；waterfall 监听器必须调用 next()。
3. 事件命名 namespace/action；完整事件签名查 plugin_doc(topic='services') §3。`

  return {
    files: [
      { path: 'src/index.ts', content: index },
      { path: 'cordis.patch.yml', content: patch },
    ],
    hint,
  }
}

// ===== host 侧：LLM 适配器 =====

export interface ScaffoldLlmAdapterInput {
  name: string         // 包名（kebab），如 'llm-my-provider'
  adapterClass: string // 适配器类名，如 'MyProviderAdapter'
  providerName: string // 注册的 provider 路由名，如 'my-provider'
}

export function scaffoldLlmAdapterPlugin(input: ScaffoldLlmAdapterInput): ScaffoldClientOutput {
  const name = input.name.trim() || 'llm-my-provider'
  const adapterClass = toPascal(input.adapterClass.trim()) || 'MyAdapter'
  const providerName = input.providerName.trim() || 'my-provider'

  const index = `import {
  attributionHeaders, LlmAdapter, LlmError,
  type GenerateOptions, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).default(['${providerName}']),
})

class ${adapterClass} extends LlmAdapter {
  constructor(private readonly apiKey: string) { super() }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 每个提供方 HTTP 请求必须合并 attributionHeaders() 并传递 options.signal
    const response = await fetch('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': \`Bearer \${this.apiKey}\`, ...attributionHeaders() },
      body: JSON.stringify({ model: options.model, messages: options.messages, tools: options.tools }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (!response.ok) throw new LlmError(\`Provider API error: \${response.status}\`, 'PROVIDER_HTTP_ERROR')
    // TODO: 解析流式响应，产出完整 chunk 序列（block-start → delta → block-end → usage → finish）。
    // 不支持的字段抛带稳定 code 的 LlmError，不得静默丢弃。
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Hello' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } }
    yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const inject = ['llm']
export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, new ${adapterClass}(config.apiKey))
}
`

  const patch = `- insert:
    - id: ${name}
      name: ${name}
      config:
        apiKey: !!js process.env.API_KEY
`

  const hint = `下一步：
1. 把 files 写入对应路径（src/index.ts / cordis.patch.yml）。
2. StreamChunk 协议顺序硬规则见 plugin_doc(topic='llm') §4：block-start↔block-end 一一对应，usage 在 finish 前，finish 必须最后一个分片。
3. 同一 provider 路由注册两次抛 LlmError('DUPLICATE_ADAPTER')。`

  return {
    files: [
      { path: 'src/index.ts', content: index },
      { path: 'cordis.patch.yml', content: patch },
    ],
    hint,
  }
}

// ===== client 侧：对话节点 =====

export interface ScaffoldNodeInput {
  name: string      // 包名（kebab），如 'review-node'
  nodeKind: string  // 节点 kind（kebab），如 'review-job'
  nodeLabel: string // 节点显示名，如 'Review'
}

/**
 * 生成一个对话节点（conversation.chat.node）client 插件：双面包 + Definition + React 组件。
 * 契约源自 docs/cookbook/adding-a-conversation-node.md。
 */
export function scaffoldConversationNodePlugin(input: ScaffoldNodeInput): ScaffoldClientOutput {
  const name = input.name.trim() || 'my-node'
  const kind = (input.nodeKind.trim() || 'my-node').replace(/[-_\s]+/g, '-')
  const nodeLabel = input.nodeLabel.trim() || 'My Node'
  const className = toPascal(kind)
  const stateName = className + 'State'
  const dataName = className + 'Data'

  const packageJson = JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    main: 'lib/index.js',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './client': { types: './lib/client.d.ts', default: './lib/client.js' },
      './package.json': './package.json',
    },
    dsh: {
      client: {
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-ui-slots',
          '@deepseek-ai/dsh-client-ui-conversation',
        ],
        platform: 'web',
      },
      bundle: { patch: './cordis.patch.yml' },
    },
    files: ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/client.d.ts', 'cordis.patch.yml'],
    scripts: {
      build: 'tsc -p tsconfig.json && tsdown',
      prepare: 'npm run build',
    },
    devDependencies: {
      '@deepseek-ai/dsh-client-runtime': '^0.1.0-rc.6',
      '@deepseek-ai/dsh-client-ui-conversation': '^0.1.0-rc.6',
      '@types/node': '^22.0.0',
      '@types/react': '^18.3.0',
      react: '^18.3.0',
      tsdown: '^0.22.2',
      typescript: '^5.6.0',
    },
  }, null, 2) + '\n'

  const hostIndex = `export function apply(): void {}
`

  const clientIndex = `// client 半：注册一个对话节点（conversation.chat.node）。
// 契约见 docs/cookbook/adding-a-conversation-node.md；三处 declaration merging 提供类型。
import type {
  ClientContext, ConversationNodeDefinition, ConversationNodeContext,
  ConversationLocation,
} from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

// 1) 会话事件（可回放事件族）：声明你的事件
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    '${kind}/start': { ${kind}Id: string; title: string }
    '${kind}/update': { ${kind}Id: string; progress: number }
    '${kind}/end': { ${kind}Id: string; summary: string }
  }
}

// 2) 节点数据
interface ${dataName} {
  readonly title: string
  readonly status: 'running' | 'done'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap { '${kind}': ${dataName} }
}
declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationStepDataMap { '${kind}': ${dataName} }
}

// 3) State（Definition 持有的完整状态）
interface ${stateName} extends ${dataName} {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

const definition: ConversationNodeDefinition<${stateName}> = {
  kind: '${kind}',
  target: 'chat',
  match: (event) => {
    if (event.type === '${kind}/start') return { id: String(event.data.${kind}Id), role: 'start' }
    if (event.type === '${kind}/update' || event.type === '${kind}/end') {
      return { id: String(event.data.${kind}Id), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== '${kind}/start') throw new Error('${kind} requires ${kind}/start')
    return {
      turn: match.event.data.turn ?? 0,
      step: match.event.data.step ?? 0,
      title: match.event.data.title,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === '${kind}/update') {
      return { ...context.state, status: 'running' as const }
    }
    if (match.event.type === '${kind}/end') {
      return { ...context.state, status: 'done' as const, summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === '${kind}/update' ? 'animation-frame' : 'immediate',
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: '${kind}',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: {
        title: context.state.title,
        status: context.state.status,
        ...(context.state.summary === undefined ? {} : { summary: context.state.summary }),
      },
    }
  },
}

function ${className}View({ node }: ChatNodeViewProps<'${kind}'>) {
  const text = node.data.summary ?? node.data.title
  return createElement('p', null, text)
}

export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(definition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: '${kind}',
  }, ${className}View))
}
`

  const patch = `- insert:
    - id: ${name}
      name: ${name}
`

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/index.ts"]
}
`

  const tsdownConfig = `import { defineConfig } from 'tsdown'

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "${name}", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
`

  const hint = `下一步：
1. 把 files 写入对应路径（package.json / src/index.ts / src/client/index.ts / cordis.patch.yml / tsconfig.json / tsdown.config.ts）。
2. 完善事件族：${kind}/start、${kind}/update、${kind}/end 三处 declaration merging 的 payload 字段要与 host 侧事件生产者一致（可回放）。
3. 构建安装：pnpm install → pnpm pack → dsh plugin --profile web add ./${name}-0.1.0.tgz，重启 web。
4. 对话节点契约细节见 plugin_doc(topic='client') §4。`

  return {
    files: [
      { path: 'package.json', content: packageJson },
      { path: 'src/index.ts', content: hostIndex },
      { path: 'src/client/index.ts', content: clientIndex },
      { path: 'cordis.patch.yml', content: patch },
      { path: 'tsconfig.json', content: tsconfig },
      { path: 'tsdown.config.ts', content: tsdownConfig },
    ],
    hint,
  }
}
