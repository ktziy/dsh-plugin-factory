# client.md — 前端 UI 插件（client 侧）开发契约

> 给 dsh 的 Web 界面加 UI（对话节点、设置页、侧边栏、工具卡片等）的契约。
> 与 host 工具插件（tools.md）是**两套机制**：client 插件运行在浏览器，用 React + slots，构建出 `lib/client.js`。
> 硬约束逐条来自源码（`packages/client/modules`、`packages/client/runtime`、`packages/client/ui-slots`）。

## 1. 心智模型：一个 client 插件是「同一 npm 包的两面」

| 面 | 文件 | 运行位置 | 内容 |
|---|---|---|---|
| host 半 | `lib/index.js`（`exports["."]`） | Node | 通常**空 apply**（`export function apply() {}`）；有 host 需求时才注册 settings 等 |
| client 半 | `lib/client.js`（`exports["./client"]`） | 浏览器 | 导出 `inject` + `apply(ctx: ClientContext)`，用 slots 挂 React 组件 |

- 关键：`dsh.client` 声明**只决定「这个 entry 有浏览器 bundle 可被扫描」**，它**不会**让包自动进组合——进组合仍靠 `dsh.bundle.patch` 的 insert 行（见 §5 安装）。
- 所以一个可安装的 client 插件，`package.json` 的 `dsh` 键里**同时需要** `client` 和 `bundle` 两个字段。

## 2. 最小形态（先抄这个）

### package.json

```jsonc
{
  "name": "my-ui-plugin",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots"],
      "platform": "web"
    },
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts", "cordis.patch.yml"]
}
```

- `dsh.client` 字段校验（`packages/client/modules/src/index.ts`）：`platform` 必须为 string（约定 `'web'`）、`inject` 为 string[]、可选 `immediately: boolean`（仅核心包用，第一阶段预取）。
- `exports["./client"]` 必须解析出 `lib/client.js`（string 或 `{ default: string }`）。

### host 半 `src/index.ts`（空壳即可）

```ts
export function apply(): void {}
```

### client 半 `src/client/index.ts`

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const inject = ['slots']            // 列出 apply 用到的 client 服务键

export function apply(ctx: ClientContext): void {
  // 用 slots 挂组件（见 §3）
}
```

`ClientContext` = Cordis 的 `Context`，经 declaration merging 增强，挂载了 `slots`、`conversationEvents`、`conversationViews`、`sessions`、`workspaces` 等 client 服务键。

## 3. 挂载槽位（slots 机制）

### 3.1 核心 API

```ts
// ctx.slots.inject(key, callback)：往槽位塞一个「注册回调」；callback 里用 ctx.slots.register(opts, Component) 真正注册
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  // ...槽位特定的 opts
}, MySectionView))
```

- `ctx.slots.register(def, Component)` 返回 disposer。
- 槽位类型：`single`（单个）/ `list`（列表）/ `keyed`（按 key）/ `chain`（链）。
- 作用域：`root` / `session-maybe` / `session`。

### 3.2 常用槽位清单（源码 `packages/client/*/src/client/contract/slots.ts`）

| 槽位 | 类型/作用域 | 定义包 | 用途 |
|---|---|---|---|
| `settings.section` | list/root | ui-settings | 设置页加一节 |
| `settings.plugin.item` | list/root | ui-settings-plugins | 插件列表加一项 |
| `sidebar` | single/root | ui-layout | 整块侧边栏 |
| `sidebar.workspaces` | single/root | ui-sidebar | 工作区列表 |
| `conversation.view` | list/session | ui-conversation | 会话视图加一块 |
| `conversation.chat.node` | keyed/session | ui-conversation | 对话流加节点（§4） |
| `tool.call.toolview` | keyed/session | ui-tool | 工具调用的 UI 卡片 |
| `shell.overlay` | list/root | ui-layout | 框架级浮层 |

每个槽位的 `opts`（含 `key`、`keyProps` 等）和组件 props（`SettingsSectionOwnerProps`、`ChatNodeViewProps`、`ToolCallOwnerProps` 等）由对应 `contract/slots.ts` 定义——写具体槽位时查那个文件。

### 3.3 最小可渲染示例（设置页加一节）

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
// 组件 props 类型与槽位 opts 见 ui-settings 的 contract/slots.ts

function MySection(props: any) {
  return createElement('div', null, 'Hello from my plugin')
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    // key / title 等 opts 按槽位契约填
  }, MySection))
}
```

## 4. 对话节点（进阶，给对话流加自定义节点）

官方教程：`docs/cookbook/adding-a-conversation-node.md`。核心两步：

1. **注册 Definition**：`ctx.conversationEvents.register(definition)`，`ConversationNodeDefinition<State>` 的字段（`packages/client/runtime/src/client/contract/conversation.ts`）：

```ts
{
  kind: string                      // 业务稳定 id
  target?: string                   // 与 buildViewNode 成对出现
  match(event: SessionEvent): { id, role: 'start'|'update' } | null
  start(context, match, reader): State
  update(context & { state }, match): State
  publication?(match): 'none'|'animation-frame'|'immediate'
  buildViewNode?(context): ConversationViewNode | null   // 返回 target:'chat' 的节点
}
```

2. **挂渲染组件**：`ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: kind }, NodeView))`，`NodeView` 的 props 是 `ChatNodeViewProps<Kind>`。

关键配套（三处 declaration merging）：
- `SessionEventMap`（`@deepseek-ai/dsh-session/types`）——声明你的事件
- `ChatNodeDataMap`（`@deepseek-ai/dsh-client-ui-conversation/client`）——声明节点数据
- `ConversationStepDataMap`（`@deepseek-ai/dsh-client-runtime/client`）——声明 step 数据

> 对话节点复杂在「可回放事件族」：每个节点靠一个稳定 `id` 关联一串持久化会话事件（start/update/end），client 用 `reader.previous(kind)` 查前驱、增量构建 State。简单 UI 用 §3 的槽位组件就够，别一上来碰对话节点。

## 5. 安装机制（dsh.bundle.patch + dsh.client 两个都要）

- `dsh.bundle.patch` → `cordis.patch.yml` 里 insert 一行 entry（这行让包**进入组合**）：

```yaml
- insert:
    - id: my-ui-plugin
      name: my-ui-plugin      # 按包名引用，Node 模块解析到 lib/index.js
```

- `dsh.client` → 让 client modules 的 Node 半扫描到这一 entry 有 `./client` browser bundle，写进 `window.__DSH_BOOT__`。
- 安装命令同 host：`dsh plugin --profile web add <pkg|tarball|git>`，重启生效。

## 6. 构建（client face）

- client 半构建产出 **cjs** 格式的 `lib/client.js`，带 `window.__ModuleLoader__.load({ id, factory })` 的 banner/footer，`external` 掉 `CLIENT_EXTERNALS`（react/react-dom/cordis/ui-slots/web-react/ui-primitives/ui-attachment/schema-form + `@deepseek-ai/dsh-client-runtime/client`），其余依赖内联。
- monorepo 内用 `tsdown --env.DSH_BUILD_FACE client`（每包 local config 决定 entry）。
- **树外自包含构建**：用 tsdown，entry = `src/client/index.ts`，套用上面的 client 配置（cjs + banner/footer + external），`prepare` 脚本自包含构建（对比 host 包的 `prepare: tsc`，client 包对应 `prepare: tsdown`）。

## 7. 禁止/易错清单

1. **只写 `dsh.client` 不进组合**——还必须 `dsh.bundle.patch` insert 一行，否则 web profile 扫不到。
2. `dsh.client.platform` 必须是 `'web'`；`inject` 必须 string[]。
3. `exports["./client"]` 必须指向 `lib/client.js`，否则 bundle 扫描失败。
3a. **`exports` 必须导出 `"./package.json"`**（`"./package.json": "./package.json"`）——client modules 用 `require.resolve('<pkg>/package.json')` 定位包，缺这一条会让扫描**静默跳过**（不报错，但 UI 不出现）。实测踩坑。
4. client 半 `apply` 的第一个参数是 `ClientContext`（不是 host 的 `Context`）。
5. 跨插件 `@deepseek-ai/*` value import 会被 purity gate 拒绝——client 半只 import type 跨包类型，运行时依赖走 `inject` 服务。
6. React 组件里不要用 `setInterval` 这类副作用（渲染失败只会落到浏览器控制台，模型和用户都看不到）。
7. 对话节点必须用稳定业务 id 关联事件，别用「最新未完成」这种脆弱关联。
