---
title: Using the Editor
description: Compose, run, and inspect pipelines in the Tagma visual editor.
group: Using the Editor
order: 100
updated: 2026-05-08
---

The editor is a swim-lane canvas for pipelines: tracks are lanes, tasks are cards, arrows are dependencies. Everything saves to plain YAML on disk, so your pipelines are portable — commit them, hand them to the CLI, or keep editing them here.

## The Workspace

Before you open anything, the editor asks you to pick a **workspace** — a single root directory that scopes almost everything: where pipelines live, where plugins install to, where run artifacts and settings are saved, and what the editor is allowed to read or write. The workspace is how Tagma keeps agents on rails: nothing the editor touches escapes the workspace root unless you explicitly use an import / export picker.

### Picking and switching

- **Welcome screen → "Open workspace"** opens a directory picker that walks the host filesystem so you can choose any folder. The picker is the *only* UI that's allowed outside the current workspace.
- The Welcome screen lists **recent workspaces**; click one to reopen it. Recents are stored in user data, not in the workspace itself.
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
│   │   ├─ <task>.stdout          # per-task stdout (full bytes; bounded tails on the wire)
│   │   └─ <task>.stderr          # per-task stderr capture
│   └─ editor-settings.json       # per-workspace editor preferences (incl. safe-mode allowlist)
└─ node_modules/                  # installed plugins (workspace-scoped)
```

A few consequences worth knowing:

- **Pipelines are always under `.tagma/`.** New pipelines land there; imported YAMLs are copied in. This is the canonical convention the sidebar's "Pipelines" list reads from (`GET /api/workspace/yamls`).
- **Plugins are workspace-scoped.** Installing `@tagma/driver-codex` in one workspace does *not* make it available in another — each workspace has its own `node_modules/`. Switching workspaces unregisters the old ones from the SDK registry.
- **Editor settings are per-workspace.** Toggling `autoInstallDeclaredPlugins` on project A does not change project B's setting.
- **Run artifacts live next to the workspace.** Per-task stdout/stderr are streamed to disk in full — the wire payload only carries bounded tails, but you can always read the canonical files from `.tagma/logs/<runId>/<taskId>.stdout`. Cleanup is `rm -rf <workspace>/.tagma/logs/`. Old run directories are pruned automatically to the most recent 20 (`maxLogRuns`).

### The workspace fence

Every filesystem endpoint in the editor server calls `assertWithinWorkspace(...)` before it touches disk. Concretely:

- **Open / Save / Save As / Delete** — path must be inside the workspace. Save As is hard-pinned to `.tagma/`.
- **Directory listing (`/api/fs/list`)** — default mode refuses paths outside the workspace. The workspace-root picker uses a separate origin-checked mode.
- **Import** — the *source* YAML can live anywhere (you picked it), but the destination is always inside `.tagma/`. Imports are rejected unless the source has a `.yaml` / `.yml` extension.
- **Export** — the *destination* directory can live anywhere (you picked it), but only the current pipeline's YAML + companion layout are written — no path-traversal in the destination filename.
- **Reveal in OS file manager** — path must be inside the workspace.

This is what makes the editor safe to run while pipelines execute real shell commands and drive real agents: the workspace root bounds the blast radius. Pipelines read & write your code; they don't silently modify your home directory, SSH keys, or `~/.aws`.

## Opening a pipeline

- **Welcome screen** — recent workspaces and a "Open workspace" button. Pipelines from the active workspace appear in the sidebar.
- **File → Open** — pick any `.yaml` inside the current workspace. Tagma treats the file's directory as the working directory for relative paths inside the pipeline.
- **File → New** — creates `<workspace>/.tagma/pipeline-<id>.yaml` with a default track + task, ready to edit.

Task card positions are persisted alongside the YAML as a sibling `.layout.json` file, saved on **Ctrl+S** / **Cmd+S**. Moving a task card in the UI does not immediately hit disk — save first.

## The swim-lane canvas

- Each **track** renders as a horizontal lane. Tracks run in parallel.
- Each **task** is a card inside a lane. Cards show the task id, name, prompt or command preview, and any attached trigger / completion / middleware indicators. Bubble glyphs along the bottom edge surface live `inputs` / `outputs` once a run starts populating them.
- Arrows between cards are `depends_on` edges. Cross-track arrows come from `trackId.taskId` references.
- `command:` tasks (plain shell) render with AI-specific fields hidden — no model / reasoning / permissions controls.
- The **minimap** (bottom right) and **zoom controls** help with large pipelines. Scroll-wheel zooms.
- Right-click a track or task for the context menu (delete, duplicate, run-from-here).

## Editing fields

Clicking a card or a track header opens its config panel on the right:

- **Pipeline panel** — name, **mode** (`safe` / `trusted`), default driver / model / reasoning, default permissions, `max_concurrency`, pipeline-wide timeout, the `plugins` list, lifecycle hooks. Hooks and `command:` tasks visibly grey-out when `safe` is selected so you can see what would be blocked.
- **Track panel** — driver / model inherited from the pipeline, agent profile, permissions, cwd, track-level middlewares, `on_failure` policy.
- **Task panel** — prompt or command, driver / model / reasoning overrides, permissions, timeout, middlewares, trigger, completion, **inputs** and **outputs** bindings (`PortsEditor` / `TaskBindingsEditor`). Fields you leave blank show the inherited value in grey.
- **YAML preview** — a live read-only view of the serialized YAML. Useful to cross-check what saves to disk.

Plugin-config forms are generated from each plugin's `PluginSchema` when one is declared — the editor renders typed inputs (number, enum, duration, path, …) and per-field placeholders/help text. Plugins without a schema fall back to a raw key/value editor.

## Running a pipeline

Hit **Run** on the toolbar. The canvas transitions to **Run view**:

- Task cards recolor by status (`idle / waiting / running / success / failed / timeout / skipped / blocked`).
- A **task panel** opens for the focused task with streamed stdout / stderr and the resolved driver / model / permissions. Stdout / stderr panes show "X MB (truncated)" markers when the wire tail is bounded; use **Open full log** to read the on-disk file.
- **Pipeline summary bar** shows the run id, elapsed time, and per-status counts.
- **Run history browser** lets you jump back into any prior run of the same pipeline. Each run's artifacts live under `<workDir>/.tagma/logs/<runId>/` alongside `pipeline.log`.
- **History flow view** replays a past run on the swim-lane canvas, with per-task durations and exit codes overlaid on the cards.

The editor server forwards the SDK's `RunEventPayload` stream over SSE (with a `seq` stamp per run; clients dedupe by `(runId, seq)`). On reconnect, the server replays a `run_snapshot` so the canvas can rebuild the task map, pending approvals, and pipeline-level logs even after the bounded buffer has dropped older events.

## Approvals

Tasks with a `trigger: { type: manual }` block the pipeline until someone approves. In the editor, approvals appear as an **Approval Dialog** over the canvas — one click to approve or reject, with an optional reason.

When the same pipeline is run via the CLI, approvals are also exposed over WebSocket (and stdin). All channels are live simultaneously, first response wins. See the [CLI reference](/docs/cli).

## Plugins page

**File → Plugins** (or the Plugins link in the toolbar) opens a workspace-scoped plugins manager:

- **Local tab** — every plugin currently installed in the workspace's `node_modules`, with import / load / reload / uninstall actions. **Import Local** accepts either a directory containing your plugin's `package.json` or a `.tgz` tarball; the editor writes a `file:` dependency, runs `bun install`, and re-registers handlers. See [Custom Plugins → using your plugin without publishing](/docs/custom-plugins#using-your-plugin-without-publishing).
- **Marketplace tab** — curated list of `@tagma/*` plugins; installs straight into the workspace.

Plugin `tagmaPlugin` manifest fields (`category`, `type`) gate registration: a package without that manifest is rejected before any module code runs.

## Chat panel (OpenCode)

The right dock hosts a **Chat** panel backed by the OpenCode CLI. From there you can:

- Talk to a coding agent that has read access to the workspace.
- Have the agent edit the active pipeline YAML for you — the editor takes a YAML edit lock while chat is writing, so manual edits and chat edits can't race. The lock is released as soon as the chat-driven edit lands.
- Add **custom OpenCode providers** (the chat panel ships with a Custom Provider modal) so you can point chat at your own OpenAI-compatible endpoint, locally hosted models, etc.

The status bar at the bottom of every non-Welcome screen surfaces editor and OpenCode versions; the editor chip exposes an **Update** action when a newer release is available on the configured channel. (Desktop builds ship a bundled OpenCode binary; in-app upgrades land in `userData/opencode/` and take precedence over the bundled copy without replacing it.)

## Updates

Desktop builds support **in-place hot-update** for the editor frontend bundle and the Bun-compiled sidecar binary, on a per-channel basis (`alpha` / `beta` / `rc` / `stable`):

- The sidecar polls `<updateManifestBaseUrl>/<channel>/manifest.json` on startup.
- Validated bundles are staged under `userData/editor/dist.staged/` and atomically swapped into `userData/editor/dist/` on success; the previous build is preserved as `dist.previous/` for rollback.
- A new editor bundle takes effect after the sidecar respawns (close every window — macOS: quit the app — and reopen). `/api/editor/info` reports `pendingRestart: true` while a hot-updated bundle is staged.
- Sidecar binary updates are pointer-based via `userData/editor-sidecar/current.json` and applied on the next sidecar relaunch by the Electron main process.
- Manifests can be Ed25519-signed; the editor refuses unsigned or mismatched manifests when a public key is baked into the installer.

The OpenCode CLI is intentionally **not** updated independently from the editor — it is pinned per Tagma release and rides along with editor/sidecar updates to avoid runtime regressions. The route exists for tooling / manual recovery.

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
- **Run artifacts** — `<workDir>/.tagma/logs/<runId>/pipeline.log` plus per-task `*.stdout` / `*.stderr` files.
- **Editor settings (per workspace)** — `<workspace>/.tagma/editor-settings.json`. Includes the safe-mode allowlist applied to runs initiated from the editor and the `autoInstallDeclaredPlugins` toggle.
- **Recent workspaces / global preferences** — Electron `userData/`. Hot-updated editor bundle: `userData/editor/dist/`. Hot-updated sidecar: `userData/editor-sidecar/`.

## Next

- [Pipeline YAML reference](/docs/pipeline-yaml) — every field the panels edit.
- [Drivers](/docs/drivers), [Plugins](/docs/plugins) — what's configurable inside a pipeline.
- [CLI reference](/docs/cli) — same runtime, headless.
