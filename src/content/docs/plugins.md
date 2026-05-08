---
title: Plugins
description: Triggers, completions, and middlewares — what ships and how to add one.
group: Reference
order: 220
updated: 2026-05-08
---

Tagma pipelines are extended with four plugin categories: **drivers**, **triggers**, **completions**, and **middlewares**. Drivers have their own page; this page covers the other three and how external packages are loaded.

## Loading external plugins

List package names under `pipeline.plugins`. They're resolved via standard `node_modules` lookup:

```yaml
pipeline:
  plugins:
    - "@tagma/driver-claude-code"
    - "@tagma/trigger-webhook"
    - "@tagma/completion-llm-judge"
    - "@tagma/middleware-lightrag"
```

`opencode` is the SDK's only built-in driver — it doesn't need to appear here. `claude-code` and `codex` ship as plugin packages and must be listed.

> **Safe-mode reminder.** `pipeline.plugins` is *automatic* loading at run time. The default `mode: safe` blocks it — the engine reports `safe mode blocks automatic plugin loading via pipeline.plugins`. Either set `mode: trusted` or pre-install the plugin in the host (workspace `node_modules`) and have the host skip auto-load (`skipPluginLoading: true`). The editor follows that pattern: workspace plugins are pre-loaded into the registry and only added to YAML for portability.

A plugin package must declare a `tagmaPlugin` manifest in its `package.json` so hosts can auto-discover it without importing the module:

```json
{
  "name": "@tagma/driver-codex",
  "tagmaPlugin": { "category": "drivers", "type": "codex" }
}
```

Categories: `drivers` | `triggers` | `completions` | `middlewares`. The actual capabilities a package provides live in its default-exported `TagmaPlugin` object — a single package may bundle multiple drivers / triggers / completions / middlewares; the manifest's `type` is the primary capability surfaced to discovery UIs. See [Custom Plugins](/docs/custom-plugins) for the full layout.

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

### Plugin: [`@tagma/trigger-webhook`](https://github.com/GoTagma/tagma-mono/tree/main/packages/trigger-webhook)

HTTP webhook listener — the task blocks until a POST request arrives on the configured local endpoint. Optional HMAC-SHA256 signature validation (`x-tagma-signature: sha256=<hex>`) protects against unauthenticated callers.

```yaml
trigger:
  type: webhook
  port: 8787
  path: /hooks/deploy
  secret_env: TAGMA_WEBHOOK_SECRET
  timeout: 30m
```

| Field            | Type     | Default      | Notes                                                                                                     |
| ---------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `port`           | number   | _(required)_ | TCP port to listen on (1–65535). A single listener is shared across tasks with the same `(host, port, path)` |
| `path`           | string   | `/webhook`   | URL path to match; must start with `/`                                                                    |
| `host`           | string   | `127.0.0.1`  | Interface to bind. Defaults to loopback. Setting `0.0.0.0` or any non-loopback address without `secret_env` is **refused at config time**. |
| `secret_env`     | string   | _(none)_     | Env var holding the HMAC-SHA256 secret. When set, requests must include `x-tagma-signature: sha256=<hex>` and verification is constant-time. |
| `max_body_bytes` | number   | `1048576`    | Max accepted request body size (bytes). Larger requests return `413 payload too large` before parsing.    |
| `timeout`        | duration | `30m`        | Max wait time; set to `0` for unbounded wait.                                                             |

Multiple tasks watching the same `(host, port, path)` form a FIFO waiter queue — the next POST wakes one waiter, and the listener is reference-counted (closed when the last waiter resolves, aborts, or times out). A POST arriving with no waiting task is rejected with `409 no waiting task` so the caller can retry once the pipeline is up; non-matching paths return `404`, non-POST methods return `405`. JSON bodies (`content-type: application/json`) are parsed and handed to the task as the trigger payload — malformed JSON under that content-type returns `400 invalid JSON body`.

Always set `secret_env` in production. The plugin already binds to `127.0.0.1` by default; only change `host` when you deliberately need LAN/container reachability, and **always** pair a non-loopback bind with `secret_env`.

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

### Plugin: [`@tagma/completion-llm-judge`](https://github.com/GoTagma/tagma-mono/tree/main/packages/completion-llm-judge)

Call an OpenAI-compatible chat-completions endpoint to judge whether the task's output satisfies a plain-language rubric. The default backend is local [Ollama](https://ollama.com) with `qwen3:4b` — no API key, runs on CPU. Swap `endpoint` + `model` + `api_key_env` to point at OpenAI, vLLM, llama.cpp, LM Studio, Groq, Together, OpenRouter, etc.

```yaml
completion:
  type: llm_judge
  rubric: |
    The output must list at least 3 failing tests. Each entry must include
    the test name, the file path, and the assertion that failed.
  # endpoint / model / api_key_env default to local Ollama + qwen3:4b
  timeout: 120s
```

| Field              | Type     | Default                                      | Notes                                                                                   |
| ------------------ | -------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `rubric`           | string   | _(required)_                                 | Plain-language success criteria the judge should verify                                 |
| `model`            | string   | `qwen3:4b`                                   | Judge model. Swap for `qwen3:8b`, `deepseek-r1:7b`, `gpt-4o-mini`, etc.                 |
| `endpoint`         | string   | `http://localhost:11434/v1/chat/completions` | OpenAI-compatible chat-completions URL                                                  |
| `api_key_env`      | string   | _(none)_                                     | Env var holding the bearer token; leave unset for local Ollama                          |
| `timeout`          | duration | `120s`                                       | Max time to wait for the judge response (reasoning models need more time)               |
| `max_output_chars` | number   | `8000`                                       | Truncate task stdout before judging (head+tail preserved with a marker in the middle)   |

The judge is instructed to reply `PASS` or `FAIL` on the first line; missing or ambiguous answers are treated as FAIL. `<think>` / `<thinking>` blocks are stripped before verdict parsing, so reasoning models (qwen3, DeepSeek-R1, …) work with no extra config. `temperature: 0` is used for determinism.

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

### Plugin: [`@tagma/middleware-lightrag`](https://github.com/GoTagma/tagma-mono/tree/main/packages/middleware-lightrag)

Queries a running [LightRAG](https://github.com/HKUDS/LightRAG) API server and prepends the retrieved subgraph context to the task prompt so the downstream driver sees the prompt already augmented with relevant facts from your knowledge graph. Requires a LightRAG server running separately (defaults to `http://localhost:9621`).

```yaml
middlewares:
  - type: lightrag
    endpoint: http://localhost:9621
    mode: mix
    top_k: 20
    api_key_env: LIGHTRAG_API_KEY
    label: Knowledge Graph Context
```

| Field               | Type     | Default                   | Notes                                                                                                   |
| ------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `endpoint`          | string   | _(required)_              | LightRAG API server base URL. Must be `http`/`https` — other schemes are rejected.                      |
| `mode`              | enum     | `mix`                     | One of `local`, `global`, `hybrid`, `naive`, `mix` — matches LightRAG's server default.                  |
| `top_k`             | number   | `10`                      | Top-k entities (local mode) / relationships (global mode). Capped at `200` at runtime.                  |
| `max_context_chars` | number   | `40000`                   | Maximum retrieved-context characters inserted into the prompt.                                          |
| `api_key_env`       | string   | _(none)_                  | Env var holding the API key; sent via `X-API-Key` (LightRAG's auth scheme), not `Authorization: Bearer`. |
| `timeout`           | duration | `30s`                     | Max time to wait for the LightRAG response.                                                             |
| `required`          | boolean  | `false`                   | When `true`, an empty retrieval result fails the middleware (and implies `on_error: fail`).             |
| `on_error`          | enum     | `warn` (or `fail`)        | One of `warn`, `fail`, `skip`. Controls transport / non-2xx error handling. Defaults to `warn`; defaults to `fail` when `required: true`. |
| `label`             | string   | `Knowledge Graph Context` | Header rendered above the retrieved context in the final prompt.                                        |
| `query`             | string   | _(task instruction)_      | Override the retrieval query. Defaults to `PromptDocument.task` (the user's instruction), not the already-serialized prompt. |

Calls `POST /query` with `only_need_context: true`, `include_references: false`, `stream: false`, and prepends the raw context as `[<label>]\n<context>\n\n<prompt>`. The middleware does **not** emit a `[Task]` header — that framing belongs to the driver (e.g. opencode's `agent_profile` wrapping). With `on_error: warn` (the default) the middleware passes the original prompt through unchanged on transport / non-2xx errors and logs a warning, so tasks never fail purely because the KG was offline. Set `on_error: fail` (or `required: true`) when retrieval is load-bearing for the task.

### Composition rules

- Middlewares **append context blocks**. They must not rewrite the user's `task` text unless they're deliberately transforming the instruction (e.g. translation).
- Track-level middlewares apply to every task in the track. A task's own `middlewares:` list **replaces** the track's — use `middlewares: []` to disable inheritance for that task.
- Fail-open: if a middleware can't do its job (retrieval error, missing file), it should return the document unchanged rather than throw.

## Writing your own

See [Custom Plugins](/docs/custom-plugins) for per-category walkthroughs (drivers, triggers, completions, middlewares) and the package manifest contract.
