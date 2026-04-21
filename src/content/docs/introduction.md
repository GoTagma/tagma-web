---
title: Introduction
description: A swim-lane editor and runtime for AI agent orchestration.
group: Getting Started
order: 10
updated: 2026-04-21
---

Tagma is a swim-lane editor and runtime for AI agent orchestration. You compose pipelines of **tasks** — prompts or shell commands — and they execute on the agent CLIs you already have installed locally (Claude Code, OpenCode, Codex, …).

> **Local-first.** Everything runs on your machine. Tagma never proxies prompts — it invokes the CLIs you already trust, under the permissions you grant.

## Who is Tagma for

Tagma sits on top of the agent CLIs you already use. It does not replace them, ship its own model, or run a cloud service — it coordinates local CLI invocations into a DAG with per-task permissions, approvals, and structured handoffs.

Two kinds of users get the most out of it:

**1. Power users of agent CLIs** — people already deep on Claude Code, OpenCode, or Codex CLI who want to:

- Run **multiple agent CLIs in one pipeline** and hand off context between them (`continue_from` resumes the upstream session, or falls back to injecting its normalized output).
- Parallelize work across **tracks** — e.g. a "plan" track on Claude Code running alongside a "test" track on Codex — instead of babysitting one REPL at a time.
- Drop back to plain shell (`command:` tasks) for glue work between AI tasks without leaving the pipeline.

**2. Teams that want agents on rails** — engineers who don't want an agent CLI making arbitrary changes to their repo and instead want:

- **Per-task permissions** (`read` / `write` / `execute`) that map onto each driver's native sandbox flags — Claude Code's allowed-tools + `--permission-mode`, Codex's `--sandbox read-only` / `workspace-write` / `danger-full-access`, etc. The agent physically cannot do what you didn't grant.
- **Manual approval gates** (`trigger: { type: manual }`) that block a task until a human approves in the editor or over WebSocket — useful before deploys, migrations, or any destructive step.
- **Explicit completion checks** (`completion: exit_code | file_exists | output_check | llm_judge`) so a task counts as "succeeded" only when it actually does what you wanted — not just when the agent happily exits 0.
- **Reproducible YAML** — your pipeline is a plain file on disk. No proprietary format, no cloud state, no "I edited it in the UI three days ago and can't remember what changed".

## Pipelines, tracks, tasks

A pipeline has one or more **tracks**. Tracks run in parallel; tasks inside a track run in whatever order their dependencies allow. Every task belongs to exactly one track, picks a **driver** (which agent CLI invokes it), and carries either a `prompt` (AI task) or a `command` (plain shell).

```yaml
# .tagma/hello.yaml
pipeline:
  name: hello
  driver: claude-code
  plugins:
    - "@tagma/driver-claude-code"   # claude-code is a plugin; opencode is the only built-in driver
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

## Two ways to use Tagma

### Visual editor (no code)

Draw pipelines as swim lanes, run them, and watch logs stream live. Approvals, retries, and history all happen in the UI. Pipelines save to plain YAML on disk, so you can commit them to git or hand them off to the CLI later.

- [Install the editor](/docs/install#desktop-editor)
- [Using the editor](/docs/editor) — UI walkthrough, shortcuts, approvals, run history

### SDK, CLI & custom plugins (for developers)

Everything the editor does is backed by `@tagma/sdk`. Run pipelines from a script, embed the runtime in your own tools, or extend it with plugins. Four plugin categories: **drivers**, **triggers**, **completions**, **middlewares** — each a TypeScript object that implements a small interface.

- [Install the SDK or CLI](/docs/install#sdk--cli)
- [SDK reference](/docs/sdk) — `runPipeline`, approval gateway, pipeline CRUD
- [CLI reference](/docs/cli) — `tagma <pipeline.yaml>` for headless runs
- [Writing custom plugins](/docs/custom-plugins) — per-category walkthroughs

## Source

Tagma is open source. The code lives in two repositories:

- **[github.com/GoTagma/tagma-mono](https://github.com/GoTagma/tagma-mono)** — the editor, `@tagma/sdk`, `@tagma/types`, and the first-party driver / trigger / completion / middleware packages.
- **[github.com/GoTagma/tagma-cli](https://github.com/GoTagma/tagma-cli)** — the `@tagma/cli` headless runner.

Issues and contributions welcome.

## Next

- [Install](/docs/install) — editor download, CLI, SDK
- [Your first pipeline](/docs/first-pipeline) — five-minute quickstart
- [Pipeline YAML reference](/docs/pipeline-yaml) — every field
