---
title: Drivers
description: Built-in and plugin drivers for invoking agent CLIs.
group: Reference
order: 210
updated: 2026-04-21
---

A **driver** is the adapter that turns a task into a process invocation of an agent CLI. Pick one with `driver:` at the pipeline, track, or task level.

> **Prerequisite for every driver.** Tagma drivers don't bundle or proxy agent CLIs — they spawn them as subprocesses. Install each vendor's CLI first (see the link in each section below) and make sure it runs from your terminal before adding the corresponding driver to a pipeline.

## Built-in: `opencode`

Ships with the SDK — no plugin load required. Invokes the [OpenCode CLI](https://github.com/anomalyco/opencode). This is the only driver registered by `bootstrapBuiltins()`; every other driver must be declared under `pipeline.plugins`.

**Prerequisite:** the `opencode` CLI must be on your `PATH`. The desktop editor ships a platform-matched `opencode` binary under `resources/opencode/` and prepends it to the sidecar's `PATH` at launch, so end users of the packaged app don't need a separate install. For SDK / CLI direct use, if `bun` is on `PATH` the driver will auto-install `opencode-ai` globally on first run.

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | yes (`--session <id>`) |
| Structured output      | yes (`--format json`) |
| Default model          | `opencode/big-pickle` (must be `provider/model`) |
| `reasoning_effort`     | mapped to `--variant minimal` (low) / unset (medium) / `high` (high); unknown values pass through |
| `agent_profile`        | prepended as a `[Role]…[Task]…` preamble |

**Windows:** the driver automatically unwraps npm `.cmd` shims to the underlying node invocation so multi-line prompts survive.

**Error-JSON failsafe:** opencode occasionally emits `{"type":"error", ...}` JSON with exit code `0` on transient upstream API failures. The driver detects this in `parseResult` and sets `forceFailure: true` so the engine marks the task failed instead of silently passing bogus output into downstream `continue_from` consumers.

## Plugin: [`@tagma/driver-claude-code`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-claude-code)

```yaml
pipeline:
  plugins:
    - "@tagma/driver-claude-code"
  driver: claude-code
```

**Prerequisite:** Install Claude Code from [claude.com/claude-code](https://claude.com/claude-code) and complete its authentication flow (`claude login` or equivalent). Tagma will fail at task start if the `claude` binary isn't reachable.

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | yes (`--resume <sessionId>`) |
| Structured output      | yes (`--output-format json`) |
| Default model          | `sonnet` |
| Permissions → flags    | maps `read`/`write`/`execute` to an `--allowedTools` list plus `--permission-mode` (`bypassPermissions` for `execute: true`, `dontAsk` otherwise) |
| `reasoning_effort`     | passed through to `--effort low|medium|high`; the Claude-specific `max` tier is also accepted |

**Windows:** requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe`. The driver auto-discovers it in most Git for Windows layouts; set the env var manually if discovery fails.

## Plugin: [`@tagma/driver-codex`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-codex)

```yaml
pipeline:
  plugins:
    - "@tagma/driver-codex"
  driver: codex
```

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | no |
| Structured output      | no |
| Default model          | `gpt-5-codex` |
| Permissions → flags    | maps to `--sandbox read-only` / `workspace-write` / `danger-full-access` |
| Invocation             | `codex exec …` with `--ask-for-approval never` |

**Prerequisite:** Install the Codex CLI from [github.com/openai/codex](https://github.com/openai/codex) (`npm i -g @openai/codex`) and confirm `codex --version` works in your terminal. The driver runs this probe once per process and throws a clear error if the binary is missing.

## Writing your own

A driver is a small TypeScript object that implements `DriverPlugin` from `@tagma/types`. See the [SDK guide](/docs/sdk) for the full contract and a copy-pasteable template.

## Choosing at runtime

Precedence, most specific wins:

```
task.driver  >  track.driver  >  pipeline.driver  >  "opencode"
```

`command:` tasks ignore drivers entirely — they're plain shell invocations, useful for glue work (file prep, smoke tests) between AI tasks.
