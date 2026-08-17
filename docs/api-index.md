# api-index.md — official reference index (where to look up authoritative APIs)

> The generated reference pages are the AUTHORITATIVE source for every `ctx` service, event, and
> wire type. The docs below (this package's `docs/`) summarize the contract; when in doubt about a
> service/event name or signature, consult these pages instead of guessing. Never invent names.
>
> On the website (English): `https://deepseek-harness.github.io/deepseek-harness/en/reference/`
> (each page maps to a `docs/subsystems/*.md` in the repo; the same content also ships per package README).

## 1. Cordis framework API (plugin primitives)

| Page | Covers |
|---|---|
| `docs/cordis-api/context.md` | `Context` API surface (on/emit/effect/plugin/get, ...) |
| `docs/cordis-api/events.md` | event dispatch modes (emit/parallel/serial/bail/waterfall) |
| `docs/cordis-api/fiber.md` | plugin lifecycle state machine (PENDING→ACTIVE→DISPOSED) |
| `docs/cordis-api/service.md` | Service classes, provide/inject |
| `docs/cordis-api/registry.md` | fiber registry (diagnostics) |
| `docs/cordis-api/inherited.md` | inherited context semantics |

## 2. Subsystem reference pages (one page per subsystem; each carries a generated `cordis-surface` section listing its exact services and events)

### Agent core & LLM

| Page | Owns |
|---|---|
| `core.md` | agent loop, `AgentHandle`/`AgentRegistry`, `ctx.agentLoop`, delivery/cancellation/interception |
| `llm-streaming.md` | `Message`/`ContentBlock`, model request assembly, `StreamChunk` wire protocol, `LlmAdapter` contract |
| `system-prompt.md` | prompt assembly, tool-provider results, prompt sections |
| `token-meter.md` | token measurement |
| `compaction.md` | `compaction/*` events, `CompactionEngine` |
| `plan.md` | plan mode, `exit_plan_mode` review |
| `subagent.md` | subagent providers, start/run requests |
| `skills.md` | skill discovery/catalog/loading |
| `goal.md` | goals lifecycle |
| `schedule.md` | session reminders |

### Tools & execution seams

| Page | Owns |
|---|---|
| `tools.md` | full `ToolDefinition` fields, schema DSL, guarded pipeline, presentation |
| `shell.md` | bash executor (`ShellExecRequest`/`ShellRunResult`) |
| `subprocess.md` | subprocess spawn/kill/output |
| `terminal.md` | persistent terminals |
| `filesystem.md` | fs read/write/edit, observed-file state |
| `code-runtime.md` | Code Mode execution |
| `sandbox.md` | per-session confinement policy |
| `lsp.md` | LSP navigation |
| `web.md` | web search/fetch |
| `jobs.md` | background jobs (`ctx.jobs`) |
| `workflow.md` | workflow runs |
| `spill.md` | spill storage |

### Session, persistence & settings

| Page | Owns |
|---|---|
| `session.md` | full `SessionEventMap` catalog, turn lifecycle, `deriveMessages()` |
| `persistence.md` | JSONL/SQLite backends, `session/flush`, recovery |
| `session-query.md` | log queries |
| `settings.md` | `SettingsNamespace`, layered resolution |
| `credentials.md` | `CredentialRef` resolution layers |
| `storage.md` | storage backend contract |
| `attachment.md` | durable image attachments |
| `feedback.md` | per-message feedback |
| `session-title.md` | title generation |
| `session-reference.md` | cross-session references |
| `session-projection.md` | durable projection units |
| `session-telemetry.md` | telemetry sinks |

### Interaction & client

| Page | Owns |
|---|---|
| `approval.md` | one-shot user approval |
| `user-questions.md` | ask-user questions |
| `commands.md` | human command registry |
| `permission-presets.md` | permission preset layer |
| `workspace.md` | workspace registry |
| `scope.md` | scoped registration identity |
| `client-modules.md` | **web plugin table**: `dsh.client` declarations, boot graph, bundle route (client-side plugins) |
| `web-server.md` | HTTP carrier, routes, fallback seat |
| `extensions.md` | dynamic Cordis plugins/packages, approval, teardown |
| `invariants.md` | runtime invariant registry |
| `typert.md` | Remote invocation descriptors |

## 3. How to use this index

1. Know WHICH subsystem your plugin touches (tool execution → `tools.md`; a model provider → `llm-streaming.md`; session events → `session.md`; UI → `client-modules.md`).
2. Open that page's `cordis-surface` section: it lists the exact `ctx.<service>` names and event names/signatures that subsystem owns.
3. Use ONLY names found there. If a name you want is not listed anywhere, it does not exist — do not invent it.
