---
title: Introduction
description: A swim-lane editor and runtime for AI agent orchestration.
group: Getting Started
order: 1
---

Tagma is a swim-lane editor and runtime for AI agent orchestration. You compose pipelines of **tasks** — prompts or shell commands — and they execute on the agent CLIs you already have installed locally (Claude Code, OpenCode, Codex, …).

## Pipelines, tracks, tasks

A pipeline has one or more **tracks**. Tracks run in parallel; tasks inside a track run in whatever order their dependencies allow. Every task belongs to exactly one track, picks a **driver** (which agent CLI invokes it), and carries either a `prompt` (AI task) or a `command` (plain shell).

```yaml
# .tagma/hello.yaml
pipeline:
  name: hello
  driver: claude-code
  tracks:
    - id: backend
      name: Backend
      tasks:
        - id: plan
          prompt: "Plan the /health endpoint change."
        - id: implement
          prompt: "Implement /health."
          depends_on: [plan]
          continue_from: plan
```

`depends_on` is a hard DAG edge. `continue_from` additionally asks the driver to resume the referenced task's session (or fall back to prepending its output as context) — it's how context flows between tasks.

> **Local-first.** Everything runs on your machine. Tagma never proxies prompts — it invokes the CLIs you already trust, under the permissions you grant.

## Install

Tagma is distributed as three pieces. Install the ones you need.

### Desktop editor (Electron)

Build from source — `bun install` at the repo root, then `bun run dev:desktop` for a dev build or `bun run dist:desktop:{win,mac,linux}` to produce an installer. Requires **Bun ≥ 1.3**.

### CLI (headless)

```sh
bun add -g @tagma/cli
tagma ./my-pipeline.yaml
```

The CLI is the same runtime the editor uses — no daemon, no shared config. See [CLI reference](/docs/cli).

### Agent CLIs

Install whichever agent CLIs your pipelines call: Claude Code (built-in driver), plus `@tagma/driver-opencode` / `@tagma/driver-codex` if you want to drive OpenCode or Codex. See [Drivers](/docs/drivers).

### System requirements

| Platform | Minimum     | Recommended   |
| -------- | ----------- | ------------- |
| macOS    | 13 Ventura  | 14+ Sonoma    |
| Windows  | 10 (22H2)   | 11            |
| Linux    | glibc 2.31+ | Ubuntu 22.04+ |

On Windows, the Claude Code driver requires `CLAUDE_CODE_GIT_BASH_PATH` pointing to Git Bash's `bash.exe` if auto-detection fails.

## Next

- Build [your first pipeline](/docs/first-pipeline) in five minutes.
- Read the [pipeline YAML reference](/docs/pipeline-yaml).
- Browse the [driver reference](/docs/drivers) or write one with the [TypeScript SDK](/docs/sdk).
