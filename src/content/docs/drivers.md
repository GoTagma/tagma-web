---
title: Drivers
description: Built-in and plugin drivers for invoking agent CLIs.
group: Reference
order: 20
---

A **driver** is the adapter that turns a task into a process invocation of an agent CLI. Pick one with `driver:` at the pipeline, track, or task level.

## Built-in: `claude-code`

Ships with the SDK — no plugin load required. Invokes the [Claude Code CLI](https://claude.com/claude-code).

| Option                 | Notes |
| ---------------------- | ----- |
| Session resume         | yes (`--resume <sessionId>`) |
| Structured output      | yes (`--output-format json`) |
| Default model          | `sonnet` |
| Permissions → flags    | maps `read`/`write`/`execute` to an allowed tools list and `--permission-mode` |
| `reasoning_effort`     | `high → opus`, `medium → sonnet`, `low → haiku` if no `model:` is set |

**Windows:** requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if Claude Code can't find it on its own.

**Prerequisite:** Claude Code installed and authenticated.

## Plugin: `@tagma/driver-opencode`

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

**Windows:** the plugin automatically unwraps npm `.cmd` shims to the underlying node invocation so multi-line prompts survive.

## Plugin: `@tagma/driver-codex`

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

**Prerequisite:** `codex` CLI on `PATH` (`npm i -g @openai/codex`).

## Writing your own

A driver is a small TypeScript object that implements `DriverPlugin` from `@tagma/types`. See the [SDK guide](/docs/sdk) for the full contract and a copy-pasteable template.

## Choosing at runtime

Precedence, most specific wins:

```
task.driver  >  track.driver  >  pipeline.driver  >  "claude-code"
```

`command:` tasks ignore drivers entirely — they're plain shell invocations, useful for glue work (file prep, smoke tests) between AI tasks.
