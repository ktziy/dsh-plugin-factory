# tools.md — 工具插件开发完整契约 + 禁止清单

> 生成任何 tool 插件前必读。本文的"禁止清单"逐条来自源码校验（`packages/core/tools/src/schema.ts` 的 `authorError` + `packages/extensions/cordis-host-runner/src/guard.ts` 的 teaching error），
> **不是建议而是硬约束**：违反会在 `defineTool()` 注册时抛错、插件 FAILED。
> 简单插件（只有 string/number 参数）通常踩不到这些坑；复杂 schema（嵌套 object、oneOf、enum）会稳定触发。

## 1. 最小骨架（先抄这个，必读）

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'          // 插件名（诊断用）
export const inject = ['tools']           // 等待 tools 服务就绪

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',                        // 工具名：全局唯一，snake_case 风格
    description: 'Greet someone by name.', // 模型看到，写清何时用、怎么用
    parameters: {                         // 隐式开放对象（不要写 type:'object' 包装）
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },         // 规范返回值 schema（必填）
      render: (_args, value) => [{ type: 'text', text: value }],  // 模型可见内容（必填）
    },
    async execute(args) {
      return `Hello, ${args.name}!`       // 必须符合 output.schema
    },
  }))
}
```

## 2. defineTool 完整选项

```ts
defineTool({
  name: string                 // 唯一
  description: string          // 模型可见
  parameters: ParameterSchemaSpec
  output: {
    schema: ValueSchemaSpec    // 必填
    render(args, value): ContentBlock[]   // 必填，纯函数
    presentationMeta?(args, value): JsonValue  // 可选
  }
  timeoutMs?: number           // 正有限数
  isConcurrencySafe?(args): boolean  // 可选
  execute(args, exec): Promise<Value>    // 必填
  finalizeContent?(exec, result)         // 可选
  presentCall?(args): ToolCallView       // 可选（UI 卡片）
  presentResult?(args, result): ToolResultView  // 可选
})
```

`exec` 携带：`exec.name`、`exec.arguments`（只读）、`exec.agent`、`exec.signal`（AbortSignal，必须遵守）、`exec.callId`、`exec.token`。

## 3. 禁止清单（硬约束，逐条来自源码校验）

### 3.1 type 取值

- 合法 `type`：`string | number | integer | boolean | null | array | object | json`，**或用 `oneOf`**。
- 其他值报错：`must declare a valid type: string | number | integer | boolean | null | array | object | json (got X)`。

### 3.2 oneOf

- 必须**至少 2 个分支**：`oneOf must contain at least two schemas`。
- 不能同时声明 `type`：`cannot declare both type and oneOf`。

### 3.3 object 节点（嵌套对象）

- `additionalProperties` 必须**显式**写 `true` 或 `false`，缺省即报错：`additionalProperties must be explicitly true or false`。
- `properties` 必须是 schema 对象（`properties must be an object of schemas`）。

```ts
// ✅ 正确
nested: {
  type: 'object',
  additionalProperties: false,   // 显式声明，不能省
  properties: { x: { type: 'number' } },
}
// ❌ 错误：漏了 additionalProperties
nested: { type: 'object', properties: { x: { type: 'number' } } }
```

### 3.4 根 parameters

- 根是**隐式开放对象**，直接写属性 map，**不要**写 `type: 'object'` 包装。
- 若用了 raw 对象包装（`{ type: 'object', properties: {...} }`）：
  - `additionalProperties` 必须 `true` 或省略（根开放）：`additionalProperties must be true or omitted because the implicit parameter root is open`。
  - `required` 是**数组**（列属性名），每个名必须已声明：`names undeclared property "X"`。
  - 属性节点上**不能**写 `required`：`required belongs to the containing raw object schema`。
- 结论：**推荐直接用属性 map + 属性节点上 `required: true`**，别用 raw 包装（后者是给 Code Mode 沙箱 JSON-Schema 兼容用的）。

### 3.5 required（直接 DSL 属性 map）

- 属性节点上 `required: true` 表示必填。
- 不能写其他值：`required must be true when present`。
- 不写 required = 可选。

### 3.6 enum / const

- `enum` 必须是**非空数组、元素为标量**：`enum must be a non-empty array of scalar values`。
- `const` 是单个标量值。

### 3.7 array / json

- `array` 的 `items` 是子 schema。
- `json` 任意 JSON 值，无子约束。

### 3.8 循环引用

- schema 对象不能自引用：`is circular`。

### 3.9 多余 key

- 每个 schema 节点只允许：对应 `type` 的键 + 注解键。多余 key 报错：`X is not supported by the unified schema DSL`。
- 注解键（全部节点通用）：`description | title | default | examples`（`default`/`examples` 必须是可 JSON 序列化数据）。

### 3.10 output 硬规则

- `output` 必须声明 `{ schema, render }`（`presentationMeta` 可选）：`output must declare { schema, render, presentationMeta? }`。
- `render` 必须是函数，返回 content block 数组：`[{ type: 'text', text: value }]` 形状。返回非数组/非 block 报错：`output.render returned X — it must return an ARRAY of content blocks`。
- `execute` 必须是函数。
- `execute` 返回值必须符合 `output.schema` 且 JSON 可序列化；否则 isError。

### 3.11 defineTool 顶层

- `name` 必须全局唯一（重复注册冲突）。
- `timeoutMs` 必须是正有限数：`timeoutMs must be a positive finite number`。

## 4. execute() 行为契约

1. 返回规范 JSON 值，类型符合 `output.schema`（对象/数组/标量/null）。**不要**返回 content block。
2. 抛异常 = isError；基础设施故障（网络/文件系统）抛异常。领域内不理想状态（如命令退出码非零）仍返回规范值，让 `render` 解释。
3. 必须遵守 `exec.signal`：中止时取消进行中的异步工作。
4. args 已被校验且冻结，视为只读。
5. 长任务用 `run_in_background` producer + `ctx.jobs.start(...)`（见 services-events.md）。

## 5. 工具扩展点事件

| 事件 | 模式 | 用途 |
|---|---|---|
| `tools/pre-execute(exec, next)` | waterfall | 允许/拒绝/询问门禁 |
| `tools/execute(exec, next)` | waterfall | 超时/重试/指标包装 |
| `tools/post-execute(exec, result, next)` | waterfall | 替换展示/返回值、阻止结果 |
| `tools/result(exec, result)` | emit | 观测不可变最终结果 |
| `tools/change()` | emit | 工具集变化通知 |

waterfall 监听器**必须调用 `next()`**（只做日志/观察也调用），否则吞掉下游。

## 6. 复杂 schema 正确示例（一次给全）

```ts
ctx.tools.register(defineTool({
  name: 'config_update',
  description: 'Update a config with either a scalar or a nested object.',
  parameters: {
    key: { type: 'string', required: true, description: 'Config key' },
    value: {
      oneOf: [                          // ✅ 至少两个分支
        { type: 'string' },
        { type: 'number' },
        {
          type: 'object',
          additionalProperties: false,  // ✅ 显式
          properties: {
            mode: { type: 'string', enum: ['fast', 'accurate'] },  // ✅ 非空标量枚举
            retries: { type: 'integer' },
          },
        },
      ],
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } },
    render: (_args, value) => [{ type: 'text', text: `ok=${value.ok}` }],
  },
  async execute(args) {
    return { ok: true }
  },
}))
```
