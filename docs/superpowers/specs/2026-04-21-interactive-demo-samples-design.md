# Interactive Demo Samples — Design

**Date:** 2026-04-21
**Scope:** Landing page (`src/pages/index.astro`) stage section
**Type:** Feature enhancement — replace single hardcoded animation with 4 selectable, interactive samples

## Goal

Turn the homepage Demo from a single looping animation into an interactive sample gallery where a visitor can:

1. Switch between 4 curated samples via tabs in the stage chrome
2. Toggle between **flowchart view** (current swim-lane canvas) and **YAML view** (syntax-highlighted source) for the active sample
3. Press **RUN** to replay the sample's simulated execution from frame 0
4. For Sample #3 (Migration), click an **Approve** button on the pending approval task to unblock the downstream lane — the one place where the demo is "truly interactive"

Execution is **simulated via pre-baked frames**, not real agent invocation. The goal is marketing polish, not a sandboxed runtime.

## Non-goals

- No real CLI invocation, no `@tagma/sdk` in the bundle
- No YAML editing — view-only
- No log panel, no task detail drawer — keep the stage visually clean
- No mobile-specific sample switcher redesign — reuse existing `< 960px` media query; tabs just wrap

## The 4 Samples (approved by user)

| # | Tab label | Lanes | Showcases |
|---|---|---|---|
| 1 | **Parallel Review** | Security · Performance · Style · Consolidate | Real parallel tracks, different CLIs per lane, fan-in |
| 2 | **Bug Triage** | Repro · Diagnose · Fix · Verify (linear, shell+AI mix) | `continue_from` chain, shell↔AI alternation |
| 3 | **Migration Gate** | Plan · **Approve** · Apply · Verify | `trigger: manual` — the only **user-interactive** sample |
| 4 | **Smoke Test** | Backend · Ops · Review | The existing demo, preserved as "full formation" |

Default active tab: **Parallel Review** (strongest visual payoff).

## Architecture

### Data-driven frame replay

Extract the single hardcoded sample in `index.astro` (tasks array, `cycle` frames, lane rail markup, edges) into a typed data module:

```
src/lib/demo/
  samples.ts          # The 4 Sample objects, ~400 lines total
  types.ts            # Sample, Lane, Task, Frame, Edge types
  replay.ts           # Pure functions: applyFrame(sample, frameIdx, root)
```

All `<script>` logic that currently manipulates DOM becomes a renderer that reads from a `Sample` object. The HTML skeleton in `index.astro` stays — we just parameterize.

### Data model

```ts
export interface Sample {
  id: string;                // 'parallel-review' | 'bug-triage' | ...
  tabLabel: { en: string; zh: string };
  filename: string;          // shown in crumb, e.g. '.tagma/review.yaml'
  yaml: string;              // raw YAML string for YAML view
  lanes: Lane[];             // 3–4 lanes, rendered in lane-rail
  tasks: Task[];             // positioned by {lane, col, nudge?}
  frames: Frame[];           // animation steps
  interactive?: { taskId: string; kind: 'approve' };  // only sample #3
}

export interface Lane {
  color: 'blue' | 'green' | 'pink' | 'teal' | 'orange';
  name: { en: string; zh: string };
  driver: string;            // 'claude-code · opus', 'shell', etc.
}

export interface Task {
  id: string;                 // unique within sample
  lane: number;               // 0-based
  col: number;
  nudge?: number;             // pixel offset for visual breathing room
  color: TaskColor;           // left-border accent
  glyph: '◆' | '▶' | '⚠';   // AI task, shell, manual gate
  title: { en: string; zh: string };
  driverLine: string;         // bottom meta line, e.g. 'claude-code · sonnet'
  chips?: ChipColor[];        // 0–3 decorative chips
}

export interface Frame {
  tasks: Record<string, TaskState>;        // taskId → 'ok' | 'running' | 'queued' | 'blocked'
  statusText: Record<string, string>;      // taskId → '✓ 13.6s', '⌛ queued', '🖐 waiting'
  edges: Edge[];                           // [fromId, toId, 'active' | 'pending']
  laneStatus?: Record<number, string>;     // optional override for lane-meta line
  blockUntilApprove?: boolean;             // if true, autoplay pauses until demo:approve event
}

export type Edge = [string, string, 'active' | 'pending'];
export type TaskState = 'ok' | 'running' | 'queued' | 'blocked';
export type TaskColor = 'teal' | 'green' | 'orange' | 'pink' | 'blue' | 'muted';
export type ChipColor = 'default' | 'g' | 'r' | 'y' | 'b';  // matches existing .chip.g/.r/.y/.b CSS
```

`blocked` is a new state (vs. current `'ok' | 'running' | 'queued'`) used for the manual-approval task in Sample #3 — rendered with `⚠` glyph and a pulse border in warn color.

### Stage chrome changes

Before:
```
[crumb: full-feature-smoke-test / .tagma/test-pipeline.yaml]  [⟲ HISTORY] [</> YAML] [●LIVE] [▶ RUN]
```

After:
```
[Tabs: Parallel Review | Bug Triage | Migration | Smoke Test]  [⟲ RESET] [</> YAML] [●LIVE] [▶ RUN]
```

- **Tabs** replace the static crumb. Active tab shows an orange underline (reuse `.dl-group .os.active::after` pattern).
- **Crumb** is dropped from the stage chrome — tabs carry the identity of the active sample. (The `<filename>` is still shown inside the YAML view header when that view is active.)
- **RESET** replaces HISTORY. Click = reset to frame 0 without autoplaying.
- **YAML** button becomes a toggle; active state highlighted.
- **RUN** starts playback from frame 0 (previously the animation was autoplay-only).

### YAML view

When `</>YAML` is toggled on, the `.canvas` area is replaced with a scrollable `<pre><code>` block showing `sample.yaml`. Use Astro's built-in `<Code>` component (Shiki) at build time for syntax highlighting. The minimap and zoom hide.

When toggled off, return to flowchart view and **resume the last animation state** (do not restart).

### Interactivity for Sample #3 (Migration)

- Migration sample declares `interactive: { taskId: 'approve', kind: 'approve' }` and marks a specific frame as the pause point via `frames[pauseIdx].blockUntilApprove = true` (a new optional field on `Frame`).
- When the replay engine enters that frame, it applies it normally (task renders as `blocked`, glyph `⚠`), then **stops the autoplay timer** instead of scheduling the next frame.
- The blocked task renders an inline **Approve button** (`.approve-btn`, orange, sized like `.pill`).
- Clicking dispatches `demo:approve`, which the replay loop listens for. On receipt, it resumes autoplay from the next frame.
- Auto-approve fallback: if user doesn't click within 8s, the demo approves itself. A small hint label "auto-approve in 8s" counts down next to the button.

### Playback model

Current: `setInterval` cycles through frames forever.

New:
```
state = { sampleId, frameIdx, playing, autoLoop }
```

- On sample switch: cancel current interval, load new sample, reset `frameIdx = 0`, apply frame 0 statically, start autoloop.
- On **RUN** click: if `frameIdx === last`, reset to 0 and autoplay. If mid-play, restart.
- On **RESET** click: pause, set to 0, apply.
- For sample #3 blocked frame: pause autoloop until `demo:approve` received.

Same `ANIM_INTERVAL_MS = 2600` per-frame tempo. Samples can override in data: `Sample.frameIntervalMs?`.

## Animation frame counts (rough)

| Sample | Frames | Total loop | Notes |
|---|---|---|---|
| Parallel Review | 4 | ~10s | All 3 lanes run concurrently in frames 1–2, consolidate in 3 |
| Bug Triage | 5 | ~13s | Linear progression, each task lights up in turn |
| Migration Gate | 4 + pause | ~10s + user | Frame 2 blocks on approval |
| Smoke Test | 3 | ~8s | Current cycle, unchanged |

## File changes

| File | Change |
|---|---|
| `src/pages/index.astro` | Strip hardcoded tasks/lanes from `.lane-field` and `.lane-rail`. Add tab bar. Reduce `<script>` to bootstrap + event wiring. Move animation logic into `src/lib/demo/replay.ts`. |
| `src/lib/demo/types.ts` | New — type definitions above |
| `src/lib/demo/samples.ts` | New — 4 `Sample` objects with YAML, tasks, frames |
| `src/lib/demo/replay.ts` | New — `mount(sample, rootEl)`, `runFrom(frame)`, `pause()`, `onApprove()` |
| `src/pages/index.astro` (style block) | Minor additions: `.sample-tabs`, `.approve-btn`, `.task.blocked`, yaml-view styles |

Keep style inline in `index.astro` for now (project's existing convention per `<style is:global>` block). Only extract TS.

## i18n

All `Sample.tabLabel`, `Lane.name`, `Task.title` are `{en, zh}` objects. Rendering reads `window.TAGMA_SHELL.get().lang` and swaps on `tagma:apply` event, same pattern as existing `data-i18n` attributes.

YAML content is not translated (YAML keys are English; only comments could be — skip for v1).

## Risk & mitigation

| Risk | Mitigation |
|---|---|
| Bundle size grows (4× samples + YAML strings) | Inline YAML is small (~300 lines × 4 = ~15KB); negligible vs. current page |
| Tab overflow on mobile (< 600px) | Tabs wrap to 2 rows, acceptable for marketing page |
| User never sees samples 2–4 | Auto-rotate to next sample every 20s if user hasn't interacted — configurable; off by default |
| YAML view breaks layout | Constrain YAML height to canvas height with `overflow: auto` |
| Approve button missed | Auto-approve fallback at 8s + visible hint |

## Out of scope (future)

- Log panel showing fake task stdout
- Task detail drawer on click
- Actual sandbox runtime via `@tagma/sdk`
- More than 4 samples (tabs would need dropdown)

## Acceptance checklist

- [ ] 4 tabs render in stage chrome, default = Parallel Review
- [ ] Clicking a tab swaps lanes, tasks, edges, YAML, and filename in crumb
- [ ] `</> YAML` toggles between flowchart and YAML code view
- [ ] `▶ RUN` replays from frame 0
- [ ] Sample #3 pauses on approval frame; Approve button unblocks it; 8s fallback works
- [ ] i18n: all tab labels + task titles + lane names switch on zh/en toggle
- [ ] Resize still works (wires redrawn)
- [ ] No regression on `< 960px` layout
