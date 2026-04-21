---
title: Install
description: Get the desktop editor, the CLI, or the SDK — whichever fits your workflow.
group: Getting Started
order: 20
updated: 2026-04-21
---

Tagma ships in three pieces that all drive the same runtime. Pick the ones you need.

## Desktop editor

The visual editor is an Electron app built from the `tagma-mono` monorepo. The Electron app + the editor server live in `apps/`, which is tracked as a git submodule — clone with submodules or initialise them before the first build:

```sh
git clone --recurse-submodules https://github.com/GoTagma/tagma-mono.git
cd tagma-mono
bun install
bun run dev:desktop
```

If you already cloned without submodules, run `bun run apps:init` (or `git submodule update --init --recursive apps`) first.

To produce a platform installer instead:

```sh
bun run dist:desktop:win      # Windows (nsis)
bun run dist:desktop:mac      # macOS (dmg)
bun run dist:desktop:linux    # Linux (AppImage / deb / rpm / tar.gz)
```

Installers land under `apps/electron/release/`. Each installer also bundles a platform-matched `opencode` CLI binary in `resources/opencode/`, so end users of the packaged app don't need a separate `opencode` or `bun` install.

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
3. *Then* point Tagma at it — either by using the built-in driver (OpenCode) or by adding the plugin package under `pipeline.plugins`.

| Agent CLI | Driver | Install from |
| --- | --- | --- |
| OpenCode | built-in (`opencode`) | [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) — install the `opencode` CLI and ensure it is on your `PATH`. The desktop app ships a bundled copy; SDK / CLI direct users can also let the driver auto-install via `bun install -g opencode-ai` when `bun` is on `PATH`. |
| Claude Code | `@tagma/driver-claude-code` | [claude.com/claude-code](https://claude.com/claude-code) |
| Codex CLI | `@tagma/driver-codex` | [github.com/openai/codex](https://github.com/openai/codex) — `npm i -g @openai/codex`, ensure `codex` is on your `PATH` |

For plugin drivers (Claude Code, Codex), you still need to declare the plugin in your pipeline:

```yaml
pipeline:
  plugins:
    - "@tagma/driver-claude-code"
    - "@tagma/driver-codex"
```

Tagma verifies the underlying CLI is reachable at task start — the Codex driver, for example, runs `codex --version` once per process and throws a clear error if the binary is missing. Expect similar behavior from any third-party driver.

On Windows, the Claude Code driver requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if auto-detection fails. See [Drivers](/docs/drivers).

## Next

- [Your first pipeline](/docs/first-pipeline) — five-minute quickstart.
- [Using the editor](/docs/editor) — UI walkthrough.
- [CLI reference](/docs/cli) / [SDK reference](/docs/sdk).
