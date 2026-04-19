---
title: Plugins
description: Triggers, completions, and middlewares — what ships and how to add one.
group: Reference
order: 30
---

Tagma pipelines are extended with four plugin categories: **drivers**, **triggers**, **completions**, and **middlewares**. Drivers have their own page; this page covers the other three and how external packages are loaded.

## Loading external plugins

List package names under `pipeline.plugins`. They're resolved via standard `node_modules` lookup:

```yaml
pipeline:
  plugins:
    - "@tagma/driver-opencode"
    - "@tagma/trigger-webhook"
    - "@tagma/completion-llm-judge"
    - "@tagma/middleware-lightrag"
```

A plugin package must declare a `tagmaPlugin` manifest in its `package.json`:

```json
{
  "name": "@tagma/driver-codex",
  "tagmaPlugin": { "category": "drivers", "type": "codex" }
}
```

Categories: `drivers` | `triggers` | `completions` | `middlewares`.

## Triggers

A **trigger** gates a task — the task waits until the trigger resolves before running.

### Built-in: `manual`

Human-in-the-loop approval via the approval gateway (stdin or WebSocket on the CLI, approval panel in the editor).

```yaml
trigger:
  type: manual
  message: "Approve before running production deploy"
  timeout: 5m
  metadata:
    owner: release-captain
```

### Built-in: `file`

Wait for a file to appear.

```yaml
trigger:
  type: file
  path: ./.tagma/signal/.ready
  timeout: 1m
```

### Plugin: `@tagma/trigger-webhook`

HTTP webhook listener — the task blocks until an authenticated request hits the configured endpoint. See the package README for the full config shape.

## Completions

A **completion** decides whether a task that finished running actually *succeeded*. Without one, success means exit code `0`.

### Built-in: `exit_code`

```yaml
completion:
  type: exit_code
  expect: 0            # or [0, 2] — array form accepts multiple codes
```

### Built-in: `file_exists`

```yaml
completion:
  type: file_exists
  path: ./dist/bundle.js
```

### Built-in: `output_check`

Pipe the task's stdout into a shell command; success iff that command exits `0`.

```yaml
completion:
  type: output_check
  check: 'grep -q "^PASS"'
  timeout: 30s
```

### Plugin: `@tagma/completion-llm-judge`

Call an LLM to judge the task's output against a rubric; success iff the judge's verdict matches. See the package README for rubric config.

## Middlewares

A **middleware** augments a task's prompt before it reaches the driver. Middlewares run in declaration order; each receives the previous output's `PromptDocument` and returns a new one.

### Built-in: `static_context`

Prepend a file as a labeled context block.

```yaml
middlewares:
  - type: static_context
    file: ./README.md
    label: Project Readme
```

### Plugin: `@tagma/middleware-lightrag`

LightRAG retrieval — injects relevant knowledge-graph chunks as context blocks. See the package README for vector store and retrieval config.

### Composition rules

- Middlewares **append context blocks**. They must not rewrite the user's `task` text unless they're deliberately transforming the instruction (e.g. translation).
- Track-level middlewares apply to every task in the track. A task's own `middlewares:` list **replaces** the track's — use `middlewares: []` to disable inheritance for that task.
- Fail-open: if a middleware can't do its job (retrieval error, missing file), it should return the document unchanged rather than throw.

## Writing your own

Any plugin category follows the same pattern: export a default object implementing the appropriate interface from `@tagma/types`, and declare the `tagmaPlugin` manifest in your `package.json`. See the [SDK guide](/docs/sdk).
