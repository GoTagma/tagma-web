---
title: Pipeline YAML Reference
description: Every field accepted by a Tagma pipeline file.
group: Reference
order: 10
---

A Tagma pipeline is a YAML document with a single top-level `pipeline:` key. Everything in this page is resolved against `@tagma/types`' `RawPipelineConfig`; if the runtime ever disagrees with this page, the types are the source of truth.

## Top-level: `pipeline`

```yaml
pipeline:
  name: string                # required
  driver: string              # default driver for all tracks/tasks
  model: string               # default model (provider/model form)
  reasoning_effort: string    # "low" | "medium" | "high"
  timeout: string             # "30m", "2h", "45s" — pipeline-wide cap
  plugins:                    # external plugin packages to load
    - "@tagma/driver-opencode"
  hooks: { ... }              # see "Hooks"
  tracks: [ ... ]             # required; see "Tracks"
```

Values set at the pipeline level are **inherited** by tracks, and track values by tasks. A task's own declaration always wins.

## Tracks

```yaml
tracks:
  - id: backend               # required; unique within the pipeline
    name: Backend             # required
    color: "#3b82f6"          # UI color in the editor
    driver: opencode          # overrides pipeline-level default
    model: opencode/big-pickle
    reasoning_effort: medium
    agent_profile: senior     # free-form label passed through to drivers
    cwd: ./                   # working dir for tasks in this track
    permissions: { read: true, write: true, execute: false }
    middlewares: [ ... ]      # prepended to every task in this track
    on_failure: skip_downstream
    tasks: [ ... ]            # required
```

### `on_failure`

| Value              | Behavior when a task in this track fails |
| ------------------ | ---------------------------------------- |
| `ignore`           | Downstream tasks treat it as success.    |
| `skip_downstream`  | Downstream tasks are marked `skipped`.   |
| `stop_all`         | Abort the entire pipeline.               |

## Tasks

```yaml
tasks:
  - id: plan                  # required; unique within the track
    name: Plan the change
    prompt: |                 # for AI tasks; mutually exclusive with command
      List every file that needs to change.
    command: "make test"      # for shell tasks; no driver invoked
    depends_on: [other_task]  # DAG edges — bare id same-track, trackId.taskId cross-track
    continue_from: previous   # resume session (or fallback to text handoff)
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
```

### `depends_on` vs `continue_from`

- `depends_on` adds a DAG edge — the task won't start until all listed tasks finish.
- `continue_from` asks the driver to resume the referenced task's session; if the driver doesn't support sessions, it falls back to prepending the prior task's normalized output as context. `continue_from` implies a DAG edge automatically.

### `middlewares` inheritance

A task's `middlewares:` **replaces** the track's. To disable inherited middlewares on a single task, set `middlewares: []` explicitly. To extend them, copy the track list and add to it.

## Hooks

Lifecycle hooks run shell commands. Each key accepts either a single string or an array:

```yaml
hooks:
  pipeline_start: 'echo starting'
  task_start: 'echo task $TAGMA_TASK starting'
  task_success:
    - 'echo succeeded'
    - 'notify-send "$TAGMA_TASK done"'
  task_failure: 'echo failed'
  pipeline_complete: 'echo done'
  pipeline_error: 'echo aborted'
```

Hooks receive pipeline/task context as JSON on stdin; the exact shape is documented alongside the SDK's `HookResult` type.

## Duration strings

All `timeout:` fields accept `Ns`, `Nm`, or `Nh` forms — for example `45s`, `5m`, `2h`.

## Plugin configs (`trigger`, `completion`, `middlewares`)

`trigger:`, `completion:`, and each entry in `middlewares:` is a `{ type, ...options }` object. Every `type` must be registered (built-in or loaded via `pipeline.plugins`). See [Plugins](/docs/plugins) for the built-in set.
