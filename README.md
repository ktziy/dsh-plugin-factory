# dsh-plugin-factory

> **让 dsh 的 AI 自己编写 dsh 插件 —— 自举式插件生成工具**

**为 DeepSeek Harness（dsh）会话中的 Agent 提供一套完整的插件开发工具链。当你说"帮我做一个 XX 插件"时，Agent 能自动生成合法代码、校验契约规范、并给出安装片段 —— 全程无需人工编写。**

本插件由deepseek模型制作用于驱动deepseek harness

因为该模型发布不久，模型没有相关训练数据，所以由deepseekv4闪光版整理后由pro版分发为提示词包供模型使用

注意:本插件ai含量高达99.99%!!!

---

## 📦 安装

```bash
# 方式一：tarball（推荐，免构建）
dsh plugin --profile web add ./dsh-plugin-factory-0.3.0.tgz

# 方式二：Git 仓库
dsh plugin --profile web add github:ktziy/dsh-plugin-factory

# 方式三：NPM
dsh plugin --profile web add dsh-plugin-factory
```
---

## 🚀 快速开始

安装完成后，直接在 dsh 会话中对 Agent 说：

```
Use plugin_scaffold to create a plugin named weather-tool with toolName get_weather.
```

Agent 将自动返回：
- ✅ 合法的插件骨架源码
- ✅ 可直接粘贴的 `--patch` 安装片段

完整工作流程和高级用法，请参阅 [核心文档](docs/CORE.md)。

---

## 🎯 为什么需要它？

dsh 插件开发有一套**严格的契约规范**：
- `apply(ctx)` 生命周期函数
- `defineTool` 工具定义
- Schema DSL 硬约束

模型缺乏针对性的训练数据，直接生成代码容易出现 API 幻觉。本插件将这些契约规范打包成 **「文档 + 脚手架 + 校验器」** 三个工具，从源头约束 Agent 输出，确保生成代码的合法性。

---

## 🛠️ 工具能力

| 工具 | 功能说明 |
|------|----------|
| `plugin_doc` | 按主题读取开发契约文档（core / tools / services / llm / compose / preset / client） |
| `plugin_scaffold` | 生成插件骨架，支持 6 种 kind：tool / service / event / llm-adapter / client / client-node |
| `plugin_validate` | 基于守卫规则静态自查（tool 的 defineTool 规则 + client 的 apply/inject/slots） |

---

## 🧠 工作原理

```
用户需求
   ↓
Agent 调用 plugin_doc 读取契约规范
   ↓
调用 plugin_scaffold 生成合法骨架
   ↓
调用 plugin_validate 自查校验
   ↓
利用 dsh 的 fs/bash 工具落盘
   ↓
通过 dsh plugin add 加载插件
   ↓
✅ 插件就绪
```

---

## 📸 效果预览

> 待补充：`docs/` 
---

## ✨ 开发进度

| 侧 | 类型 | 完成度 |
|---|---|---|
| **Host 侧** | Tool 工具 | ✅ 文档 + 脚手架 + 校验 |
| | Service 服务 | ✅ 新增脚手架（Service 类 + declare module） |
| | 事件监听/拦截 | ✅ 新增脚手架（ctx.on + 分发模式提示） |
| | 配置 | ✅ 文档 + scaffold 带 Config 示例 |
| | LLM 适配器 | ✅ 新增脚手架（LlmAdapter + StreamChunk 协议） |
| | 打包/发布 | ✅ 文档 + 包本身是 bundle |
| **Client 侧** | Client UI 插件（settings.section） | ✅ 文档 + 脚手架 + 校验 + 构建 + 挂载实测 |
| | 对话节点 UI | ✅ 新增脚手架（ConversationNodeDefinition 全套） |
| | 其他槽位 | ✅ 文档覆盖（client.md §3 完整清单）+ 两个代表模板 |

**plugin_scaffold 现在支持 6 种 kind：**

| kind | 说明 |
|---|---|
| `tool` | Host 工具（defineTool） |
| `service` | Host Service 类 |
| `event` | Host 事件监听 |
| `llm-adapter` | Host LLM 适配器 |
| `client` | Web UI 插件（settings.section 槽位） |
| `client-node` | Web UI 对话节点 |

✅ 无模型自测 6 种全部通过，编译通过，打包 29KB。

---
## 📄 License

MIT © [ktziy](https://github.com/ktziy)

---
