---
title: SDK
description: Write your own driver, trigger, completion, or middleware in TypeScript.
group: SDK & CLI
order: 300
---

The Tagma runtime is [`@tagma/sdk`](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk). Plugins depend on [`@tagma/types`](https://github.com/GoTagma/tagma-mono/tree/main/packages/types) for the wire contracts and export a default object that implements the relevant plugin interface.

## Install

```sh
bun add @tagma/sdk @tagma/types
```

Both packages target Bun ≥ 1.3 but publish runnable JS — Node ≥ 20 consumers can use the built bundles.

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

## Reference

- `@tagma/types` — every wire shape: `PipelineConfig`, `TaskConfig`, `DriverPlugin`, `PromptDocument`, `RunEventPayload`, …
- `@tagma/sdk` — runtime entry points: `runPipeline`, `loadPipeline`, `loadPlugins`, `bootstrapBuiltins`, `validateRaw`, plus config-mutation helpers used by the editor (`createEmptyPipeline`, `upsertTrack`, `upsertTask`).
