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
