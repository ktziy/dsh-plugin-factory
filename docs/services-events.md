# services-events.md — 服务、依赖、事件与 Context API

> 插件间共享能力用服务；插件间通信用事件。本文是工具之外的所有运行时契约。

## 1. Context API 速查（Cordis）

| API | 说明 |
|---|---|
| `ctx.on(name, listener)` | 监听事件（effect，自动清理）；可用 `{ prepend: true }` 提前注册 |
| `ctx.emit(name, ...args)` | 同步广播 |
| `ctx.parallel(name, ...args)` | 并发等待所有监听器 |
| `ctx.serial(name, ...args)` | 顺序执行，首个非 null/false/undefined 胜出短路 |
| `ctx.bail(name, ...args)` | serial 同步版 |
| `ctx.waterfall(name, ...args, next)` | 中间件链；不调用 next() 短路 |
| `ctx.effect(() => disposer?)` | 注册自定义资源清理 |
| `ctx.plugin(childPlugin)` | 挂载子插件，返回 fiber；`await fiber.dispose()` 手动终止 |
| `ctx.get(name)` | 可选依赖查询（undefined 可能） |
| `ctx.registry` | 插件注册表（诊断 fiber 状态用） |
| `ctx.serviceName` | 当前插件上下文中的服务名（!!js 求值上下文） |

## 2. 服务（Service）

服务 = 挂载在 `ctx` 上的命名能力（`tools`、`llm`、`agents` 都是服务）。

### 2.1 提供服务（类形式）

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { metrics: MetricsService }   // 声明合并
}

export default class MetricsService extends Service {
  static inject = ['llm']                        // 服务也可依赖其他服务
  constructor(ctx: Context) {
    super(ctx, 'metrics')                        // 'metrics' = 服务名，对应 ctx.metrics
  }
  record(event: string, value: number) { /* ... */ }
}
```

挂载：`ctx.plugin(MetricsService)`（或作为插件 apply 里挂载）。

### 2.2 消费服务

- 必需：`export const inject = ['metrics']`，然后 `ctx.metrics.record(...)`。
- 可选：`ctx.get('metrics')`（undefined 时跳过）。

### 2.3 服务生命周期

- 服务消失（提供方被替换）→ 依赖插件自动 dispose；服务恢复 → 自动重载。
- 服务隔离：`group: true` + `isolate: { shell: true }` 给组内插件独立服务实例。

### 2.4 ToolRuntime 服务（ctx.tools）

| 方法 | 说明 |
|---|---|
| `register(def)` | 注册工具；返回 disposer，插件卸载自动注销 |
| `execute({ callId, name, arguments, signal })` | 走完整流水线执行一次调用（插件内自测用，返回 `{ content, isError, value? }`） |
| `guard(predicate)` | 设置最终单调拒绝（后续监听器无法撤销） |

无模型自测示例：

```ts
import { CallId } from '@deepseek-ai/dsh-llm'
// apply 内：
const result = await ctx.tools.execute({
  callId: CallId('demo-1'),
  name: 'greet',
  arguments: { name: 'Cordis' },
  signal: new AbortController().signal,
})
console.log(JSON.stringify(result.content))
```

## 3. 事件

### 3.1 分发模式（事件用哪种模式是公开约定）

| 模式 | 方法 | 语义 |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | 同步广播，无返回值 |
| parallel | `await ctx.parallel(name, ...args)` | 并发执行并等待 |
| serial | `await ctx.serial(name, ...args)` | 顺序执行，首个非 null/false/undefined 胜出短路 |
| bail | `ctx.bail(name, ...args)` | serial 同步版 |
| waterfall | `await ctx.waterfall(name, ...args, next)` | 中间件链；不调 next() 短路 |

waterfall 监听器**必须调用 `next()`**（只做日志/观察也调用），否则吞掉下游。

### 3.2 类型安全

```ts
declare module '@deepseek-ai/cordis' {
  interface Events { 'my-plugin/ready': (payload: X) => void }
}
import type {} from '@deepseek-ai/dsh-tools'   // 引入包级事件声明
```

### 3.3 命名与常用域

- 命名：`namespace/action`（如 `agent/step`、`tools/result`、`session/event`）。
- 工具扩展点：`tools/pre-execute`、`tools/execute`、`tools/post-execute`（waterfall）、`tools/result`、`tools/change`（emit）——见 tools.md §5。
- 完整事件签名以各子系统页面 `docs/reference/subsystems/*` 的 **cordis-surface** 区块为准。

### 3.4 持久化会话事件 vs Cordis 事件（易混淆）

`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/call`、`tool/result`、`compaction/*`、`tool/code-dispatch*` 是**持久化会话事件**（不是 Cordis 事件）。要观察它们，监听 `session/event` 并检查 `event.type`。

## 4. 能力三层拆分（seam 模式）

当能力需要可替换提供方时，拆三种角色（各自独立演进才拆包；简单工具无需拆）：

```
Service Definition（接口包，如 dsh-shell）──▶ Service Provider（实现包，如 dsh-bash-local）
      ▲                                                 │
      └────────────── Consumer（工具包，如 dsh-tool-bash）── inject: ['shell']
```

- Definition 包：`Service` 子类 + Request/Result 类型 + `declare module` 合并。
- Provider 包：继承 Definition 的实现类 + `ctx.plugin(MyCapLocal)` 挂载。
- Consumer 包：`inject = ['tools', 'myCap']` + `ctx.tools.register(defineTool({...}))`。
- 设计要点：Definition 拥有 Request/Result 类型；默认值用显式 `resolve(request): Spec` 步骤，不在 `run()` 里藏 `?? default`。

## 5. 后台任务（长时间运行的工具）

- 工具选项声明 `run_in_background` producer，execute 内 `ctx.jobs.start({ kind, label, owner: exec.agent, run })`。
- 成功后返回类型化规范句柄 `{ kind: 'background', jobId }`；render 转成人话，程序化消费取 `jobId` 不解析文本。
- 已发布的 job 生命周期归 `job_kill`、owner dispose、服务 teardown 所有；**不要再用 exec.signal 取消已发布的 job**（只取消等待）。

## 6. UI 卡片契约（presentCall / presentResult）

卡片类型（render intent union）：`generic` / `terminal` / `diff` / `search` / `web`。

- `presentCall(args)` → ToolCallView（PENDING 卡片）。
- `presentResult(args, { content, isError, meta? })` → ToolResultView（完成卡片）。
- 硬规则：**纯函数**（live 流式与回放都运行）；不读会话状态、不用时钟/随机数、不做 I/O；UI 格式不进规范值；展示失败回退 generic，绝不抛异常。
- 参考实现：`packages/fs/tool-fs`（generic/diff）、`packages/shell/tool-bash`（terminal）、`packages/fs/tool-fs-search`（search）、`packages/web/tool-web`（web）。
