---
title: CLI
description: Run Tagma pipelines headlessly from the terminal.
group: Reference
order: 50
---

The Tagma CLI (`@tagma/cli`) is a thin wrapper around `@tagma/sdk` — same runtime as the desktop editor, no daemon, no shared config. It reads a pipeline YAML from disk, loads declared plugins, and runs to completion.

## Install

```sh
bun add -g @tagma/cli
```

Or one-shot, no install:

```sh
bunx @tagma/cli ./pipeline.yaml
```

Requires Bun ≥ 1.0.

## Usage

```
tagma <pipeline.yaml> [--cwd <dir>] [--ws-port <port>] [-h|--help]
```

| Argument / flag     | Default            | Purpose |
| ------------------- | ------------------ | ------- |
| `<pipeline.yaml>`   | — (required)       | Path to the pipeline file. No auto-discovery. |
| `--cwd <dir>`       | current dir        | Working directory resolved before the run. Relative paths in the pipeline resolve against this. |
| `--ws-port <port>`  | `3000` (or `$TAGMA_WS_PORT`) | Port for the approval WebSocket. |
| `-h`, `--help`      | —                  | Print usage and exit. |

## Example

```sh
tagma ./.tagma/deploy.yaml --cwd ~/projects/app --ws-port 8080
```

## Approvals

The CLI always attaches two approval adapters simultaneously:

- **stdin** — answer `manual` triggers by typing `y` / `n` at the prompt.
- **WebSocket** — connect to `ws://localhost:<ws-port>` and post a JSON decision. Whichever answer arrives first wins.

Pair this with the editor or a lightweight web UI to handle approvals out-of-band from the terminal.

## Output

- Human-readable progress + task results go to **stdout/stderr**.
- A full run log (including `debug` / `section` lines not printed to console) is written to `<cwd>/tmp/pipeline.log`.
- Structured driver output (JSON from Claude Code, OpenCode) is captured in the run log and exposed to downstream tasks via `continue_from`.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | Every task ended in `success` (or was `ignored` per `on_failure`). |
| `1`  | At least one task failed, timed out, or was blocked; or the pipeline aborted. |

## Environment variables

| Variable         | Purpose |
| ---------------- | ------- |
| `TAGMA_WS_PORT`  | Fallback for `--ws-port`. Flag wins if both are set. |
| `CLAUDE_CODE_GIT_BASH_PATH` | Windows-only: required by the `claude-code` driver if Git Bash isn't auto-detected. |

## Interop with the editor

None — the CLI is stateless. It does not read editor settings, write to the editor's workspace, or share a daemon. Running the same pipeline YAML under the CLI or the editor produces the same result because both call `runPipeline` from `@tagma/sdk`.
