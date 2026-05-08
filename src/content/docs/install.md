---
title: Install
description: Get the desktop editor, the CLI, or the SDK — whichever fits your workflow.
group: Getting Started
order: 20
updated: 2026-05-08
---

Tagma ships in three pieces that all drive the same runtime. Pick the ones you need.

> **Bun-only.** Every entry point — editor sidecar, SDK, CLI — uses `Bun.spawn` / `Bun.file` / `Bun.serve`. Node, npm, yarn, and pnpm are not supported (the SDK's preinstall guard refuses non-Bun installers). Bun **≥ 1.3** is required everywhere.

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
bun run dist:desktop:mac      # macOS (dmg, separate x64 + arm64)
bun run dist:desktop:linux    # Linux (AppImage / deb / rpm / tar.gz)
```

Installers land under `apps/electron/release/` and are named `Tagma-${version}-${os}-${arch}.${ext}`. Each installer also bundles a platform-matched `opencode` CLI binary under `resources/opencode/`, so end users of the packaged app don't need a separate `opencode` or `bun` install. The bundled OpenCode version is pinned via `apps/electron/package.json → tagma.bundledOpencodeVersion`.

The desktop shell also supports **in-place hot-update** for the editor frontend and the Bun-compiled sidecar (per release channel: `alpha` / `beta` / `rc` / `stable`); see the [editor walkthrough](/docs/editor#updates) for what end users see.

**Bun install.** On Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`. On macOS / Linux: `curl -fsSL https://bun.sh/install | bash`.

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

Package: [`@tagma/cli`](https://github.com/GoTagma/tagma-cli). The CLI exposes four subcommands — `run`, `validate`, `compile`, `dag` — over the same SDK runtime; the bare `tagma <pipeline.yaml>` form is shorthand for `run`. See the [CLI reference](/docs/cli) for flags, the dual stdin/WebSocket approval channel, and exit codes.

### SDK

```sh
bun add @tagma/sdk @tagma/types
```

`@tagma/sdk` is the Bun-first convenience package that composes `@tagma/core` (runtime-independent orchestration: DAG, registry, approvals, logger, dataflow, prompt-doc helpers) with `@tagma/runtime-bun` (Bun process execution, file watching, log storage, approval adapters). The editor and CLI both wrap it. From your own script you'll usually call `createTagma()` to get a configured instance, then `tagma.run(config, { cwd })`. `@tagma/types` carries the wire contracts that plugins depend on. See the [SDK reference](/docs/sdk).

You can install the lower-level packages directly when a host needs to swap the runtime (e.g. tests, non-Bun environments): `bun add @tagma/core @tagma/runtime-bun @tagma/types`.

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

If the underlying CLI isn't reachable, the underlying spawn fails with a clear `ENOENT` error at task start (or the driver's own probe error message — Claude Code, for instance, fails out of `claude -p`). Expect the same shape from any third-party driver.

On Windows, the Claude Code driver requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if auto-detection fails. See [Drivers](/docs/drivers).

## Next

- [Your first pipeline](/docs/first-pipeline) — five-minute quickstart.
- [Using the editor](/docs/editor) — UI walkthrough.
- [CLI reference](/docs/cli) / [SDK reference](/docs/sdk).
