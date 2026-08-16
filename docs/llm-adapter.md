# llm-adapter.md — 接入新模型提供方

> 让 harness 能调用一个新模型提供方，需要实现一个 `LlmAdapter` 并注册。参考实现：`packages/llm/llm-deepseek`（OpenAI 兼容）、`packages/llm/llm-pi-ai`。

## 1. 最小骨架

```ts
import {
  attributionHeaders, LlmAdapter, LlmError,
  type GenerateOptions, type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  constructor(private readonly apiKey: string) { super() }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 每个提供方 HTTP 请求必须合并 attributionHeaders() 并传递 options.signal
    const response = await fetch('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${this.apiKey}`, ...attributionHeaders() },
      body: JSON.stringify({ model: options.model, messages: options.messages, tools: options.tools }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (!response.ok) throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    // 真实实现要解析流，产出完整 chunk 序列；不可静默丢弃不支持的字段
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Hello' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const inject = ['llm']
export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, new MyAdapter(config.apiKey))
}
```

## 2. LlmAdapter 方法

```ts
abstract class LlmAdapter {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>   // 唯一必须实现
  listModels(provider): Promise<readonly LlmModelInfo[]>          // 可选：公布可发现模型
  resolveModel(provider, model, signal?): Promise<LlmResolvedModelInfo>  // 可选：精确模型元数据
  providerInfo(provider): LlmProviderInfo                          // 可选
  providerRetryPolicy(provider): ResolvedRetryPolicy | undefined   // 可选
}
```

- `ctx.llm.registerAdapter(providers: string[], adapter)` 返回 `AdapterRegistrationHandle`（可释放；`handle(providers)` 原子替换路由）。
- `GenerateOptions.provider` 选择适配器；`GenerateOptions.model` 由适配器拥有（无需注册）。
- 同一 provider route 注册两次抛 `LlmError('DUPLICATE_ADAPTER')`。

## 3. GenerateOptions（全字段）

```ts
{
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  messages: Message[]
  system?: string
  tools?: ToolSchema[]            // { name, description, parameters: Record<string, unknown> }
  temperature?: number
  maxTokens?: number
  stop?: string[]
  signal?: AbortSignal
  sessionId?: Branded<'SessionId'>
  purpose?: 'compaction' | 'session-title'
}
```

## 4. StreamChunk 协议（顺序硬规则）

```ts
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: unknown }
```

规则：
1. 每个内容块以 `block-start` 开始（index 从 0 递增）
2. `text-delta` / `reasoning-delta` / `tool-call-delta`（argumentsDelta 是原始 JSON 文本增量，可跨分片）
3. `block-end` 必须与 `block-start` 一一对应，携带完整 block
4. `usage` 在 finish 之前
5. `finish` 必须是最后一个分片（`reason: { kind: 'stop' }` 或 `{ kind: 'tool-calls' }` 请求执行工具）

## 5. 错误与约定

- 抛 `new LlmError(message, 'STABLE_CODE')`；**不支持的字段抛带稳定 code 的错误，不得静默丢弃**。
- 每个提供方 HTTP 请求必须合并 `attributionHeaders()`、传递 `options.signal`。
- 超时抛 `LlmError('TIMEOUT')`；调用方中止抛 `LlmError('ABORTED')`。
- 参考配置：`packages/llm/llm-deepseek/README.md`（`apiKeyEnv`、`baseURL`、`models`、`thinking`、`reasoningEffort` 等）。
