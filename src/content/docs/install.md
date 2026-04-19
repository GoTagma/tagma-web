---
title: Install
description: Get the desktop editor, the CLI, or the SDK — whichever fits your workflow.
group: Getting Started
order: 20
---

Tagma ships in three pieces that all drive the same runtime. Pick the ones you need.

## Desktop editor

The visual editor is an Electron app built from the `tagma-mono` monorepo.

```sh
git clone https://github.com/GoTagma/tagma-mono.git
cd tagma-mono
bun install
bun run dev:desktop
```

To produce a platform installer instead:

```sh
bun run dist:desktop:win      # Windows
bun run dist:desktop:mac      # macOS
bun run dist:desktop:linux    # Linux
```

Installers land under `packages/electron/release/`.

**Requires Bun ≥ 1.3.** On Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`. On macOS / Linux: `curl -fsSL https://bun.sh/install | bash`.

## SDK & CLI

### CLI

```sh
bun add -g @tagma/cli
tagma ./pipeline.yaml
```

Or one-shot, no install:

```sh
bunx @tagma/cli ./pipeline.yaml
```

Package: [`@tagma/cli`](https://github.com/GoTagma/tagma-cli). Requires Bun ≥ 1.3 (the CLI depends on `@tagma/sdk`, which uses Bun-only runtime APIs). See the [CLI reference](/docs/cli) for flags, approval WebSocket, and exit codes.

### SDK

```sh
bun add @tagma/sdk @tagma/types
```

`@tagma/sdk` is the runtime the editor and CLI both wrap. Import `runPipeline`, `loadPipeline`, `bootstrapBuiltins`, and the approval-gateway adapters to drive pipelines from your own script. `@tagma/types` carries the wire contracts you need to write plugins. See the [SDK reference](/docs/sdk).

## Agent CLIs — install them *first*

Tagma drivers are adapters, not agents. **They spawn the real agent CLIs as subprocesses, so the CLI you plan to drive must already be installed and authenticated on your machine before Tagma can call it.**

The flow is always:

1. Go to the vendor's official page and install their agent CLI.
2. Authenticate it and confirm it runs from your terminal on its own.
3. *Then* point Tagma at it — either by using the built-in driver (Claude Code) or by adding the plugin package under `pipeline.plugins`.

| Agent CLI | Driver | Install from |
| --- | --- | --- |
| Claude Code | built-in (`claude-code`) | [claude.com/claude-code](https://claude.com/claude-code) |
| OpenCode | `@tagma/driver-opencode` | [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) — install the `opencode` CLI and ensure it is on your `PATH` |
| Codex CLI | `@tagma/driver-codex` | [github.com/openai/codex](https://github.com/openai/codex) — `npm i -g @openai/codex`, ensure `codex` is on your `PATH` |

For plugin drivers (OpenCode, Codex), you still need to declare the plugin in your pipeline:

```yaml
pipeline:
  plugins:
    - "@tagma/driver-opencode"
    - "@tagma/driver-codex"
```

Tagma verifies the underlying CLI is reachable at task start — the Codex driver, for example, runs `codex --version` once per process and throws a clear error if the binary is missing. Expect similar behavior from any third-party driver.

On Windows, the Claude Code driver requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if auto-detection fails. See [Drivers](/docs/drivers).

## Next

- [Your first pipeline](/docs/first-pipeline) — five-minute quickstart.
- [Using the editor](/docs/editor) — UI walkthrough.
- [CLI reference](/docs/cli) / [SDK reference](/docs/sdk).
