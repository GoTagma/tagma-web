---
title: SDK
description: Write your own driver, trigger, completion, or middleware in TypeScript.
group: SDK & CLI
order: 300
updated: 2026-04-21
---

The Tagma runtime is [`@tagma/sdk`](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk). Plugins depend on [`@tagma/types`](https://github.com/GoTagma/tagma-mono/tree/main/packages/types) for the wire contracts and export a default object that implements the relevant plugin interface.

## Install

```sh
bun add @tagma/sdk @tagma/types
```

**Bun-only.** `@tagma/sdk` publishes pre-built JavaScript under `dist/`, but the runtime calls `Bun.spawn`, `Bun.file`, and `Bun.serve`. It will install under `npm` / `yarn` / `pnpm` without error, but **crash at runtime on Node** the first time a pipeline spawns a task. Use Bun ≥ 1.3.

## Plugin package layout

```
my-plugin/
├─ package.json       # includes "tagmaPlugin": { category, type }
├─ src/index.ts       # default-exports the plugin object
└─ tsconfig.json
```

`package.json`:

```json
{
  "name": "@acme/driver-myshell",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "tagmaPlugin": { "category": "drivers", "type": "myshell" },
  "dependencies": {
    "@tagma/types": "^0.3.0"
  }
}
```

The `tagmaPlugin` field is the sole canonical signal that a package is a Tagma plugin — hosts read it without importing the module, so no top-level side effects in your entry point.

## Writing a driver

```ts
import type {
  DriverPlugin,
  TaskConfig,
  TrackConfig,
  DriverContext,
  SpawnSpec,
} from '@tagma/types';

const MyShell: DriverPlugin = {
  name: 'myshell',

  capabilities: {
    sessionResume: false,
    systemPrompt: false,
    outputFormat: false,
  },

  resolveModel() {
    return 'default';
  },

  async buildCommand(
    task: TaskConfig,
    _track: TrackConfig,
    ctx: DriverContext,
  ): Promise<SpawnSpec> {
    return {
      args: ['my-cli', '--prompt', task.prompt ?? ''],
      cwd: task.cwd ?? ctx.workDir,
    };
  },

  // Optional: parse stdout to recover a session id, or force-fail on sentinel
  parseResult(stdout) {
    return {
      sessionId: undefined,
      normalizedOutput: stdout,
    };
  },
};

export default MyShell;

export const pluginCategory = 'drivers' as const;
export const pluginType = 'myshell' as const;
```

## Writing a trigger, completion, or middleware

The three interfaces live in `@tagma/types`: `TriggerPlugin`, `CompletionPlugin`, `MiddlewarePlugin`. Each is a small object with a single hot method:

- `TriggerPlugin.watch(config, ctx)` — resolves (or throws) when the gate opens. Use `ctx.approvalGateway` for human-in-the-loop and `ctx.signal` to abort cleanly.
- `CompletionPlugin.check(config, result, ctx)` — returns `true` iff the task succeeded.
- `MiddlewarePlugin.enhanceDoc(doc, config, ctx)` — returns a new `PromptDocument` with extra context blocks. Prefer `enhanceDoc` over the legacy `enhance(prompt: string)`.

Middleware example (mirrors the built-in `static_context`):

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  MiddlewarePlugin,
  PromptDocument,
  MiddlewareContext,
} from '@tagma/types';

const StaticContext: MiddlewarePlugin = {
  name: 'static_context',
  async enhanceDoc(doc, config, ctx): Promise<PromptDocument> {
    const file = String(config.file ?? '');
    const label = String(config.label ?? `Reference: ${file}`);
    try {
      const content = await readFile(resolve(ctx.workDir, file), 'utf8');
      return { ...doc, contexts: [...doc.contexts, { label, content }] };
    } catch {
      return doc; // fail-open
    }
  },
};

export default StaticContext;
export const pluginCategory = 'middlewares' as const;
export const pluginType = 'static_context' as const;
```

## Using the SDK directly

You can also drive the runtime from your own program — this is exactly what the CLI does:

```ts
import {
  bootstrapBuiltins,
  loadPipeline,
  loadPlugins,
  runPipeline,
  InMemoryApprovalGateway,
} from '@tagma/sdk';

bootstrapBuiltins();

const config = await loadPipeline(await Bun.file('./pipeline.yaml').text(), process.cwd());
if (config.plugins?.length) await loadPlugins(config.plugins);

const approvalGateway = new InMemoryApprovalGateway();
const result = await runPipeline(config, process.cwd(), {
  approvalGateway,
  onEvent: (ev) => console.log(ev.type, ev),
});

process.exit(result.success ? 0 : 1);
```

## API Reference

The SDK README in the monorepo is the authoritative source; this section summarises the public surface most callers need.

### Runtime entry points

| Export                | Signature                                                                       | Purpose                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bootstrapBuiltins()` | `() => void`                                                                    | Registers the built-in drivers, triggers, completions, and middlewares. Idempotent. Call once at process start.        |
| `loadPipeline`        | `(yaml: string, workDir: string) => Promise<PipelineConfig>`                    | Parse YAML, resolve inheritance (pipeline → track → task), and validate.                                               |
| `loadPlugins`         | `(names: string[]) => Promise<void>`                                            | Dynamically import and register third-party plugin packages listed under `pipeline.plugins`.                           |
| `runPipeline`         | `(config, workDir, options?) => Promise<EngineResult>`                          | Execute a resolved pipeline. Returns `{ success, runId, logPath, summary, states }`.                                   |

`runPipeline` options:

| Option              | Purpose                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `approvalGateway`   | Custom `ApprovalGateway`. Defaults to `InMemoryApprovalGateway`.                                                           |
| `signal`            | `AbortSignal` to cancel the run externally.                                                                                |
| `onEvent`           | Callback invoked for every `RunEventPayload` (`run_start`, `task_update`, `task_log`, `run_end`, `approval_*`, …).         |
| `runId`             | Caller-supplied run ID. When set, the engine uses it instead of generating one — keeps caller and SDK log dirs aligned.    |
| `maxLogRuns`        | Number of per-run log directories to retain under `<workDir>/.tagma/logs/` (default 20).                                   |
| `skipPluginLoading` | Skip the engine's built-in `loadPlugins(config.plugins)` call. Set this when the host has already pre-loaded plugins.      |

### `PipelineRunner`

Higher-level wrapper for managing multiple concurrent pipeline runs — designed for sidecar / Tauri IPC scenarios where the frontend controls pipeline lifecycle by ID.

```ts
const runner = new PipelineRunner(config, workDir, options?);

const unsubscribe = runner.subscribe((event) => forwardToUI(event));
runner.start();      // returns Promise<EngineResult>, idempotent
runner.abort();
const tasks = runner.getTasks(); // ReadonlyMap<taskId, RunTaskState>
```

Properties: `instanceId` (stable ID assigned at construction), `runId` (engine-assigned, `null` until first `run_start`), `status` (`'idle' | 'running' | 'done' | 'aborted'`).

### Parsing, resolving, serialising

| Export                           | Purpose                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `parseYaml(content)`             | YAML → `RawPipelineConfig`. Use for edit-and-save flows that must preserve relative paths and user formatting.                            |
| `resolveConfig(raw, workDir)`    | `RawPipelineConfig` → `PipelineConfig`. Applies inheritance and resolves file paths against `workDir`.                                    |
| `deresolvePipeline(cfg, workDir)`| `PipelineConfig` → `RawPipelineConfig`. Strips injected defaults, converts absolute paths back to relative.                               |
| `serializePipeline(raw)`         | `RawPipelineConfig` → YAML string. Pair with `parseYaml` / `deresolvePipeline`.                                                          |

### Validation

| Export                    | Purpose                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `validateRaw(raw)`        | Returns `ValidationError[]` on a raw config — required fields, `prompt`/`command` exclusivity, dup IDs, ref integrity, cycles.      |
| `validateConfig(cfg)`     | Final pre-run DAG check on a resolved config. Returns string errors; empty = valid.                                                 |
| `buildRawDag(raw)`        | Topology of a raw config as `{ nodes: Map<taskId, RawDagNode>, edges: [{from, to}] }` — for live rendering while editing.           |

### Config CRUD (`config-ops`)

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
| `transferTask(config, from, taskId, to, qualify?)`| Move a task across tracks. When `qualify` is `true` (default), bare refs to the moved task are rewritten to `toTrackId.taskId`.                 |

### Plugin registry

| Export                                 | Purpose                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerPlugin(category, type, handler)` | Manual handler registration. Idempotent — duplicate registrations are silently ignored.                                                              |
| `getHandler(category, type)`           | Retrieve a registered handler; throws if missing.                                                                                                      |
| `hasHandler(category, type)`           | Boolean lookup.                                                                                                                                         |
| `listRegistered(category)`             | List registered handler type names (`'drivers' | 'triggers' | 'completions' | 'middlewares'`).                                                          |

### Approvals

| Export                                       | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `InMemoryApprovalGateway`                    | Default gateway used when none is passed to `runPipeline`.                                |
| `attachStdinApprovalAdapter(gateway)`        | Interactive stdin-based approval handler — used by the CLI.                              |
| `attachWebSocketApprovalAdapter(gateway, options?)` | Starts a WebSocket server for remote approval decisions — used by the CLI.               |

### Logger

Dual-channel logger (console + file). Creates a per-run log file at `<workDir>/.tagma/logs/<runId>/pipeline.log`.

```ts
import { Logger, type LogRecord } from '@tagma/sdk';

const logger = new Logger(workDir, runId, (record: LogRecord) => forwardToUI(record));
logger.info('[track]', 'message');   // console + file
logger.warn('[track]', 'message');
logger.error('[track]', 'message');
logger.debug('[track]', 'message');  // file only
logger.section('Title', taskId?);    // file only — visual separator
logger.quiet(bulkText, taskId?);     // file only — bulk payload
logger.close();                      // closed automatically by runPipeline
```

### Typed errors for trigger plugins

Third-party triggers should throw one of these so the engine classifies the task correctly (`blocked` vs `timeout`) instead of string-matching on the error message:

```ts
import { TriggerBlockedError, TriggerTimeoutError } from '@tagma/sdk';

throw new TriggerBlockedError('Access denied by policy');
throw new TriggerTimeoutError('File did not appear within 30s');
```

Built-in triggers (`manual`, `file`) throw these automatically. Plain `Error` still works but is discouraged.

### Utilities

| Function                              | Description                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `parseDuration(input)`                | Parses `"30s"`, `"5m"`, `"2h"` → milliseconds.                                                                            |
| `validatePath(filePath, projectRoot)` | Resolves path, throws if it escapes the project root.                                                                     |
| `generateRunId()`                     | Generates a unique run ID (`run_<ts>_<seq>_<rand>`).                                                                     |
| `nowISO()`                            | `new Date().toISOString()`.                                                                                               |
| `truncateForName(text, maxLen?)`      | Truncates first line to `maxLen` (default 40) for display.                                                                |
| `tailLines(text, n)`                  | Last `n` non-empty lines.                                                                                                  |
| `clip(text, maxBytes?)`               | Truncates to at most `maxBytes` UTF-8 bytes (default 16 KB), appends `…[truncated N bytes]` marker. Multi-byte safe.      |

### Type definitions

See [`@tagma/types`](https://github.com/GoTagma/tagma-mono/tree/main/packages/types) for every wire shape:

- **Config**: `PipelineConfig`, `RawPipelineConfig`, `TrackConfig`, `TaskConfig`, `HooksConfig`, `OnFailure`, `Permissions`.
- **Plugin interfaces**: `DriverPlugin`, `TriggerPlugin`, `CompletionPlugin`, `MiddlewarePlugin`, `PluginSchema`, `PluginManifest`.
- **Prompt**: `PromptDocument`, `PromptContextBlock`.
- **Runtime**: `TaskStatus`, `TaskResult`, `TaskFailureKind`, `TaskState`, `SpawnSpec`, `DriverCapabilities`, `DriverContext`, `DriverResultMeta`.
- **Approvals**: `ApprovalGateway`, `ApprovalRequest`, `ApprovalDecision`, `ApprovalEvent`.
- **Wire protocol**: `RunEventPayload`, `RunTaskState`, `RunSnapshotPayload`, `WireRunEvent`, `TaskLogLine`, `RUN_PROTOCOL_VERSION`, `TASK_LOG_CAP`.
