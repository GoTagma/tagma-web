---
title: SDK
description: Drive Tagma pipelines from your own TypeScript — createTagma, the approval gateway, pipeline CRUD.
group: SDK & CLI
order: 300
updated: 2026-05-08
---

The Tagma runtime is split across three packages so hosts can compose only what they need:

- [`@tagma/types`](https://github.com/GoTagma/tagma-mono/tree/main/packages/types) — shared wire contracts (configs, plugin interfaces, run events, prompt document). No runtime, no I/O.
- [`@tagma/core`](https://github.com/GoTagma/tagma-mono/tree/main/packages/core) — runtime-independent orchestration: DAG executor, plugin registry, approval gateway, logger, dataflow / prompt-doc helpers, and the `TagmaRuntime` interface. Depends on `@tagma/types` only.
- [`@tagma/runtime-bun`](https://github.com/GoTagma/tagma-mono/tree/main/packages/runtime-bun) — Bun implementation of `TagmaRuntime` (process spawn, file watch, log storage) plus stdin / WebSocket approval adapters.
- [`@tagma/sdk`](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk) — Bun-first convenience layer that composes core + runtime-bun + built-in plugins (`opencode` driver, `manual` / `file` triggers, `exit_code` / `file_exists` / `output_check` completions, `static_context` middleware). This is what the editor and the CLI both use.

## Install

```sh
bun add @tagma/sdk @tagma/types
```

> **Bun-only.** `@tagma/sdk` and `@tagma/runtime-bun` use `Bun.spawn` / `Bun.file` / `Bun.serve`. The SDK ships a preinstall guard that aborts under `npm` / `yarn` / `pnpm`. Use Bun **≥ 1.3**.

For lower-level integration (custom runtime, non-Bun host) install `@tagma/core` directly and pass your own `runtime: TagmaRuntime` to `runPipeline()`.

## Quick start

```ts
import { createTagma } from '@tagma/sdk';
import { loadPipeline } from '@tagma/sdk/yaml';
import { InMemoryApprovalGateway } from '@tagma/sdk/approval';
import { attachStdinApprovalAdapter } from '@tagma/runtime-bun/adapters/stdin-approval';

const tagma = createTagma();             // built-ins are registered by default

const yaml = await Bun.file('./pipeline.yaml').text();
const config = await loadPipeline(yaml, process.cwd());

const approvalGateway = new InMemoryApprovalGateway();
const stdin = attachStdinApprovalAdapter(approvalGateway);

try {
  const result = await tagma.run(config, {
    cwd: process.cwd(),
    approvalGateway,
    onEvent: (ev) => console.log(ev.type, ev),
  });
  process.exit(result.success ? 0 : 1);
} finally {
  stdin.detach();
}
```

That's it. `createTagma()` returns an isolated SDK instance with its own `PluginRegistry`; `tagma.run()` validates the config, loads any `pipeline.plugins` not already pre-loaded, and executes the DAG.

## Subpath imports

`@tagma/sdk` is intentionally narrow at its root — most APIs ship under explicit subpaths so trees stay shakeable and the public surface stays auditable.

| Subpath                       | What lives here                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@tagma/sdk`                  | `createTagma`, `bunRuntime`, `definePipeline`, `PluginRegistry`, trigger errors, plus stable types from `@tagma/types`. |
| `@tagma/sdk/yaml`             | YAML round-trip: `loadPipeline`, `parseYaml`, `resolveConfig`, `serializePipeline`, `deresolvePipeline`, `validateConfig`, `compileYamlContent`. |
| `@tagma/sdk/config`           | Pure immutable config CRUD (`createEmptyPipeline`, `upsertTask`, …), `validateRaw`, DAG helpers. Safe in renderer processes. |
| `@tagma/sdk/plugins`          | `bootstrapBuiltins(registry)`, `PluginRegistry`, `isValidPluginName`, `readPluginManifest`. |
| `@tagma/sdk/dataflow`         | Pure helpers backing typed task bindings: `substituteInputs`, `extractInputReferences`, `resolveTaskInputs`, `extractTaskOutputs`, `inferPromptPorts`. No I/O. |
| `@tagma/sdk/pipeline-runner`  | `PipelineRunner` lifecycle wrapper for hosts that manage multiple concurrent runs. |
| `@tagma/sdk/approval`         | `InMemoryApprovalGateway` and the approval type re-exports. |
| `@tagma/sdk/utils`            | `parseDuration`, `validatePath`, `generateRunId`, `nowISO`, `truncateForName`. |

The Bun-specific approval adapters live in `@tagma/runtime-bun`, **not** `@tagma/sdk`:

```ts
import { attachStdinApprovalAdapter } from '@tagma/runtime-bun/adapters/stdin-approval';
import { attachWebSocketApprovalAdapter } from '@tagma/runtime-bun/adapters/websocket-approval';
```

`@tagma/runtime-bun` ships transitively when you `bun add @tagma/sdk` — you don't need a separate dependency.

## `createTagma(options?)`

Creates an isolated SDK instance. Use one per workspace / per process; concurrent runs may share an instance freely.

```ts
const tagma = createTagma({
  registry,             // optional: existing PluginRegistry to share across instances
  builtins: true,       // default: register the SDK's built-in plugins into the registry
  plugins: [],          // package-level TagmaPlugin objects to register at construction
  runtime,              // optional: override TagmaRuntime (defaults to bunRuntime())
});
```

Returns:

```ts
{
  registry: PluginRegistry,
  run(config, { cwd, ...runOptions }): Promise<EngineResult>,
  validate(config): readonly string[],
}
```

`tagma.validate(config)` is offline — it returns the same string error list as `validateConfig`. `tagma.run` validates *with* `workDir` for cwd-safety, then executes.

### `tagma.run(config, options)`

| Option              | Notes                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `cwd`               | **Required.** Absolute working directory. Relative paths in YAML resolve here. Logs land under `<cwd>/.tagma/logs/<runId>/`. |
| `approvalGateway`   | Custom `ApprovalGateway`. Defaults to a fresh `InMemoryApprovalGateway`.                                       |
| `signal`            | `AbortSignal` to cancel the run externally — `run_end.abortReason === 'external'`.                             |
| `onEvent`           | Callback for every `RunEventPayload` (see below).                                                              |
| `runId`             | Caller-supplied run id. Must match `run_[A-Za-z0-9_-]{1,128}`. Lets the host align its own log dir with the SDK's. |
| `maxLogRuns`        | Number of per-run log dirs to retain under `<cwd>/.tagma/logs/`. Default `20`. `0` disables pruning.            |
| `maxConcurrency`    | Cap on simultaneously running tasks. Defaults to unlimited. Falls back to `config.max_concurrency`.            |
| `mode`              | Override `config.mode`. Defaults to `safe`. See [pipeline-yaml#mode](/docs/pipeline-yaml#mode).                  |
| `safeModeAllowlist` | Extends the default safe-mode allowlist (`{ drivers, triggers, completions, middlewares }`).                   |
| `envPolicy`         | Child-process env policy: `{ mode: 'minimal' }` (default), `{ mode: 'inherit' }`, or `{ mode: 'allowlist', keys: [...] }`. |
| `logPrompt`         | When `true`, writes the final middleware-expanded prompt into `pipeline.log`. Default `false`.                  |
| `skipPluginLoading` | Skip the engine's automatic `loadPlugins(config.plugins)` call. Set this when the host has already pre-loaded plugins from a custom path (e.g. the editor's workspace `node_modules`). |

Returns `{ success, runId, logPath, summary, states }`. `summary` is `{ total, success, failed, skipped, timeout, blocked }`. `states` is a `ReadonlyMap<taskId, TaskState>` — useful for post-run inspection.

> **stdout / stderr persistence.** With the default Bun runtime, the engine streams every task's stdout/stderr to disk under `<cwd>/.tagma/logs/<runId>/<taskId>.stdout` and `.stderr`. The strings on `TaskResult.stdout` / `stderr` are bounded **tails** (default 8 MB stdout, 4 MB stderr) and start with a `[…N bytes truncated from head — full output: <path>]` marker when truncated. Read `TaskResult.stdoutPath` / `stderrPath` for the full bytes; `stdoutBytes` / `stderrBytes` carry the original counts so UIs can render "32 MB (truncated)" without re-stat'ing the file.

## Run events (`onEvent`)

Every variant of `RunEventPayload` carries `runId`. The editor server stamps a per-run monotonic `seq` on top before broadcasting over SSE (producing a `WireRunEvent`); the SDK itself does not stamp `seq`.

| Event                | Carries                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `run_start`          | `tasks: RunTaskState[]` — wire-shape snapshot of every task at idle. Fires only after the `pipeline_start` hook allows the run; a blocked pipeline emits no wire events at all. |
| `task_update`        | Flat partial fields (`status`, `startedAt?`, `finishedAt?`, `durationMs?`, `exitCode?`, `stdout?`, `stderr?`, `stdoutPath?`, `stderrPath?`, `stdoutBytes?`, `stderrBytes?`, `sessionId?`, `normalizedOutput?`, `outputs?`, `inputs?`, `resolvedDriver?`, `resolvedModel?`, `resolvedPermissions?`). Clients fold partial updates with `??` semantics. Terminal-state locking guarantees at most one terminal event per task. |
| `task_log`           | Structured log line — mirrors every `Logger` call (info / warn / error / debug / section / quiet) with `{ taskId: string \| null, level, timestamp, text }`. Pipeline-wide messages (config dump, DAG topology) carry `taskId: null`. |
| `run_end`            | `success: boolean`, `abortReason: 'timeout' \| 'stop_all' \| 'external' \| null`. `null` means the run finished on its own (failures may still have happened — read `success`). |
| `run_error`          | Reserved for fatal engine errors surfaced to subscribers; `error: string`.                                    |
| `approval_request` / `approval_resolved` | Bridged from the approval gateway so hosts see approvals on the same channel as task updates. |

## Plugin registry

`PluginRegistry` is the canonical home for handler resolution. The engine resolves driver / trigger / completion / middleware types from it at run time.

```ts
import { PluginRegistry } from '@tagma/sdk';
import { bootstrapBuiltins } from '@tagma/sdk/plugins';

const registry = new PluginRegistry();
bootstrapBuiltins(registry);                                 // registers SDK built-ins
await registry.loadPlugins(['@tagma/driver-codex'], cwd);    // dynamic import + register
const handler = registry.getHandler('drivers', 'codex');
const types = registry.listRegistered('triggers');
const exists = registry.hasHandler('completions', 'llm_judge');
```

| Method                                                | Purpose                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `loadPlugins(names, resolveFrom?)`                    | Dynamically import packages and register every capability from each `TagmaPlugin` default export. `resolveFrom` is the workspace root for `node_modules` lookup. |
| `registerTagmaPlugin(plugin, options?)`               | Register every capability from a `TagmaPlugin`. Duplicate `(category, type)` pairs fail unless `replace: true`. |
| `registerPlugin(category, type, handler, options?)`   | Register one capability handler manually.                                                          |
| `getHandler(category, type)`                          | Throws on miss.                                                                                    |
| `hasHandler(category, type)`                          | Boolean lookup.                                                                                    |
| `listRegistered(category)`                            | List type names registered in `'drivers' \| 'triggers' \| 'completions' \| 'middlewares'`.         |

A plugin handler may declare a `schema: PluginSchema` so editors render typed forms and `validateRaw` / engine preflight catches invalid configs at the YAML layer (out-of-enum values, bad duration strings, missing required fields). See [Custom Plugins → Plugin schemas](/docs/custom-plugins#plugin-schemas).

## `PipelineRunner`

Higher-level wrapper for managing multiple concurrent pipeline runs — designed for sidecar / Tauri IPC scenarios where the frontend controls pipeline lifecycle by ID.

```ts
import { PipelineRunner } from '@tagma/sdk/pipeline-runner';

const runner = new PipelineRunner(config, workDir, {
  registry,
  runtime,
  approvalGateway,
});

const unsubscribe = runner.subscribe((event) => forwardToUI(event));
runner.start();      // returns Promise<EngineResult>, idempotent
runner.abort();
const tasks = runner.getTasks(); // ReadonlyMap<taskId, RunTaskState>
```

Properties:

- `instanceId` — stable id assigned at construction, safe to use as a Map key before `start()`.
- `runId` — engine-assigned; `null` until the first `run_start`.
- `status` — `'idle' \| 'running' \| 'done' \| 'aborted' \| 'failed'`. `aborted` covers caller-initiated `abort()`; `failed` covers engine errors (preflight / config / plugin-load) thrown out of `run()`.

The runner folds `run_start` / `task_update` / `task_log` events into the wire-shape `RunTaskState` map, so hosts can read `getTasks()` without buffering the event stream themselves. Per-task log buffers are capped at `TASK_LOG_CAP` (500 lines); pipeline-wide log lines (`taskId: null`) are not folded into any task buffer and only surface through `subscribe()`.

## Parsing, resolving, serialising

Imported from `@tagma/sdk/yaml`:

| Export                                | Purpose                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `loadPipeline(yaml, workDir)`         | One-shot parse → resolve → validate. Returns a `PipelineConfig` ready for `tagma.run()`.                                                |
| `parseYaml(content)`                  | YAML → `RawPipelineConfig`. Use for edit-and-save flows that must preserve relative paths and user formatting.                            |
| `resolveConfig(raw, workDir)`         | `RawPipelineConfig` → `PipelineConfig`. Applies inheritance and resolves file paths.                                                      |
| `deresolvePipeline(cfg, workDir)`     | `PipelineConfig` → `RawPipelineConfig`. Strips injected defaults and converts absolute paths back to relative for portable YAML.          |
| `serializePipeline(raw)`              | `RawPipelineConfig` → YAML string. Pair with `parseYaml` / `deresolvePipeline`.                                                          |
| `validateConfig(cfg, workDir?)`       | Final pre-run DAG + cwd-safety check on a resolved config. Returns string errors (empty = valid).                                        |
| `compileYamlContent(yaml, opts?)`     | One-shot YAML → diagnostics for editor compile flows. Distinguishes parse errors from validation errors and never crashes on half-built YAML. |

Imported from `@tagma/sdk/config`:

| Export                                | Purpose                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `validateRaw(raw, knownTypes?)`       | Returns `ValidationError[]` on a raw config. Checks required fields, `prompt`/`command` exclusivity, dup IDs, ref integrity, cycles, binding shapes, `{{inputs.<name>}}` references, and (when `knownTypes` is supplied) plugin-type warnings + per-field schema errors. |
| `buildRawDag(raw)`                    | Topology of a raw config as `{ nodes, edges }` — for live rendering while editing. Unresolvable refs are silently skipped.          |
| `buildDag(config)`                    | Topological sort of a resolved `PipelineConfig`.                                                                                    |
| Config CRUD                           | Pure immutable helpers below.                                                                                                       |

### Config CRUD (`@tagma/sdk/config`)

Pure immutable helpers for building and editing `RawPipelineConfig` in a visual editor — no runtime deps, safe in renderer processes.

| Function                                          | Description                                                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `createEmptyPipeline(name)`                       | Create a minimal pipeline config.                                                                                                               |
| `setPipelineField(config, fields)`                | Update top-level pipeline fields.                                                                                                               |
| `upsertTrack(config, track)`                      | Insert or replace a track by id.                                                                                                                |
| `removeTrack(config, trackId)`                    | Remove a track.                                                                                                                                 |
| `moveTrack(config, trackId, toIndex)`             | Reorder a track.                                                                                                                                |
| `updateTrack(config, trackId, fields)`            | Patch track fields (not tasks).                                                                                                                 |
| `upsertTask(config, trackId, task)`               | Insert or replace a task.                                                                                                                       |
| `removeTask(config, trackId, taskId, cleanRefs?)` | Remove a task; pass `cleanRefs: true` to also strip dangling `depends_on` / `continue_from` references that resolve to the deleted task.        |
| `moveTask(config, trackId, taskId, toIndex)`      | Reorder a task within its track.                                                                                                                |
| `transferTask(config, from, taskId, to, qualify?)` | Move a task across tracks. When `qualify` is `true` (default), bare refs to / from the moved task are rewritten to `trackId.taskId` two-pass so same-track shorthand stays correct after the move. |

`transferTask` is a no-op when the target track doesn't exist or already has a task with that id — it never silently drops the source or overwrites a destination task.

## Approvals

```ts
import { InMemoryApprovalGateway } from '@tagma/sdk/approval';
import { attachStdinApprovalAdapter } from '@tagma/runtime-bun/adapters/stdin-approval';
import { attachWebSocketApprovalAdapter } from '@tagma/runtime-bun/adapters/websocket-approval';

const gateway = new InMemoryApprovalGateway();
const stdin = attachStdinApprovalAdapter(gateway);
const ws = attachWebSocketApprovalAdapter(gateway, { port: 3000 });

await tagma.run(config, { cwd, approvalGateway: gateway });

stdin.detach();
ws.detach();
```

Multiple adapters can attach simultaneously — the first decision wins. Trigger plugins request approval via `ctx.approvalGateway.request(...)`; see how the built-in `manual` trigger does it. Throw `TriggerBlockedError` for user / policy rejections and `TriggerTimeoutError` for genuine wait timeouts so the engine sets the right `TaskStatus`.

```ts
import { TriggerBlockedError, TriggerTimeoutError } from '@tagma/sdk';

throw new TriggerBlockedError('Access denied by policy');
throw new TriggerTimeoutError('File did not appear within 30s');
```

## Logger

The `Logger` is exported from `@tagma/core` (the SDK does not re-export it). Combined with `bunRuntime().logStore`, it writes a per-run log file at `<workDir>/.tagma/logs/<runId>/pipeline.log` and (optionally) emits structured records to a callback that the engine forwards as `task_log` events:

```ts
import { Logger, type LogRecord } from '@tagma/core';
import { bunRuntime } from '@tagma/sdk';

const logger = new Logger(workDir, runId, bunRuntime().logStore, (record: LogRecord) => {
  // record = { level, taskId, timestamp, text }
  forwardToUI(record);
});

logger.info('[track]', 'message');     // console + file
logger.warn('[track]', 'message');
logger.error('[track]', 'message');
logger.debug('[track]', 'message');    // file only
logger.section('Title', taskId?);      // file only — visual separator
logger.quiet(bulkText, taskId?);       // file only — bulk payload
logger.path;                           // log file path
logger.dir;                            // run artifact directory
logger.close();                        // closed automatically by tagma.run
```

The `taskId` is extracted from a `[task:<id>]` prefix on each line, or pass it explicitly to `section` / `quiet` (which carry no prefix). Pipeline-wide messages (config dump, DAG topology, untagged hook output) carry `taskId: null` in `task_log` events.

## Dataflow helpers

Pure helpers backing typed task bindings. Imported from `@tagma/sdk/dataflow`:

| Function                                                                | Description                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `substituteInputs(text, inputs)`                                        | Expand `{{inputs.<name>}}` placeholders. Returns `{ text, unresolved }`. Strings pass through, numbers/booleans coerce via `String(...)`, objects/arrays via `JSON.stringify`. Caller handles shell quoting.                                              |
| `extractInputReferences(text)`                                          | Set of input port names referenced in `text`. Use at edit time to flag undeclared references.                                                                                                                                                              |
| `resolveTaskBindingInputs(task, upstreamData, dependsOn)`               | Resolve lightweight task-level `inputs` from literal values, upstream outputs, stdout/stderr, normalized output, defaults, and required flags.                                                                                                             |
| `resolveTaskInputs(task, upstreamOutputs, dependsOn)`                   | Gather port input values for a typed task. Returns `{ kind: 'ready', inputs, missingOptional }` or `{ kind: 'blocked', missingRequired, ambiguous, typeErrors, reason }`.                                                                                  |
| `extractTaskBindingOutputs(outputs, stdout, stderr, normalizedOutput)`  | Publish lightweight task-level `outputs` from final-line JSON, stdout/stderr, normalized output, literal values, or defaults.                                                                                                                              |
| `extractTaskOutputs(ports, stdout, normalizedOutput)`                   | Internal helper for inferred prompt contracts.                                                                                                                                                                                                              |
| `inferPromptPorts(...)`                                                 | Builds the inferred `[Inputs]` / `[Output Format]` blocks for a prompt task from neighboring command tasks.                                                                                                                                                 |

Prompt-document helpers (`prependContext`, `appendContext`, `renderInputsBlock`, `renderOutputSchemaBlock`, `serializePromptDocument`) live in `@tagma/core` and are not re-exported through any `@tagma/sdk` subpath. Custom drivers / engines that need them should import from `@tagma/core` directly.

## Utilities

Imported from `@tagma/sdk/utils`:

| Function                              | Description                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `parseDuration(input)`                | Parses `"30s"`, `"5m"`, `"2h"` → milliseconds.                                                                            |
| `validatePath(filePath, projectRoot)` | Resolves path, throws if it escapes the project root.                                                                     |
| `generateRunId()`                     | Generates a unique run ID (`run_<ts>_<seq>_<rand>`).                                                                      |
| `nowISO()`                            | `new Date().toISOString()`.                                                                                               |
| `truncateForName(text, maxLen?)`      | Truncates first line to `maxLen` (default 40) for display.                                                                |

`tailLines(text, n)` and `clip(text, maxBytes?)` live in `@tagma/core`; import from there directly when you need them.

## Wire protocol constants

| Constant                | Where exported       | Notes                                                                                                                       |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `RUN_PROTOCOL_VERSION`  | `@tagma/sdk`         | Bumped whenever `RunEventPayload` / `WireRunEvent` change incompatibly. Editor server echoes this on connect (`X-Tagma-Run-Protocol`). |
| `TASK_LOG_CAP`          | `@tagma/sdk`         | Max log lines retained per task in the SSE replay buffer / client reducer / `PipelineRunner` mirror. Currently `500`.        |

## Type definitions

See [`@tagma/types`](https://github.com/GoTagma/tagma-mono/tree/main/packages/types) for every wire shape:

- **Config**: `PipelineConfig`, `RawPipelineConfig`, `TrackConfig`, `TaskConfig`, `HooksConfig`, `OnFailure`, `Permissions`, `PipelineExecutionMode`.
- **Bindings**: `TaskInputBinding`, `TaskOutputBinding`, `TaskInputBindings`, `TaskOutputBindings`, `PortType`.
- **Plugin interfaces**: `DriverPlugin`, `TriggerPlugin`, `TriggerWatchHandle`, `CompletionPlugin`, `MiddlewarePlugin`, `PluginSchema`, `PluginParamDef`, `PluginParamType`, `TagmaPlugin`, `PluginCapabilities`, `PluginManifest`, `PluginCategory`.
- **Prompt**: `PromptDocument`, `PromptContextBlock`.
- **Runtime**: `TaskStatus`, `TaskResult`, `TaskFailureKind`, `TaskState`, `SpawnSpec`, `DriverCapabilities`, `DriverContext`, `DriverResultMeta`, `TagmaRuntime`, `EnvPolicy`, `RuntimeWatchEvent`, `RuntimeLogStore`.
- **Approvals**: `ApprovalGateway`, `ApprovalRequest`, `ApprovalDecision`, `ApprovalEvent`, `ApprovalRequestHandle`, `ApprovalOutcome`.
- **Wire protocol**: `RunEventPayload`, `RunTaskState`, `RunSnapshotPayload`, `WireRunEvent`, `TaskLogLine`, `TaskLogLevel`, `AbortReason`, `RUN_PROTOCOL_VERSION`, `TASK_LOG_CAP`.

## Migrating from earlier SDK shapes

If you have code from before the package split:

| Old shape                                                              | New shape                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bootstrapBuiltins()` (free function)                                  | `createTagma()` (registers built-ins by default), or `bootstrapBuiltins(registry)` from `@tagma/sdk/plugins` for manual control. |
| `runPipeline(config, workDir, opts)` from `@tagma/sdk`                 | `createTagma().run(config, { cwd, ...opts })`. The free `runPipeline` now lives in `@tagma/core` and requires `{ registry, runtime }`. |
| `loadPlugins(names)` (free function)                                   | `tagma.registry.loadPlugins(names, resolveFrom?)`.                                                 |
| Single-export plugin (`export default Plugin`, `pluginCategory`, `pluginType`) | Default-export a `TagmaPlugin` with `capabilities: { drivers: { name: Plugin } }`. The `tagmaPlugin` package.json manifest is unchanged. |
| `attachStdinApprovalAdapter` from `@tagma/sdk`                         | `@tagma/runtime-bun/adapters/stdin-approval` (and `…/websocket-approval`).                         |
| `MiddlewarePlugin.enhance(prompt: string)` legacy API                  | `MiddlewarePlugin.enhanceDoc(doc, config, ctx)` — only the structured-document API exists now.      |
| `TriggerPlugin.watch(...): Promise<unknown>`                           | `TriggerPlugin.watch(...): { fired, dispose }` — engine calls `dispose()` on success/failure/timeout/abort. |
