---
title: Your First Pipeline
description: Compose a two-track pipeline and run it end-to-end in five minutes.
group: Getting Started
order: 30
updated: 2026-04-21
---

This guide builds the smallest non-trivial pipeline in Tagma: two tracks, four tasks, one cross-track dependency.

## Create the file

Pipelines are plain YAML. The editor typically keeps them under `.tagma/` in your project, but the CLI accepts any path — there's no fixed convention.

Create `.tagma/hello.yaml`:

```yaml
pipeline:
  name: hello
  driver: claude-code
  plugins:
    - "@tagma/driver-claude-code"
  tracks:
    - id: plan
      name: Plan
      tasks:
        - id: outline
          prompt: "Outline a CLI that greets the user."

    - id: build
      name: Build
      tasks:
        - id: scaffold
          prompt: "Scaffold the project."
          depends_on: [plan.outline]
          continue_from: plan.outline
        - id: implement
          prompt: "Implement greet()."
          depends_on: [scaffold]
          continue_from: scaffold
        - id: verify
          command: "node ./dist/cli.js --version"
          depends_on: [implement]
```

A few things worth noting:

- `opencode` is the only built-in driver. `claude-code` and `codex` ship as plugins, so they must be declared under `pipeline.plugins` — that's the line above. To run this pipeline on OpenCode instead, drop the `plugins:` list and set `driver: opencode`.
- Cross-track dependencies use `trackId.taskId` syntax (`plan.outline`). Same-track references can use the bare task id (`scaffold`).
- `continue_from` does **not** imply `depends_on`; the DAG builder adds the edge for you, but listing both is explicit and safe.
- The last task uses `command:` instead of `prompt:` — it's a plain shell command, no driver needed.

## Run it

**From the CLI:**

```sh
tagma ./.tagma/hello.yaml --cwd .
```

The CLI prints pipeline progress to stdout and writes a full run log to `./.tagma/logs/<runId>/pipeline.log` under the `--cwd` directory (each run gets its own `<runId>` folder). Exit code `0` means every task succeeded.

**From the editor:**

Open the project in Tagma and pick the file. Each track renders as a swim-lane; arrows mark `depends_on` edges. Task logs stream live. You can run a single task plus its descendants by clicking it and using the context menu.

## Next

- [Using the editor](/docs/editor) — swim-lane UI walkthrough.
- [Pipeline YAML reference](/docs/pipeline-yaml) — every field, every default.
- [Drivers](/docs/drivers) — what ships, and how to pick one.
- [Plugins](/docs/plugins) — triggers, completions, and middlewares.
- [Writing custom plugins](/docs/custom-plugins) — build your own.
