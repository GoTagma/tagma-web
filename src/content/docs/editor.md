---
title: Using the Editor
description: Compose, run, and inspect pipelines in the Tagma visual editor.
group: Using the Editor
order: 100
updated: 2026-04-21
---

The editor is a swim-lane canvas for pipelines: tracks are lanes, tasks are cards, arrows are dependencies. Everything saves to plain YAML on disk, so your pipelines are portable — commit them, hand them to the CLI, or keep editing them here.

## The Workspace

Before you open anything, the editor asks you to pick a **workspace** — a single root directory that scopes almost everything: where pipelines live, where plugins install to, where run artifacts and settings are saved, and what the editor is allowed to read or write. The workspace is how Tagma keeps agents on rails: nothing the editor touches escapes the workspace root unless you explicitly use an import / export picker.

### Picking and switching

- **Welcome screen → "Open workspace"** or **File → Workspace** opens a directory picker that walks the host filesystem so you can choose any folder. The picker is the *only* UI that's allowed outside the current workspace.
- Once chosen, the editor remembers recent workspaces and offers them on the Welcome screen.
- Switching workspaces cleanly unloads the previous workspace's plugins before loading the new one's — no leftover drivers lingering in the dropdown.

### Workspace layout on disk

The editor creates `.tagma/` inside your workspace the first time you set it:

```
<workspace>/
├─ .tagma/
│   ├─ <pipeline>.yaml            # one file per pipeline you create / import
│   ├─ <pipeline>.layout.json     # saved task-card positions
│   ├─ logs/<runId>/
│   │   ├─ pipeline.log           # full run log (all levels)
│   │   └─ <task>.stderr          # per-task stderr capture
│   └─ editor-settings.json       # per-workspace editor preferences
└─ node_modules/                  # installed plugins (workspace-scoped)
```

A few consequences worth knowing:

- **Pipelines are always under `.tagma/`.** New pipelines land there; imported YAMLs are copied in. This is the canonical convention the sidebar's "Pipelines" list reads from (`GET /api/workspace/yamls`).
- **Plugins are workspace-scoped.** Installing `@tagma/driver-codex` in one workspace does *not* make it available in another — each workspace has its own `node_modules/`. Switching workspaces unregisters the old ones from the SDK registry.
- **Editor settings are per-workspace.** Toggling `autoInstallDeclaredPlugins` on project A does not change project B's setting.
- **Run artifacts live next to the workspace**, so cleanup is `rm -rf <workspace>/.tagma/logs/` — no hidden per-user state.

### The workspace fence

Every filesystem endpoint in the editor server calls `assertWithinWorkspace(...)` before it touches disk. Concretely:

- **Open / Save / Save As / Delete** — path must be inside the workspace. Save As is hard-pinned to `.tagma/`.
- **Directory listing (`/api/fs/list`)** — default mode refuses paths outside the workspace. The workspace-root picker uses a separate origin-checked mode.
- **Import** — the *source* YAML can live anywhere (you picked it), but the destination is always inside `.tagma/`. Imports are rejected unless the source has a `.yaml` / `.yml` extension.
- **Export** — the *destination* directory can live anywhere (you picked it), but only the current pipeline's YAML + companion layout are written — no path-traversal in the destination filename.
- **Reveal in OS file manager** — path must be inside the workspace.

This is what makes the editor safe to run while pipelines execute real shell commands and drive real agents: the workspace root bounds the blast radius. Pipelines read & write your code; they don't silently modify your home directory, SSH keys, or `~/.aws`.

## Opening a pipeline

- **Welcome screen** — recent files and a "New pipeline" button.
- **File → Open** — pick any `.yaml` inside the current workspace. Tagma treats the file's directory as the working directory for relative paths inside the pipeline.
- **File → New** — creates `<workspace>/.tagma/pipeline-<id>.yaml` with a default track + task, ready to edit.

Task card positions are persisted alongside the YAML as a sibling `.layout.json` file, saved on **Ctrl+S** / **Cmd+S**. Moving a task card in the UI does not immediately hit disk — save first.

## The swim-lane canvas

- Each **track** renders as a horizontal lane. Tracks run in parallel.
- Each **task** is a card inside a lane. Cards show the task id, name, prompt or command preview, and any attached trigger / completion / middleware indicators.
- Arrows between cards are `depends_on` edges. Cross-track arrows come from `trackId.taskId` references.
- `command:` tasks (plain shell) render with AI-specific fields hidden — no model / reasoning / permissions controls.
- The **minimap** (bottom right) and **zoom controls** help with large pipelines. Scroll-wheel zooms.
- Right-click a track or task for the context menu (delete, duplicate, run-from-here).

## Editing fields

Clicking a card or a track header opens its config panel on the right:

- **Pipeline panel** — name, default driver / model / reasoning, pipeline-wide timeout, the `plugins` list, lifecycle hooks.
- **Track panel** — driver / model inherited from the pipeline, agent profile, permissions, cwd, track-level middlewares, `on_failure` policy.
- **Task panel** — prompt or command, driver / model / reasoning overrides, permissions, timeout, middlewares, trigger, completion. Fields you leave blank show the inherited value in grey.
- **YAML preview** — a live read-only view of the serialized YAML. Useful to cross-check what saves to disk.

## Running a pipeline

Hit **Run** on the toolbar. The canvas transitions to **Run view**:

- Task cards recolor by status (`idle / waiting / running / success / failed / timeout / skipped / blocked`).
- A **task panel** opens for the focused task with streamed stdout / stderr and the resolved driver / model / permissions.
- **Pipeline summary bar** shows the run id, elapsed time, and per-status counts.
- **Run history browser** lets you jump back into any prior run of the same pipeline. Each run's artifacts live under `<workDir>/.tagma/logs/<runId>/` alongside `pipeline.log`.

## Approvals

Tasks with a `trigger: { type: manual }` block the pipeline until someone approves. In the editor, approvals appear as an **Approval Dialog** over the canvas — one click to approve or reject, with an optional reason.

The same approvals are also exposed over WebSocket when running from the CLI — both channels are live simultaneously, first response wins. See the [CLI reference](/docs/cli).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Save pipeline + layout |
| `Ctrl/Cmd + O` | Open a pipeline file |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + C` / `V` / `D` | Copy / paste / duplicate the selection |
| `Ctrl/Cmd + F` | Focus the search overlay |
| `Delete` / `Backspace` | Delete the selected task or track |
| `Esc` | Clear selection (or blur the active input) |

Shortcuts are no-ops while focus is in a text input, except undo / redo and Esc.

## Where things live on disk

- **Pipeline YAML** — wherever you saved it; the editor doesn't impose a convention, but `.tagma/*.yaml` next to the project is common.
- **Layout** — `<pipeline>.layout.json`, saved on `Ctrl+S`.
- **Run artifacts** — `<workDir>/.tagma/logs/<runId>/pipeline.log` and per-task `*.stderr` files.

## Next

- [Pipeline YAML reference](/docs/pipeline-yaml) — every field the panels edit.
- [Drivers](/docs/drivers), [Plugins](/docs/plugins) — what's configurable inside a pipeline.
- [CLI reference](/docs/cli) — same runtime, headless.
