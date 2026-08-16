# preset.md — agent preset（组合配置，非插件）

> preset 是**配置**，不是 TS 插件。源码确认（`packages/preset/agent-presets/README.md`）：
> 一个 preset = 一个目录，内含一个 `agent.cordis.yml`（YAML 数组，每行是一个插件条目，与 cordis.yml 同语法）。

## 1. preset 是什么

- 目录名即 preset id（`[a-z0-9][a-z0-9-]*`，非法名直接跳过）。
- 目录内唯一必需文件：`agent.cordis.yml`，内容是插件行列表（`- name: ...` / `- id: ... name: ...`）。
- 每个进程只挂载一次（standing scope）；每个会话通过 scope 链加入该 preset 的组合。

```yaml
# agent.cordis.yml 示例
- name: '@deepseek-ai/dsh-tool-bash'
- name: './my-tool.ts'
```

## 2. 与插件的区别（工厂关键判断）

| | 插件（plugin） | preset |
|---|---|---|
| 形态 | TS 模块，导出 `apply(ctx)` | 目录 + `agent.cordis.yml` |
| 作用 | 注册能力（工具/服务/事件） | 组合一批插件给某个 agent 用 |
| 创建方式 | 写代码 | 复制已有 preset 目录（`ctx.agentPresets.copy`） |
| 作者 | 开发者 | 用户（Web UI 的 preset 管理） |

## 3. 管理 API（`ctx.agentPresets` 服务）

- `list()` / `resolve(id?)`：发现（每次重读，不缓存；broken 的也列出并带 reason）
- `mount(agentCtx, id?)`：把 preset 组合挂到某个 agent（唯一支持调用点是 agent factory 的 `setup(agentCtx)`）
- `composeFrom(agentCtx, parentCtx)`：子 agent 加入父的 standing composition（子 agent 用这个，不是 mount）
- `copy(from, id, name?)`：**唯一的作者写操作**——复制现有 preset 整个目录
- `remove(id)`：删除本地 authored 的 preset
- `read(id)`：读组合文本

## 4. 对插件工厂的含义

- 工厂**不生成 preset 的 TS 代码**；如果支持 preset，只需生成 `agent.cordis.yml`（插件行列表）。
- 想要一个"带特定工具组合的 agent"，本质是写 `agent.cordis.yml`，列出工具插件名。
- 简单场景优先直接做 tool 插件；preset 是"组合层面"的编排，需要时再碰。
