---
title: Plugins
description: Triggers, completions, and middlewares — what ships and how to add one.
group: Reference
order: 220
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

| Field        | Type     | Default      | Notes                                                                                       |
| ------------ | -------- | ------------ | ------------------------------------------------------------------------------------------- |
| `port`       | number   | _(required)_ | TCP port to listen on (1–65535). A single listener is shared across tasks with the same `(port, path)` |
| `path`       | string   | `/webhook`   | URL path to match; must start with `/`                                                      |
| `secret_env` | string   | _(none)_     | Env var holding the HMAC-SHA256 secret; when set, requests must include `x-tagma-signature` |
| `timeout`    | duration | _(forever)_  | Max wait time; omit for unbounded wait                                                      |

Always set `secret_env` in production. Bind the host to `127.0.0.1` at the OS level if only local callers need to fire the trigger.

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

| Field         | Type     | Default                   | Notes                                                                                  |
| ------------- | -------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `endpoint`    | string   | _(required)_              | LightRAG API server base URL (default port 9621)                                       |
| `mode`        | enum     | `mix`                     | One of `local`, `global`, `hybrid`, `naive`, `mix` — matches LightRAG's server default |
| `top_k`       | number   | `10`                      | Top-k entities (local mode) / relationships (global mode)                              |
| `api_key_env` | string   | _(none)_                  | Env var holding the API key; sent via `X-API-Key` header                               |
| `timeout`     | duration | `30s`                     | Max time to wait for the LightRAG response                                             |
| `label`       | string   | `Knowledge Graph Context` | Header rendered above the retrieved context in the final prompt                        |
| `query`       | string   | _(task prompt)_           | Override the retrieval query; useful when the prompt itself is not a good KG query     |

Fail-open: if the server is unreachable, returns an empty response, or errors, the middleware passes the original prompt through unchanged and logs a warning — tasks never fail purely because the KG was offline.

### Composition rules

- Middlewares **append context blocks**. They must not rewrite the user's `task` text unless they're deliberately transforming the instruction (e.g. translation).
- Track-level middlewares apply to every task in the track. A task's own `middlewares:` list **replaces** the track's — use `middlewares: []` to disable inheritance for that task.
- Fail-open: if a middleware can't do its job (retrieval error, missing file), it should return the document unchanged rather than throw.

## Writing your own

See [Custom Plugins](/docs/custom-plugins) for per-category walkthroughs (drivers, triggers, completions, middlewares) and the package manifest contract.
