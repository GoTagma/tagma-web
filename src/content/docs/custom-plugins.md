---
title: Writing Custom Plugins
description: Package layout and per-category walkthroughs for drivers, triggers, completions, and middlewares.
group: SDK & CLI
order: 320
updated: 2026-05-08
---

Tagma has four plugin categories — `drivers`, `triggers`, `completions`, `middlewares`. Every category is a small TypeScript object that implements one interface from `@tagma/types`. A plugin **package** default-exports a `TagmaPlugin` capability map; the same package may bundle multiple capabilities at once. Pipelines load plugins by package name under `pipeline.plugins`; the host reads your `package.json` manifest, imports the module, and registers each capability against `(category, type)`.

> Five of [`tagma-mono`](https://github.com/GoTagma/tagma-mono)'s plugin packages ([`driver-claude-code`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-claude-code), [`driver-codex`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-codex), [`middleware-lightrag`](https://github.com/GoTagma/tagma-mono/tree/main/packages/middleware-lightrag), [`trigger-webhook`](https://github.com/GoTagma/tagma-mono/tree/main/packages/trigger-webhook), [`completion-llm-judge`](https://github.com/GoTagma/tagma-mono/tree/main/packages/completion-llm-judge)) are maintained as reference implementations — one per plugin category. Copy any of them as a scaffold. (`opencode` is the SDK's only built-in driver and lives inside `@tagma/sdk`, not as a separate package.)

## Package layout

```
my-plugin/
├─ package.json       # includes "tagmaPlugin": { category, type }
├─ src/index.ts       # default-exports a TagmaPlugin (capability map)
└─ tsconfig.json
```

### `package.json` manifest

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

The `tagmaPlugin` field is the canonical signal that a package is a Tagma plugin. Hosts read it without importing the module, so **no top-level side effects** in your entry point. Multi-capability packages may pick the primary capability they want discovery UIs to surface, even though the default export can register more than one.

### Entry-point contract

Every plugin module default-exports a `TagmaPlugin`:

```ts
import type { TagmaPlugin } from '@tagma/types';
import { MyDriver } from './my-driver';

const plugin: TagmaPlugin = {
  name: '@acme/driver-myshell',
  capabilities: {
    drivers: { myshell: MyDriver },
    // triggers / completions / middlewares are also legal here.
  },
};

export default plugin;
```

The host calls `registry.registerTagmaPlugin(plugin)` to register every capability under its `(category, type)` key. Duplicate `(category, type)` registrations fail by default; pass `{ replace: true }` (`registry.registerPlugin(...)`) only for an intentional hot replacement.

> **Plugin names** must match `^@?[a-z0-9_-]+(/[a-z0-9_-]+)?$` (`isValidPluginName` from `@tagma/sdk/plugins`). Pick something resolvable as an npm package even when distributing privately.

---

## Drivers

A driver turns a task into a process invocation.

```ts
import type {
  DriverPlugin,
  TaskConfig,
  TrackConfig,
  DriverContext,
  SpawnSpec,
  Permissions,
  TagmaPlugin,
} from '@tagma/types';

export const MyShell: DriverPlugin = {
  name: 'myshell',

  capabilities: {
    sessionResume: false,
    systemPrompt: false,
    outputFormat: false,
    // Optional: declare that this driver translates Tagma Permissions into
    // its CLI's sandbox flags and fails closed when needed.
    enforcesPermissions: false,
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
      // args[0] is the binary; the engine never spawns shell on your behalf.
      args: ['my-cli', '--prompt', task.prompt ?? ''],
      cwd: task.cwd ?? ctx.workDir,
    };
  },

  // Optional: parse stdout/stderr to recover a session id, the canonical
  // continue_from text, or to force-fail on a sentinel.
  parseResult(stdout, _stderr) {
    return {
      sessionId: undefined,
      normalizedOutput: stdout,
      // forceFailure: true marks the task failed even when the process exited 0.
      // Useful when a CLI returns {type:"error"} JSON with status 0.
    };
  },

  // Optional: map Tagma Permissions onto a CLI tool whitelist string.
  resolveTools(_permissions: Permissions) {
    return '';
  },
};

const plugin: TagmaPlugin = {
  name: '@acme/driver-myshell',
  capabilities: { drivers: { myshell: MyShell } },
};
export default plugin;
```

Key interface points:

- `capabilities` lets the engine and editor know what to offer users. Set `sessionResume: true` if your CLI supports resuming a prior session — the engine passes the upstream id via `ctx.sessionMap`. Set `enforcesPermissions: true` if the driver maps `Permissions` onto its CLI's sandbox flags and fails closed for disallowed access.
- `buildCommand` returns a `SpawnSpec` — `args` (including the binary as `args[0]`), optional `stdin`, `cwd`, `env`. The engine spawns it; you never spawn yourself.
- `parseResult` is optional; return `{ sessionId, normalizedOutput, forceFailure?, forceFailureReason? }` to classify the result. `forceFailure` marks the task failed even when the process exited 0 (`failureKind: 'parse_error'`).
- `ctx.promptDoc` is the structured `PromptDocument` after middlewares have run; `ctx.inputs` is the resolved + coerced port input map. Drivers that wrap the prompt in their own envelope can re-substitute `{{inputs.foo}}` placeholders themselves with `substituteInputs(text, ctx.inputs)` from `@tagma/sdk/dataflow`.

Reference implementations: [`@tagma/driver-claude-code`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-claude-code), [`@tagma/driver-codex`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-codex).

---

## Triggers

A trigger gates a task — the task waits until `watch` fires.

```ts
import type {
  TriggerPlugin,
  TriggerWatchHandle,
  TriggerContext,
  PluginSchema,
  TagmaPlugin,
} from '@tagma/types';
import { TriggerBlockedError, TriggerTimeoutError } from '@tagma/sdk';

const schema: PluginSchema = {
  description: 'Wait until the cron slot ticks.',
  fields: {
    cron: { type: 'string', required: true, placeholder: '*/5 * * * *' },
    timeout: { type: 'duration', placeholder: '1h' },
  },
};

export const Cron: TriggerPlugin = {
  name: 'cron',
  schema,
  watch(config, ctx: TriggerContext): TriggerWatchHandle {
    const controller = new AbortController();
    const cronExpr = String(config.cron);

    const fired = new Promise<unknown>((resolve, reject) => {
      const id = scheduleNext(cronExpr, () => resolve({ firedAt: new Date().toISOString() }));
      // Engine signals abort via ctx.signal on success, failure, timeout, or pipeline cancel.
      const onAbort = () => {
        clearScheduled(id);
        reject(new TriggerBlockedError('Cron watch aborted'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });

    return {
      fired,
      dispose(_reason?: string) {
        controller.abort();
      },
    };
  },
};

const plugin: TagmaPlugin = {
  name: '@acme/trigger-cron',
  capabilities: { triggers: { cron: Cron } },
};
export default plugin;
```

Key points:

- `watch` returns a `TriggerWatchHandle: { fired, dispose }`. `fired` resolves when the gate opens; reject to block the task. The engine calls `dispose()` on success, failure, task timeout, and pipeline abort — release every watcher / listener / server / approval resource there.
- Throw **`TriggerBlockedError`** for user/policy rejections and **`TriggerTimeoutError`** for genuine wait timeouts (both from `@tagma/sdk`). The engine maps these onto `TaskStatus: 'blocked'` / `'timeout'` instead of generic failure. Plain `Error` still works but is discouraged.
- Use `ctx.approvalGateway.request(...)` if your trigger needs human approval (this is exactly how the built-in `manual` trigger does it — see `packages/sdk/src/triggers/manual.ts`).
- Always honour `ctx.signal.aborted` and the `'abort'` event so pipeline cancellation is clean.
- Use `ctx.runtime` for IO/timing primitives so your trigger works under non-Bun test runtimes.
- The optional `schema` enables a typed form in the editor; without it users fall back to raw key/value editing.

Reference implementation: [`@tagma/trigger-webhook`](https://github.com/GoTagma/tagma-mono/tree/main/packages/trigger-webhook).

---

## Completions

A completion decides whether a finished task actually succeeded. Without one, success = exit code 0.

```ts
import type {
  CompletionPlugin,
  CompletionContext,
  TaskResult,
  TagmaPlugin,
} from '@tagma/types';

export const RegexCheck: CompletionPlugin = {
  name: 'regex_check',
  schema: {
    description: 'Pass only if stdout matches the pattern.',
    fields: {
      pattern: { type: 'string', required: true, placeholder: '^PASS$' },
    },
  },
  async check(
    config: Record<string, unknown>,
    result: TaskResult,
    _ctx: CompletionContext,
  ): Promise<boolean> {
    const pattern = String(config.pattern ?? '');
    if (!pattern) return false;
    return new RegExp(pattern).test(result.stdout);
  },
};

const plugin: TagmaPlugin = {
  name: '@acme/completion-regex',
  capabilities: { completions: { regex_check: RegexCheck } },
};
export default plugin;
```

- `check` returns `true` iff the task succeeded. Throwing is the same as returning `false` but also logs the error.
- `result` is the raw `TaskResult` (`exitCode`, bounded `stdout` / `stderr` tails, `stdoutPath` / `stderrPath` for the full bytes on disk, `stdoutBytes` / `stderrBytes` for the original byte counts, `durationMs`, `sessionId`, `normalizedOutput`, `failureKind`, `outputs`).

Reference implementation: [`@tagma/completion-llm-judge`](https://github.com/GoTagma/tagma-mono/tree/main/packages/completion-llm-judge).

---

## Middlewares

A middleware augments a task's prompt **document** before the driver sees it.

```ts
import type {
  MiddlewarePlugin,
  MiddlewareContext,
  PromptDocument,
  TagmaPlugin,
} from '@tagma/types';

export const InjectGitStatus: MiddlewarePlugin = {
  name: 'git_status',
  async enhanceDoc(
    doc: PromptDocument,
    _config: Record<string, unknown>,
    ctx: MiddlewareContext,
  ): Promise<PromptDocument> {
    try {
      const proc = Bun.spawnSync(['git', 'status', '--short'], { cwd: ctx.workDir });
      const status = new TextDecoder().decode(proc.stdout).trim() || '(clean)';
      return {
        ...doc,
        contexts: [...doc.contexts, { label: 'Git status', content: status }],
      };
    } catch {
      return doc; // fail-open
    }
  },
};

const plugin: TagmaPlugin = {
  name: '@acme/middleware-git-status',
  capabilities: { middlewares: { git_status: InjectGitStatus } },
};
export default plugin;
```

### Composition rules (read before shipping)

- **Append context blocks; do not rewrite `doc.task`.** Middlewares are expected to *augment*, not rewrite intent. The only legitimate exception is a deliberate transformation like translation — and even then say so in the plugin name.
- **Fail-open.** On retrieval errors, missing files, or any recoverable failure, return `doc` unchanged. Don't throw.
- **Don't assume order.** You receive whatever the previous middleware produced, and the driver may wrap your output further (e.g. OpenCode's `agent_profile` adds a `[Role]…[Task]…` preamble around the serialized document).
- The interface only has `enhanceDoc`. The string-in / string-out `enhance` API has been removed.

Reference implementation: [`@tagma/middleware-lightrag`](https://github.com/GoTagma/tagma-mono/tree/main/packages/middleware-lightrag).

---

## Plugin schemas

Each plugin handler may expose a declarative `schema: PluginSchema` so the editor renders a typed form (instead of a raw key/value editor) and so `validateRaw` / engine preflight catches typos and out-of-range values *before* the pipeline runs.

```ts
import type { PluginSchema } from '@tagma/types';

const schema: PluginSchema = {
  description: 'Wait for an HTTP endpoint to return 2xx before the task runs.',
  fields: {
    url: { type: 'string', required: true, placeholder: 'https://...' },
    method: { type: 'enum', enum: ['GET', 'POST'], default: 'GET' },
    timeout: { type: 'duration', description: 'Give up after this long.' },
  },
};
```

Supported field types: `string`, `number`, `boolean`, `enum`, `path`, `duration`, `number-or-list`, `json`. Each field can declare `required`, `default`, `description`, `enum`, `min` / `max`, `placeholder`.

Schema errors are returned as `error` (not `warning`) by `validateRaw`, so editors block save on them. Built-in plugins (`manual` / `file` triggers, `exit_code` / `file_exists` / `output_check` completions, `static_context` middleware) all ship schemas — copy their shape when adding your own.

---

## Using your plugin without publishing

You do not need to publish to npm to use a plugin you're developing. Tagma installs local packages from two sources — a source directory or a packed `.tgz` — by recording a `file:` dependency in the workspace's `package.json` and running the workspace's package manager.

### From the editor

1. Open the **Plugins** page → **Local** tab.
2. Click **Import Local**. The dialog accepts either a directory that contains your `package.json` or a `.tgz` tarball.
3. The editor validates the `tagmaPlugin` manifest and the plugin name, writes `dependencies["@acme/my-plugin"] = "file:/abs/path"` into the workspace's `package.json`, and runs `bun install`. The new capability is loaded into the workspace's `PluginRegistry` immediately — no editor restart.

### From the command line

If you'd rather wire it up manually, add the `file:` spec to your workspace's `package.json` and install:

```jsonc
// <workspace>/package.json
{
  "dependencies": {
    "@acme/driver-myshell": "file:/abs/path/to/my-plugin"
  }
}
```

```sh
cd <workspace>
bun install
```

Or pack first, then install:

```sh
cd /abs/path/to/my-plugin
bun run build
bun pm pack                            # produces my-plugin-0.1.0.tgz

cd <workspace>
bun add ./path/to/my-plugin-0.1.0.tgz
```

In both cases the plugin ends up under `<workspace>/node_modules/@acme/driver-myshell`, which is where the editor and the CLI both look.

### Declare and use it

Once installed — local or published, same shape — reference the package by name in your pipeline:

```yaml
pipeline:
  mode: trusted                  # required for automatic plugin loading
  plugins:
    - "@acme/driver-myshell"
  tracks:
    - id: main
      driver: myshell
      tasks: [ ... ]
```

(In `safe` mode the engine refuses to auto-load `pipeline.plugins`. Pre-load via the host's registry instead, or set `mode: trusted`.)

### The dev loop

For fast iteration while writing a plugin:

1. Edit source.
2. `bun run build` to refresh `dist/`.
3. In the editor's **Plugins → Local** tab, click **Import Local** again on the same directory. The loader re-imports from the updated `dist/` and replaces the handler in the registry.

Note: Node's ESM module cache still holds the first import, so code changes take effect on **handler replacement** rather than true hot-reload. Restart the editor if you hit a stale-module issue.

## Publishing

Publishing to npm is the distribution step — it isn't required to run a plugin. Published tarballs should include both `dist/` and `src/` so consumers with sourcemaps can jump to the original TypeScript in their IDE.

```sh
bun run build      # tsc to dist/
npm publish        # or: bun publish
```

## Next

- [SDK reference](/docs/sdk) — `createTagma`, the approval gateway, pipeline CRUD, the wire event vocabulary.
- [Plugins](/docs/plugins) — built-in triggers, completions, and middlewares to compare against.
- [Drivers](/docs/drivers) — the existing driver catalog.
