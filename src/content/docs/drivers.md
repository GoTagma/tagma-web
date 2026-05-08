---
title: Drivers
description: Built-in and plugin drivers for invoking agent CLIs.
group: Reference
order: 210
updated: 2026-05-08
---

A **driver** is the adapter that turns a task into a process invocation of an agent CLI. Pick one with `driver:` at the pipeline, track, or task level.

> **Prerequisite for every driver.** Tagma drivers don't bundle or proxy agent CLIs — they spawn them as subprocesses. Install each vendor's CLI first (see the link in each section below) and make sure it runs from your terminal before adding the corresponding driver to a pipeline.

## Built-in: `opencode`

Ships with the SDK — no plugin load required. Invokes the [OpenCode CLI](https://github.com/anomalyco/opencode). This is the only driver registered by default when you call `createTagma()` (or, equivalently, `bootstrapBuiltins(registry)` from `@tagma/sdk/plugins`); every other driver must be declared under `pipeline.plugins`.

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

**Prerequisite:** Install the Codex CLI from [github.com/openai/codex](https://github.com/openai/codex) (`npm i -g @openai/codex`) and confirm `codex --version` works in your terminal. The driver itself does **not** probe for the binary — if it isn't on `PATH`, the runtime spawn fails with `ENOENT` and the task is marked `failed` with `failureKind: 'spawn_error'`.

## Writing your own

A driver is a small TypeScript object that implements `DriverPlugin` from `@tagma/types`, packaged as one capability inside a `TagmaPlugin` default export. See [Custom Plugins → Drivers](/docs/custom-plugins#drivers) for the full contract and a copy-pasteable template.

## Choosing at runtime

Precedence, most specific wins:

```
task.driver  >  track.driver  >  pipeline.driver  >  "opencode"
```

`command:` tasks ignore drivers entirely — they're plain shell invocations, useful for glue work (file prep, smoke tests) between AI tasks. (Reminder: `command:` tasks require `mode: trusted`.)

## Capability flags

Each `DriverPlugin` declares a `capabilities` block that the engine and editor read up-front:

| Flag                    | What it tells the engine |
| ----------------------- | ------------------------ |
| `sessionResume`         | The driver supports continuing a prior task's session via `--resume` / `--session` etc. When `false`, `continue_from` falls back to prepending the upstream's normalized output as text. |
| `systemPrompt`          | The driver can inject a system-prompt fragment (used by `agent_profile`). When `false`, drivers usually prepend a `[Role]…[Task]…` envelope to the prompt instead. |
| `outputFormat`          | The driver can emit machine-parseable structured output (e.g. JSON) for `parseResult` to consume. |
| `enforcesPermissions`   | The driver maps Tagma `Permissions` onto its underlying CLI and can fail closed for disallowed write/execute access. |
