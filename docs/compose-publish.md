# compose-publish.md — 组合、打包、安装、发布

> 让插件能加载（cordis.yml / patch）、能安装（bundle / profile / tarball）。最终落地必读。

## 1. cordis.yml 条目键

```yaml
- id: greeter            # 稳定标识（patch 定位用；无 id 每次重读都会重新挂载）
  name: './greeter.ts'   # 插件模块路径（--patch 场景必须绝对；Windows 必须 file:///C:/...）或包名（bundle 场景）
  inject: [myCap]        # 覆盖/追加依赖（少见）
  config: {...}          # 插件配置（支持 !!js 表达式）
  disabled: !!js process.platform === 'win32'   # 禁用（支持 !!js 按环境门控）
# 组（group）：
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate: { shell: true }   # 组内独立的 shell 实例
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config: { timeoutMs: 5000 }
    - name: './src/plugin-a.ts'
```

## 2. --patch overlay 与层顺序

patch 文件是 YAML 数组（`insert` 用于追加新行）：

```yaml
- insert:
    - id: hello
      name: 'file:///C:/absolute/path/to/my-plugin.ts'   # Windows 必须 file:///
```

层顺序（后应用者按行胜出；按 id 整行替换 config，**不深合并**）：

1. profile 的 `dsh.profile.bundles`（列表顺序；先是 `@deepseek-ai/dsh-base`）
2. profile 的 `cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml`（机器级）
4. `--patch <path>` overlays（argv 顺序）

- 覆盖某行必须**重述该行的每一个键**（整行替换）。
- launcher flag 必须在 app flag 之前：`pnpm dsh web --patch <f.yml> --port 3090`（`--patch` 归 launcher，`--port` 归 web app）。

## 3. bundle（组合包）与 profile

- **bundle**：npm 包 + `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；patch 行按**包名**引用插件（Node 模块解析找得到）。不声明 `dsh.bundle` 的包只是普通依赖。
- **profile**：`$DSH_HOME/profiles/<name>/`（$DSH_HOME 默认 `~/.dsh`），含 package.json（`dsh.profile.bundles`）+ 用户 `cordis.patch.yml`。
- 命令：`dsh plugin --profile demo add ./hello-plugin`、`dsh plugin --profile demo remove dsh-hello-plugin`、`dsh --profile demo --dump-config`、`dsh --profile demo`。

## 4. 分发（免构建授权）

- **git 安装**（`dsh plugin add github:you/hello-plugin`）：拉源码不构建；作者需提供自包含 `prepare` 脚本；pnpm≥10 需在 profile 的 pnpm-workspace.yaml 配 `allowBuilds` 授权（只授权可信源码）。
- **分发免授权**（推荐）：
  - npm 发布：`pnpm publish`（构建 lib/）
  - 或 `pnpm pack` 打 tarball：`dsh plugin add ./hello-plugin-0.1.0.tgz`
- 预构建的 tarball 安装**不需要** npm 账号、不需要目标机器有构建环境。

## 5. Schemastery API 速查（配置校验）

```ts
Schema.object({ field: Schema.string().required().default('x'), ... })
Schema.string().required() / .default(v) / .min(n) / .max(n) / .pattern(re)
Schema.number() / Schema.integer() / Schema.boolean()
Schema.array(Schema.string())   // 数组
Schema.union(['fast', 'accurate'])   // 字面量联合
Schema.intersect([A, B])        // 组合
```

插件 `Config` 导出必须是 Standard Schema（Schemastery 生成）；普通对象无效。校验失败 → fiber FAILED + 明确错误。

## 6. 验证你的插件

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml --port 3090   # 看启动日志确认加载
pnpm dsh --profile web --dump-config                            # 查看实际配置树（# == 标注每层来源）
pnpm dsh --profile headless --patch <f.yml> "<任务>"            # headless 端到端（无需 Web UI）
```

- 无模型自测工具逻辑：插件 apply 内 `await ctx.tools.execute({ callId, name, arguments, signal })`（见 services-events.md §2.4）。
- 改插件源码或 cordis.yml → HMR 自动生效。
