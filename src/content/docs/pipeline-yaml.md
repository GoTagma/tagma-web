---
title: Pipeline YAML Reference
description: Every field accepted by a Tagma pipeline file.
group: Reference
order: 200
updated: 2026-05-08
---

A Tagma pipeline is a YAML document with a single top-level `pipeline:` key. Everything in this page is resolved against `@tagma/types`' `RawPipelineConfig`; if the runtime ever disagrees with this page, the types are the source of truth.

> **YAML uses `snake_case`. Runtime / wire shapes use `camelCase`.** That boundary is intentional and there is no auto-translation layer — what you write here stays as `depends_on` / `continue_from` / `reasoning_effort` in the resolved `TaskConfig`; what the engine emits stays `sessionId` / `normalizedOutput` / `runId`.

## Top-level: `pipeline`

```yaml
pipeline:
  name: string                # required
  mode: trusted | safe        # default "safe"; "trusted" opts in to the full surface
  driver: string              # default driver for all tracks/tasks
  model: string               # default model (provider/model form for opencode)
  reasoning_effort: string    # "low" | "medium" | "high" (drivers may accept extras)
  permissions: { ... }        # default permissions (see "Permissions")
  timeout: string             # "30m", "2h", "45s" — pipeline-wide cap
  max_concurrency: number     # cap on simultaneously running tasks; default unlimited
  plugins:                    # external plugin packages to load
    - "@tagma/driver-claude-code"
  hooks: { ... }              # see "Hooks"
  tracks: [ ... ]             # required; see "Tracks"
```

Values set at the pipeline level are **inherited** by tracks, and track values by tasks (`driver`, `model`, `reasoning_effort`, `permissions`). A task's own declaration always wins. `cwd` inherits track → task only — the pipeline-level working directory is the `workDir` you pass to `tagma.run()` / `loadPipeline()`, not a YAML field.

### `mode`

`mode` is the execution boundary. Defaults to `safe`. Pick `trusted` only when you've reviewed the YAML and are willing to run everything in it.

| Mode      | Allows |
| --------- | ------ |
| `safe`    | Prompt-only AI tasks on **allowlisted** drivers / triggers / completions / middlewares. **Blocks**: `command:` tasks, every `hooks:` entry, automatic loading of `pipeline.plugins`, `permissions: { execute: true }`, and any plugin type not on the safe-mode allowlist. |
| `trusted` | Everything in the YAML runs as written. |

The default safe-mode allowlist is `triggers: [manual, file]`, `completions: [exit_code, file_exists]`, `middlewares: [static_context]`. **No drivers** are on the safe allowlist by default — running an AI task in `safe` mode therefore requires the host to extend the allowlist (`safeModeAllowlist` on the SDK, or the editor's per-workspace settings) for the specific drivers you trust. Hosts can extend the allowlist per run; the CLI and editor expose their defaults but always start from this baseline.

### `max_concurrency`

Caps the number of tasks running in parallel across the whole pipeline. Useful when many tracks would otherwise spawn agent CLIs simultaneously and saturate CPU / API quota. The setting is independent of `tracks` — tracks are still parallel logical lanes, but the engine will queue task launches once `max_concurrency` is hit.

## Tracks

```yaml
tracks:
  - id: backend               # required; unique within the pipeline
    name: Backend             # required
    color: "#3b82f6"          # UI color in the editor
    driver: opencode          # overrides pipeline-level default
    model: opencode/big-pickle
    reasoning_effort: medium
    agent_profile: senior     # free-form label; some drivers prepend it as a [Role] preamble
    cwd: ./                   # working dir for tasks in this track (relative to workDir)
    permissions: { read: true, write: true, execute: false }
    middlewares: [ ... ]      # applied to every task in this track unless overridden
    on_failure: skip_downstream
    tasks: [ ... ]            # required
```

### `on_failure`

| Value              | Behavior when a task in this track fails |
| ------------------ | ---------------------------------------- |
| `ignore`           | Downstream tasks treat the failure as success (best-effort). |
| `skip_downstream`  | Downstream tasks of the failed task are marked `skipped`. (Default.) |
| `stop_all`         | Abort the **entire pipeline** — every still-waiting task is marked `skipped`, the abort signal fires, and `run_end.abortReason === 'stop_all'`. |

## Tasks

```yaml
tasks:
  - id: plan                  # required; unique within the track
    name: Plan the change
    prompt: |                 # for AI tasks; mutually exclusive with command
      List every file that needs to change.
    command: "make test"      # for shell tasks; no driver invoked. command form: string,
                              # or { argv: [...] } / { shell: "..." } for explicit forms.
    depends_on: [other_task]  # DAG edges — bare id same-track, trackId.taskId cross-track
    continue_from: previous   # resume session (or fall back to text handoff)
    driver: claude-code       # override inherited driver
    model: sonnet
    reasoning_effort: high
    agent_profile: reviewer
    cwd: ./services/api
    permissions: { read: true, write: true, execute: true }
    timeout: 5m
    middlewares: [ ... ]      # REPLACES the track's list; `[]` disables inheritance
    trigger: { ... }          # see "Triggers"
    completion: { ... }       # see "Completions"
    inputs: { ... }           # see "Inputs / outputs"
    outputs: { ... }          # see "Inputs / outputs"
```

### `depends_on` vs `continue_from`

- `depends_on` adds a DAG edge — the task won't start until all listed tasks finish.
- `continue_from` asks the driver to resume the referenced task's session; if the driver doesn't support sessions, it falls back to prepending the prior task's normalized output as context. `continue_from` implies a DAG edge automatically.

### `middlewares` inheritance

A task's `middlewares:` **replaces** the track's. To disable inherited middlewares on a single task, set `middlewares: []` explicitly. To extend them, copy the track list and add to it. (There is no `pipeline.middlewares` — middleware inheritance is track → task only.)

## Permissions

```yaml
permissions:
  read: true
  write: true
  execute: false
```

Boolean capability flags handed to AI drivers. Each driver maps them onto its underlying CLI:

- **Claude Code** — `--allowedTools` whitelist + `--permission-mode` (`bypassPermissions` for `execute: true`, `dontAsk` otherwise).
- **Codex** — `--sandbox read-only` / `workspace-write` / `danger-full-access`.
- **OpenCode** — driver-specific tool gating.

Permissions inherit pipeline → track → task. They do **not** sandbox `command:` tasks — those are host shell execution, gated by `mode: safe` / `mode: trusted` instead. In `safe` mode, `permissions: { execute: true }` is rejected at preflight regardless of where it sits in the inheritance chain.

## Inputs / outputs

`inputs` and `outputs` are task-level dataflow. `outputs` declare named values a task produces; `inputs` declare values a task consumes. The runtime auto-wires same-named inputs and outputs across direct upstreams.

```yaml
- id: build
  command: bun run build
  outputs:
    bundlePath:
      type: string                 # optional coercion type
      from: json.bundlePath        # default: json.<outputName>; also: stdout, stderr, normalizedOutput
    sizeBytes:
      type: number

- id: smoke
  depends_on: [build]
  command: 'node "{{inputs.bundlePath}}" --selftest'
  inputs:
    bundlePath:
      required: true
      type: string                 # if upstream gave a number, fail fast at coercion
```

### Where the values come from

For `inputs`:

1. Literal `value:` if set.
2. Explicit `from:` — supports `taskId.name`, `taskId.outputs.name`, `taskId.stdout`, `taskId.stderr`, `taskId.normalizedOutput`, `taskId.exitCode`, or bare `outputs.name` (which name-matches across direct upstreams).
3. Auto-match: same-name output on a direct upstream task.
4. `default:`.
5. If still unresolved and `required: true`, the task is blocked before it starts.

For `outputs`:

1. Literal `value:` if set.
2. `from:` — defaults to `json.<outputName>`. The engine takes the **last non-empty line** of `normalizedOutput` (AI tasks) or `stdout` (command tasks), parses it as JSON, and reads the named key. Other forms: `stdout`, `stderr`, `normalizedOutput`.
3. `default:`.

### Substitution and AI prompt blocks

- `{{inputs.<name>}}` is expanded verbatim in `command` and `prompt` strings before execution. Quote your placeholders in command lines (`--city "{{inputs.city}}"`) — the engine does not shell-escape.
- AI tasks get auto-rendered `[Inputs]` and `[Output Format]` blocks built from declared inputs/outputs **plus** inferred contracts from neighboring command tasks (e.g. a downstream `command` with `inputs: { foo: { type: string } }` makes the upstream prompt task render an `[Output Format] foo: string` block automatically).

### Binding fields

| Field         | Type                                                    | Required          | Notes |
| ------------- | ------------------------------------------------------- | ----------------- | ----- |
| `value`       | any                                                     | No                | Literal — for inputs, wins over `from`. |
| `from`        | string                                                  | No                | Source expression. See above. |
| `default`     | any                                                     | No                | Fallback when source missing. |
| `required`    | boolean                                                 | inputs only       | Missing + no default ⇒ task blocks. |
| `type`        | `string \| number \| boolean \| enum \| json`           | No                | Optional coercion. Omit for pass-through. |
| `enum`        | string[]                                                | when `type: enum` | Allowed values. |
| `description` | string                                                  | No                | Free text; rendered into auto-generated prompt blocks. |

Output extraction is best-effort: a parse failure appends a diagnostic to the task's stderr and the binding is omitted from the published `outputs` map. Downstream tasks see the missing key and their own `required` rule decides whether to block.

## Hooks

Lifecycle hooks run shell commands. Each key accepts a single command (string or `{argv|shell}` object) or an array. **Hooks require `mode: trusted`.**

```yaml
hooks:
  pipeline_start: 'echo starting'              # GATE: non-zero exit blocks the run
  task_start: 'echo task $TAGMA_TASK starting' # GATE: non-zero exit blocks just this task
  task_success:
    - 'echo succeeded'
    - 'notify-send "$TAGMA_TASK done"'
  task_failure: 'echo failed'
  pipeline_complete: 'echo done'
  pipeline_error: 'echo aborted'
```

`pipeline_start` and `task_start` are **gates** — a non-zero exit code blocks the run / task. The other hooks are observers; their exit codes don't change task state. Hook stdout / stderr land in the unified run log. The hook payload (run + task context as JSON on stdin) follows the `HookResult` shape in `@tagma/core`.

## Duration strings

All `timeout:` fields accept `Ns`, `Nm`, or `Nh` forms — for example `45s`, `5m`, `2h`. The same parser drives the `duration` field type in plugin schemas.

## Plugin configs (`trigger`, `completion`, `middlewares`)

`trigger:`, `completion:`, and each entry in `middlewares:` is a `{ type, ...options }` object. Every `type` must be registered (built-in or loaded via `pipeline.plugins` / pre-installed in the workspace `node_modules`). When a plugin declares a `PluginSchema`, the engine validates the config against it before running the pipeline — typos like `timeout: "garbage"` or out-of-enum values fail fast with a clear path-and-message error rather than at runtime. See [Plugins](/docs/plugins) for the built-in set.

## Pipeline-execution result

When the pipeline finishes, `tagma.run()` returns:

```ts
{
  success: boolean,
  runId: string,                  // run_<ts>_<seq>_<rand>
  logPath: string,                // <workDir>/.tagma/logs/<runId>/pipeline.log
  summary: { total, success, failed, skipped, timeout, blocked },
  states: ReadonlyMap<taskId, TaskState>,
}
```

`success: false` plus `abortReason: 'timeout' | 'stop_all' | 'external'` (carried on the `run_end` event) tells you *why* the run didn't complete on its own steam. `null` means the run finished but contained failed tasks.
