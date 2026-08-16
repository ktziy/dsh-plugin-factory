// validate.ts — 静态自查：对生成的插件源码做禁止清单启发式检查。
// 硬校验最终以 dsh 加载时的 defineTool guard 为准；这里抓最常踩的致命错误。

export interface ValidateInput {
  source: string
  pluginName?: string
}

export interface ValidateIssue {
  rule: string
  severity: 'error' | 'warning'
  detail: string
}

export interface ValidateOutput {
  ok: boolean
  issues: ValidateIssue[]
}

export function validatePlugin(input: ValidateInput): ValidateOutput {
  const src = input.source ?? ''
  const issues: ValidateIssue[] = []

  // 1. 必须能作为插件被识别：有 name 导出 + apply 函数
  if (!/export\s+const\s+name\s*=|export\s+default\s*\{/.test(src) && !/export\s+default\s+class/.test(src)) {
    issues.push({
      rule: 'plugin-name',
      severity: 'error',
      detail: '缺少插件名：必须有 `export const name = \'...\'`（对象/类形态可用 export default）。否则无法被识别为插件。',
    })
  }
  if (!/function\s+apply\s*\(/.test(src) && !/apply\s*\(/.test(src)) {
    issues.push({
      rule: 'plugin-apply',
      severity: 'error',
      detail: '缺少 `apply(ctx)`：插件必须导出 apply 函数，框架加载时调用它注册能力。',
    })
  }

  // 2. 用了 tools 注册但没声明 inject
  if (/ctx\.tools\.register/.test(src) && !/export\s+const\s+inject\s*=/.test(src)) {
    issues.push({
      rule: 'inject-tools',
      severity: 'error',
      detail: '用了 `ctx.tools.register(...)` 但没 `export const inject = [\'tools\']`。依赖未声明会导致插件停在 PENDING（静默不加载）。',
    })
  }

  // 3. defineTool 的 output 缺 schema 或 render
  if (/defineTool\s*\(/.test(src)) {
    if (!/schema\s*:/.test(src)) {
      issues.push({
        rule: 'output-schema',
        severity: 'error',
        detail: 'defineTool 的 output 必须声明 `schema`（规范返回值 schema）。',
      })
    }
    if (!/render\s*:/.test(src)) {
      issues.push({
        rule: 'output-render',
        severity: 'error',
        detail: 'defineTool 的 output 必须声明 `render`（把规范值转成模型可见内容块）。',
      })
    }
  }

  // 4. 嵌套 object 缺显式 additionalProperties（启发式：找 type: 'object' 且同块无 additionalProperties）
  const objectBlocks = src.match(/type\s*:\s*'object'[^}]*}/g) ?? []
  for (const block of objectBlocks) {
    if (!/additionalProperties\s*:/.test(block)) {
      issues.push({
        rule: 'additionalProperties',
        severity: 'error',
        detail: `检测到 \`type: 'object'\` 块但未显式声明 \`additionalProperties\`（true 或 false）——注册时会报 "additionalProperties must be explicitly true or false"。块内容：\`${block.trim().slice(0, 80)}...\``,
      })
    }
  }

  // 5. oneOf 数量启发式检查（正则对嵌套 schema 会切错，故只作 warning 提示，不主导 ok 判定）
  const oneOfMatch = src.match(/oneOf\s*:\s*\[([^\]]*)\]/)
  if (oneOfMatch) {
    const inner = oneOfMatch[1].trim()
    // 粗略：一个 schema 分支至少包含一个 { type: ... }，少于两个则提醒人工确认
    const branchCount = (inner.match(/\{\s*type\s*:/g) ?? []).length
    if (inner !== '' && branchCount < 2) {
      issues.push({
        rule: 'oneOf-min',
        severity: 'warning',
        detail: 'oneOf 疑似少于两个 schema 分支（静态检查对嵌套 schema 可能误判，仅作提醒）——请确认 oneOf 至少两个分支，且不能同时声明 type。',
      })
    }
  }

  // 6. 通用提醒
  if (/defineTool\s*\(/.test(src)) {
    issues.push({
      rule: 'guard-authority',
      severity: 'warning',
      detail: '静态检查不保证完整；最终以 dsh 加载时 defineTool 的 guard 校验为准。复杂 schema 请先读 plugin_doc(topic=\'tools\') §3 禁止清单。',
    })
  }

  return { ok: issues.every(i => i.severity !== 'error'), issues }
}
