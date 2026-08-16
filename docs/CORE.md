# DeepSeek Harness 插件开发核心契约（CORE）

> 本文是给**开发 agent（模型）** 阅读的精简开发契约。你的任务是编写/修改 DeepSeek Harness 插件。
> 本文是唯一必读规范；细节按主题查同目录的拆分文件，**不要在未核实的情况下发明 API**：
> - 工具契约 + schema 禁止清单 → `tools.md`
> - 服务 / 事件 / Context API → `services-events.md`
> - 接入新模型 → `llm-adapter.md`
> - 组合 / 打包 / 安装 / 发布 → `compose-publish.md`
> - agent preset → `preset.md`
> 所有代码示例里的 API 名称、包名、事件名必须**原样使用**，不得改写。

## 0. 技术栈与心智模型

- 平台：**DeepSeek Harness**（`deepseek-ai/deepseek-harness`），基于 **Cordis** 插件框架的 agent 平台。
- 语言：**TypeScript**（ESM）。包：`@deepseek-ai/cordis`（框架）、`@deepseek-ai/dsh-tools`（工具 DSL）、`@deepseek-ai/dsh-llm`（LLM 类型）、`@deepseek-ai/schemastery`（配置校验）。
- **产品每一部分都是插件**：模型适配器、工具注册表、会话日志、agent loop 本身都是插件，都可以从配置替换。
- 插件 = 一个导出 `apply(ctx)` 的模块。`ctx` 是共享上下文（服务的容器），`inject` 声明服务依赖，事件用于插件间通信，**所有注册都是可逆副作用**（卸载自动撤销）。

## 1. 最小插件骨架（先抄这个）

```ts
// src/my-plugin.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'          // 插件名（诊断用）

export function apply(ctx: Context) {
  // 在这里注册能力：ctx.on / ctx.tools.register / ctx.effect / ...
}
```

加载它需要一个 patch 文件（**插件路径必须是绝对路径**）：

```yaml
# scratch-plugin/cordis.yml
- insert:
    - id: hello
      # Windows 必须用 file:///C:/... 形式（裸 C:/... 会报 ERR_UNSUPPORTED_ESM_URL_SCHEME）；Unix 用 /absolute/path/to/...
      name: 'file:///C:/absolute/path/to/scratch-plugin/src/my-plugin.ts'
```

> 已实测：Windows 下 `--patch` 里的插件 `name` 必须是 `file:///` URL（如 `file:///C:/Users/you/.../my-plugin.ts`），写 `C:/Users/...` 会加载失败。Unix 用普通绝对路径即可。

## 2. 插件形态

| 形态 | 适用场景 |
|---|---|
| `export function apply(ctx, config?)` | 大多数情况（默认） |
| `export default { name, inject, apply(ctx, config?) }` | 需要对象字面量形式时 |
| `export default class X extends Service` | 需要向**其他插件提供服务**时（见 services-events.md） |

三种形态都支持 `export const name`、`export const inject = [...]`、`export const Config`。

## 3. 声明依赖（inject）

```ts
export const inject = ['tools', 'llm']
export function apply(ctx: Context) {
  // 到这里 ctx.tools 和 ctx.llm 一定就绪
}
```

- `inject` 里声明的服务未就绪时，插件停在 **PENDING**（合法状态，静默等待；这就是"插件没输出"最常见的原因）。
- 可选依赖：不写进 inject，用 `ctx.get('name')` 在调用处查询（可能为 `undefined`）。

## 4. 开发一个 Tool（最重要）

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',                                  // 必须全局唯一（snake_case 风格）
    description: 'Greet someone by name.',          // 模型看到的说明，写清楚何时用、怎么用
    parameters: {                                   // 参数表；根是隐式开放对象
      name: { type: 'string', required: true, description: 'The name to greet' },
      limit: { type: 'number', description: 'Max lines' },   // 不加 required 即可选
    },
    output: {
      schema: { type: 'string' },                   // 规范返回值 schema（必填）
      render: (_args, value) => [{ type: 'text', text: value }],  // 模型可见内容（必填）
    },
    async execute(args) {
      // args 已被校验且类型推导：{ name: string; limit?: number }
      return `Hello, ${args.name}!`                 // 必须符合 output.schema
    },
  }))
}
```

> **复杂 schema（嵌套 object / oneOf / enum）的硬约束见 `tools.md` §3 禁止清单**——那些约束在 `defineTool()` 注册时抛错、插件 FAILED，生成复杂参数表前必须读。

### execute() 硬规则

1. **返回规范 JSON 值**，类型必须符合 `output.schema`（对象/数组/标量/null 都行）。不要返回内容块。
2. **抛异常 = isError**；基础设施故障（网络、文件系统）抛异常。领域内的不理想状态（如命令退出码非零）仍应作为规范值返回，让 `render` 解释。
3. **必须遵守 `exec.signal`**：信号中止时取消正在进行的异步工作（传给 fetch/readFile 等）。
4. args 视为**只读**（已被冻结）。注册后不要修改 schema 或替换回调；热替换 = dispose 旧的 + 注册新的。
5. 需要手动清理的资源用 `ctx.effect()`（见 §5）。
6. 长任务：`run_in_background` producer + `ctx.jobs.start(...)`，返回 `{ kind: 'background', jobId }`（详见 services-events.md）。

## 5. 生命周期与清理

Fiber 状态机：`PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`，`apply` 抛异常 → `FAILED`。

- **自动清理**（卸载时全部自动撤销，无需手动）：`ctx.on()`、`ctx.tools.register()`、`ctx.llm.registerAdapter()`、`ctx.effect()` 的 disposer、`ctx.plugin()` 的子插件。
- **ctx.effect()** 包装框架不管理的资源：

```ts
ctx.effect(() => {
  const timer = setInterval(() => console.log('heartbeat'), 5000)
  return () => clearInterval(timer)   // disposer：卸载时执行
})
```

- disposer 按注册**逆序**启动，但多个**异步** disposer **并发**执行；有顺序依赖的清理必须放进**同一个** disposer 内依次 await。
- 手动提前终止：`const fiber = ctx.plugin(childPlugin); await fiber.dispose()`（递归卸载子插件，等全部异步清理完成）。
- HMR：改插件源文件或 cordis.yml 的 config 自动触发卸载→重载；旧实例的注册全部清理，不会残留。

## 6. 配置（cordis.yml 传入）

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}
// 同名导出：类型 + Schemastery schema；默认值写在 schema 里
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  // config 已被校验并补齐默认值
}
```

- **不要**导出普通对象作为 Config（不满足 Standard Schema，无法校验）。
- 配置非法 → 插件加载失败（FAILED），报明确错误。
- 设计纪律：**凡是不同部署可能需要不同值的参数，必须做成配置字段**（不能硬编码）；检验标准 = 能否在 cordis.yml 改它而不改代码。
- cordis.yml 里 `config` 支持 `!!js` 表达式：`timeoutMs: !!js process.env.TIMEOUT_MS ?? 30000`。
- 常用 Schema API：`Schema.string().required()/.default(x)/.min(n)/.max(n)`、`Schema.number()`、`Schema.boolean()`、`Schema.array(Schema.string())`、`Schema.union(['a','b'])`。

## 7. 常见陷阱清单（务必避免）

1. **插件路径必须绝对路径**（--patch 里写相对路径加载失败）；**Windows 上必须写 `file:///C:/...`**（裸 `C:/...` 报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`，实测）。
2. patch 覆盖某行时**必须重述该行的每一个键**（整行替换，不是深合并）。
3. **waterfall 监听器忘记调 next()** → 静默吞掉下游（日志/观察类监听器尤其容易犯）。
4. `inject` 服务无人提供 → 插件**静默 PENDING**（先查 fiber 状态，别以为是 bug）。
5. **disposer 异步并发**：清理有顺序依赖时放同一个 effect 里。
6. `execute` 返回不符合 `output.schema` 的值 = isError；UI 文本不要混进规范值/render。
7. 把可调参数硬编码而不是放进 Config。
8. **复杂 schema 漏写 `additionalProperties` / oneOf 少于 2 分支 / 误用 required** → 注册即 FAILED（完整清单见 tools.md §3）。
9. 自定义事件要用 `declare module '@deepseek-ai/cordis' { interface Events {...} }` 声明类型，否则 `ctx.on` 报类型错误。
10. 工具名必须唯一；description 写清楚，模型靠它决定何时调用。

## 8. 开发流程建议（agent 执行顺序）

1. 读用户需求 → 判断要新增/修改工具、服务、事件监听还是 LLM 适配器。
2. 读对应拆分文件（工具 → tools.md；服务/事件 → services-events.md；模型 → llm-adapter.md）。
3. 编写插件代码（遵守本文契约 + 对应拆分文件的硬约束）。
4. 写 patch 文件并启动验证（`pnpm dsh web --patch ...` 或 headless）。
5. 有疑问的 API 打开对应拆分文件核实；**不要凭记忆发明 API**。
6. 用 `--dump-config` 确认配置树符合预期。
