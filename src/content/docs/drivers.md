---
title: Drivers
description: Built-in and plugin drivers for invoking agent CLIs.
group: Reference
order: 210
---

A **driver** is the adapter that turns a task into a process invocation of an agent CLI. Pick one with `driver:` at the pipeline, track, or task level.

> **Prerequisite for every driver.** Tagma drivers don't bundle or proxy agent CLIs — they spawn them as subprocesses. Install each vendor's CLI first (see the link in each section below) and make sure it runs from your terminal before adding the corresponding driver to a pipeline.

## Built-in: `claude-code`

Ships with the SDK — no plugin load required. Invokes the [Claude Code CLI](https://claude.com/claude-code).

**Prerequisite:** Install Claude Code from [claude.com/claude-code](https://claude.com/claude-code) and complete its authentication flow (`claude login` or equivalent). Tagma will fail at task start if the `claude` binary isn't reachable.

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | yes (`--resume <sessionId>`) |
| Structured output      | yes (`--output-format json`) |
| Default model          | `sonnet` |
| Permissions → flags    | maps `read`/`write`/`execute` to an allowed tools list and `--permission-mode` |
| `reasoning_effort`     | `high → opus`, `medium → sonnet`, `low → haiku` if no `model:` is set |

**Windows:** requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if Claude Code can't find it on its own.

**Prerequisite:** Claude Code installed and authenticated.

## Plugin: [`@tagma/driver-opencode`](https://github.com/GoTagma/tagma-mono/tree/main/packages/driver-opencode)

```yaml
pipeline:
  plugins:
    - "@tagma/driver-opencode"
  driver: opencode
  model: opencode/big-pickle
```

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | yes (`--session <id>`) |
| Structured output      | yes (`--format json`) |
| Default model          | `opencode/big-pickle` (must be `provider/model`) |
| `reasoning_effort`     | mapped to `--variant low` / `medium` / `high` |
| `agent_profile`        | prepended as a `[Role]…[Task]…` preamble |

**Prerequisite:** Install the `opencode` CLI from [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) and make sure it's on your `PATH`. Then add `@tagma/driver-opencode` under `pipeline.plugins` as shown above.

**Windows:** the plugin automatically unwraps npm `.cmd` shims to the underlying node invocation so multi-line prompts survive.

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
task.driver  >  track.driver  >  pipeline.driver  >  "claude-code"
```

`command:` tasks ignore drivers entirely — they're plain shell invocations, useful for glue work (file prep, smoke tests) between AI tasks.
