---
title: CLI
description: Run Tagma pipelines headlessly from the terminal.
group: SDK & CLI
order: 310
updated: 2026-05-08
---

The Tagma CLI ([`@tagma/cli`](https://github.com/GoTagma/tagma-cli)) is a thin wrapper around [`@tagma/sdk`](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk) — same runtime as the desktop editor, no daemon, no shared config. It reads a pipeline YAML from disk, loads declared plugins, and runs to completion.

## Install

```sh
bun add -g @tagma/cli
```

Or one-shot, no install:

```sh
bunx @tagma/cli ./pipeline.yaml
```

Requires Bun ≥ 1.3 (the CLI depends on `@tagma/sdk`, which uses Bun-only runtime APIs).

## Subcommands

```
tagma <pipeline.yaml> [options]              # shorthand for `tagma run`
tagma run <pipeline.yaml> [options]          # execute a pipeline
tagma validate <pipeline.yaml> [options]     # validate without running
tagma compile <pipeline.yaml> [options]      # parse + validate, print structured report
tagma dag <pipeline.yaml> [options]          # print the task DAG in topological order
```

| Flag                | Applies to                  | Default                       | Purpose                                                                                  |
| ------------------- | --------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `--cwd <dir>`       | all                         | current dir                   | Working directory resolved before the run. Relative paths in the pipeline resolve here.  |
| `--ws-port <port>`  | `run`                       | `3000` (or `$TAGMA_WS_PORT`)  | Port for the approval WebSocket.                                                         |
| `--json`            | `validate`, `compile`, `dag`| —                             | Emit machine-readable JSON output instead of the text summary.                           |
| `-h`, `--help`      | all                         | —                             | Print usage and exit.                                                                    |
| `-v`, `--version`   | all                         | —                             | Print CLI version and exit.                                                              |

`tagma <pipeline.yaml>` (no leading subcommand) is treated as `tagma run <pipeline.yaml>`.

## `run`

```sh
tagma run ./.tagma/deploy.yaml --cwd ~/projects/app --ws-port 8080
```

What happens:

1. The CLI parses and resolves the YAML via `loadPipeline` (raw + resolved validation runs first).
2. An `InMemoryApprovalGateway` is created and both adapters are attached:
   - **stdin** — answer `manual` triggers by typing `y` / `n` at the prompt.
   - **WebSocket** — connect to `ws://localhost:<ws-port>` and post a JSON decision. Whichever answer arrives first wins.
3. `createTagma().run(config, { cwd, approvalGateway })` executes the pipeline.

The CLI prints a banner with the pipeline name and the WS port, then streams progress to stdout/stderr as tasks transition.

## `validate`

```sh
tagma validate ./.tagma/deploy.yaml
tagma validate ./.tagma/deploy.yaml --json
```

Runs `compileYamlContent` (raw structural + plugin-type checks) followed by `loadPipeline` (resolved-config + cwd-safety checks). Exits `0` only when both stages pass. Without `--json` it prints a one-line summary; with `--json` it emits the full diagnostic object so CI can grep specific paths/messages.

## `compile`

```sh
tagma compile ./.tagma/deploy.yaml
tagma compile ./.tagma/deploy.yaml --json
```

Parses the YAML and validates it without resolving cwd safety or running anything. Distinguishes:

- **YAML syntax errors** (`parseOk: false`, `summary` starts with `"YAML parse error:"`).
- **Schema / structure errors** (`parseOk: true`, errors land in `validation.errors` with `{ path, message }` shape).

Half-built configs (missing top-level `pipeline`, non-array `tracks`, malformed `permissions`, etc.) surface as ordinary validation errors rather than parse failures — useful when you wire `compile` into an editor.

## `dag`

```sh
tagma dag ./.tagma/deploy.yaml
tagma dag ./.tagma/deploy.yaml --json
```

Loads the pipeline, builds the task DAG, and prints it in topological order. Useful for sanity-checking `depends_on` / `continue_from` edges before a run. The JSON form emits one node per entry: `{ taskId, track, type: 'command' | 'prompt', dependsOn, continueFrom? }`.

## Approvals

The CLI always attaches both stdin and WebSocket adapters during `run`. The two channels are live simultaneously; first response wins. Pair this with the editor or a lightweight web UI to handle approvals out-of-band from the terminal.

## Output

- Human-readable progress + task results go to **stdout/stderr**.
- A full run log (including `debug` / `section` lines not printed to console) is written to `<cwd>/.tagma/logs/<runId>/pipeline.log`, where `<runId>` is generated per run (`run_<ts>_<seq>_<rand>`).
- Per-task stdout / stderr stream to disk under the same directory as `<taskId>.stdout` / `<taskId>.stderr` for byte-identical inspection (the strings on the engine's `TaskResult` are bounded tails).
- Structured driver output (JSON from Claude Code, OpenCode) is captured in the run log and exposed to downstream tasks via `continue_from`.
- Old run directories under `.tagma/logs/` are pruned automatically to the most recent 20 by default (configurable per-host via `maxLogRuns`).

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | Every task ended in `success` (or was `ignored` per `on_failure`).            |
| `1`  | At least one task failed, timed out, or was blocked; or the pipeline aborted. Also returned for unrecoverable config / preflight errors. |
| `2`  | Bad CLI invocation (missing YAML path, unknown flag, `--cwd` without value).  |

## Environment variables

| Variable                       | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `TAGMA_WS_PORT`                | Fallback for `--ws-port`. Flag wins if both are set.                                     |
| `CLAUDE_CODE_GIT_BASH_PATH`    | Windows-only: required by the `claude-code` driver if Git Bash isn't auto-detected.      |

## Pipeline modes and the CLI

The CLI does **not** override `pipeline.mode`. A pipeline that uses shell tasks, lifecycle hooks, or non-allowlisted plugins must declare `mode: trusted` in YAML — the engine refuses to load `pipeline.plugins` automatically and rejects `command:` tasks under the default `mode: safe`. If you need to override, set the `mode` in the YAML, not on the command line.

## Interop with the editor

None — the CLI is stateless. It does not read editor settings, write to the editor's workspace, or share a daemon. Running the same pipeline YAML under the CLI or the editor produces the same result because both call `createTagma().run(...)` from `@tagma/sdk`.
