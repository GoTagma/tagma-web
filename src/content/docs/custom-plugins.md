---
title: Writing Custom Plugins
description: Package layout and per-category walkthroughs for drivers, triggers, completions, and middlewares.
group: SDK & CLI
order: 320
---

Tagma has four plugin categories — `drivers`, `triggers`, `completions`, `middlewares`. Every category is a small TypeScript object that implements one interface from `@tagma/types`. Pipelines load plugins by package name under `pipeline.plugins`; the host reads your `package.json` manifest, imports the module, and registers the default export against `(category, type)`.

> Five of `tagma-mono`'s plugin packages (`driver-codex`, `driver-opencode`, `middleware-lightrag`, `trigger-webhook`, `completion-llm-judge`) are maintained as reference implementations. Copy any of them as a scaffold.

## Package layout

```
my-plugin/
├─ package.json       # includes "tagmaPlugin": { category, type }
├─ src/index.ts       # default-exports the plugin object + pluginCategory + pluginType
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

The `tagmaPlugin` field is the canonical signal that a package is a Tagma plugin. Hosts read it without importing the module, so **no top-level side effects** in your entry point.

### Entry-point contract

Every plugin module must export three things:

```ts
export default MyPlugin;            // the plugin object
export const pluginCategory = 'drivers' as const;
export const pluginType = 'myshell' as const;
```

`pluginCategory` and `pluginType` MUST match the `tagmaPlugin` manifest — the loader verifies this and refuses to register on mismatch.

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

  // Optional: parse stdout to recover a session id, or force-fail on a sentinel.
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

Key interface points:

- `capabilities` lets the engine and editor know what to offer users. Set `sessionResume: true` if your CLI supports resuming a prior session (the engine will pass the id via `ctx.sessionMap`).
- `buildCommand` returns a `SpawnSpec` — `args` (including the binary as `args[0]`), optional `stdin`, `cwd`, `env`. The engine spawns it; you never spawn yourself.
- `parseResult` is optional; return `{ sessionId, normalizedOutput, forceFailure?, forceFailureReason? }` to classify the result. `forceFailure` marks the task failed even when the process exited 0 (useful when a CLI returns `{type:"error"}` JSON with status 0).
- `resolveTools(permissions)` is an optional hook that drivers can use to map the Tagma `Permissions` shape (`{read, write, execute}`) onto tool whitelists specific to their CLI.

Reference implementations: `@tagma/driver-opencode`, `@tagma/driver-codex`.

---

## Triggers

A trigger gates a task — the task waits until `watch` resolves.

```ts
import type { TriggerPlugin, TriggerContext, PluginSchema } from '@tagma/types';

const schema: PluginSchema = {
  description: 'Wait until the cron slot ticks.',
  fields: {
    cron: { type: 'string', required: true, placeholder: '*/5 * * * *' },
    timeout: { type: 'duration', placeholder: '1h' },
  },
};

const Cron: TriggerPlugin = {
  name: 'cron',
  schema,
  async watch(config, ctx: TriggerContext): Promise<unknown> {
    const cronExpr = String(config.cron);
    // Wire your own scheduler here. Honour ctx.signal for pipeline aborts.
    await new Promise<void>((resolve, reject) => {
      const id = scheduleNext(cronExpr, resolve);
      ctx.signal.addEventListener('abort', () => {
        clearScheduled(id);
        reject(new Error('Pipeline aborted'));
      }, { once: true });
    });
    return { firedAt: new Date().toISOString() };
  },
};

export default Cron;
export const pluginCategory = 'triggers' as const;
export const pluginType = 'cron' as const;
```

- `watch` resolves when the gate opens; reject to block the task.
- Use `ctx.approvalGateway.request(...)` if your trigger needs human approval (see how the built-in `manual` trigger does it).
- Always honour `ctx.signal.aborted` and `'abort'` events so pipeline cancellation is clean.
- The optional `schema` enables a typed form in the editor; without it users fall back to raw key/value.

Reference implementation: `@tagma/trigger-webhook`.

---

## Completions

A completion decides whether a finished task actually succeeded. Without one, success = exit code 0.

```ts
import type { CompletionPlugin, CompletionContext, TaskResult } from '@tagma/types';

const RegexCheck: CompletionPlugin = {
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

export default RegexCheck;
export const pluginCategory = 'completions' as const;
export const pluginType = 'regex_check' as const;
```

- `check` returns `true` iff the task succeeded. Throwing is the same as returning `false` but also logs the error.
- `result` is the raw `TaskResult` (`exitCode`, `stdout`, `stderr`, `durationMs`, `sessionId`, `normalizedOutput`, `failureKind`).

Reference implementation: `@tagma/completion-llm-judge`.

---

## Middlewares

A middleware augments a task's prompt document before the driver sees it.

```ts
import type {
  MiddlewarePlugin,
  MiddlewareContext,
  PromptDocument,
} from '@tagma/types';

const InjectGitStatus: MiddlewarePlugin = {
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

export default InjectGitStatus;
export const pluginCategory = 'middlewares' as const;
export const pluginType = 'git_status' as const;
```

### Composition rules (read before shipping)

- **Append context blocks; do not rewrite `doc.task`.** Middlewares are expected to *augment*, not rewrite intent. The only exception is a deliberate transformation like translation.
- **Fail-open.** On retrieval errors, missing files, or any recoverable failure, return `doc` unchanged. Don't throw.
- **Don't assume order.** You receive whatever the previous middleware produced, and the driver may wrap your output further (e.g. OpenCode's `agent_profile` adds a `[Role]...[Task]...` preamble).
- `enhance(prompt: string)` is the legacy string-in / string-out API and is deprecated — use `enhanceDoc` for new code.

Reference implementation: `@tagma/middleware-lightrag`.

---

## Using your plugin without publishing

You do not need to publish to npm to use a plugin you're developing. Tagma installs local packages from two sources — a source directory or a packed `.tgz` — by recording a `file:` dependency in the workspace's `package.json` and running the workspace's package manager.

### From the editor

1. Open the **Plugins** page → **Local** tab.
2. Click **Import Local**. The dialog picks either a directory that contains your `package.json` or a `.tgz` tarball.
3. The editor validates that the package has a `tagmaPlugin` manifest and a valid plugin name, writes `dependencies["@acme/my-plugin"] = "file:/abs/path"` into the workspace's `package.json`, and runs `bun install` for you. The plugin is then loaded into the SDK registry and usable immediately — no restart.

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
  plugins:
    - "@acme/driver-myshell"
  tracks:
    - id: main
      driver: myshell
      tasks: [ ... ]
```

### The dev loop

For fast iteration while writing a plugin:

1. Edit source.
2. `bun run build` to refresh `dist/`.
3. In the editor's **Plugins → Local** tab, click **Import Local** again on the same directory. The loader re-imports from the updated `dist/` and replaces the handler in the registry — existing pipeline tasks that reference it now call the new code on their next run.

Note: Node's ESM module cache still holds the first import, so code changes take effect on handler replacement rather than true hot-reload. Restart the editor if you hit a stale-module issue.

## Publishing

Publishing to npm is the distribution step — it isn't required to run a plugin. Published tarballs should include **both `dist/` and `src/`** so that consumers with sourcemaps can jump to the original TypeScript in their IDE.

```sh
bun run build      # tsc to dist/
npm publish        # or: bun publish
```

## Next

- [SDK reference](/docs/sdk) — `runPipeline`, the approval gateway, and pipeline CRUD.
- [Plugins](/docs/plugins) — built-in triggers, completions, and middlewares to compare against.
- [Drivers](/docs/drivers) — the existing driver catalog.
