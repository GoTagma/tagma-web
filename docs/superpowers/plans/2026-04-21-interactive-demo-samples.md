# Interactive Demo Samples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded homepage Demo animation with 4 user-selectable samples (Parallel Review, Bug Triage, Migration Gate, Smoke Test), each with a flowchart view, YAML view, and simulated replay. Sample #3 has a real interactive Approve button.

**Architecture:** Data-driven frame replay. Extract the inline animation in `src/pages/index.astro` into typed data + pure render functions in `src/lib/demo/`. The HTML stage skeleton stays; task cards, lane rail, wires, and state get built at runtime from a `Sample` object. Stage chrome gains a tab bar for sample switching. YAML pre-rendered at build time via Astro's `<Code>` component, toggled with a view-mode state.

**Tech Stack:** Astro 6.x (strict TS), vanilla DOM (no framework), CSS in-file, Shiki via `astro:components` `<Code>` for YAML rendering.

**Testing approach:** This is a marketing landing page with no unit-test framework. Each task ends with:
1. `bun run astro check` — typecheck gate (MUST pass)
2. `bun run dev` — visual verification in browser at `http://localhost:4321/`
3. `git commit` — frequent commits, one per task

Reference spec: `docs/superpowers/specs/2026-04-21-interactive-demo-samples-design.md`

---

## File Structure

```
src/
  lib/
    demo/
      types.ts          # Sample / Lane / Task / Frame / Edge types — NEW
      samples.ts        # SAMPLES: Sample[] with all 4 samples — NEW
      replay.ts         # mount() / applyFrame() / start() controller — NEW
  components/
    DemoYaml.astro      # Pre-rendered Shiki blocks, one per sample — NEW
  pages/
    index.astro         # Strip hardcoded demo; wire tabs + replay — MODIFY
```

Responsibilities:
- **types.ts** — single source of truth for demo types. No logic.
- **samples.ts** — the 4 sample literals. No logic, no DOM.
- **replay.ts** — all DOM manipulation for the demo. Pure render + a controller. Zero hardcoded sample data.
- **DemoYaml.astro** — renders 4 hidden `<div data-yaml-id="...">` with Shiki-highlighted YAML. Shown/hidden by the script in index.astro.
- **index.astro** — markup skeleton + event wiring. No demo state beyond "which sample is active".

---

## Commit conventions

All commits use the existing repo style (`update ...` imperative lowercase, matches `git log` of main). No co-author line.

---

### Task 1: Create demo types module

**Files:**
- Create: `src/lib/demo/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/lib/demo/types.ts
export type TaskState = 'ok' | 'running' | 'queued' | 'blocked';
export type EdgeState = 'active' | 'pending';
export type Edge = [fromId: string, toId: string, state: EdgeState];

export type LaneColor = 'blue' | 'green' | 'pink' | 'teal' | 'orange' | 'muted';
export type TaskColor = LaneColor;
export type ChipColor = 'default' | 'g' | 'r' | 'y' | 'b';
export type TaskGlyph = '◆' | '▶' | '⚠';

export interface I18nString {
  en: string;
  zh: string;
}

export interface Lane {
  color: LaneColor;
  name: I18nString;
  driver: string;           // mono meta line, e.g. 'claude-code · opus'
}

export interface Task {
  id: string;               // unique within sample
  lane: number;             // 0-based index into Sample.lanes
  col: number;              // 0..3
  nudge?: number;           // pixel x-offset for visual breathing room
  color: TaskColor;
  glyph: TaskGlyph;
  title: I18nString;
  driverLine: string;       // bottom meta line, e.g. 'claude-code · sonnet'
  chips?: ChipColor[];      // 0..3 decorative chips
}

export interface Frame {
  tasks: Record<string, TaskState>;
  statusText: Record<string, string>;  // e.g. '✓ 13.6s', '⌛ queued', '🖐 waiting'
  edges: Edge[];
  laneStatus?: Record<number, I18nString>;  // optional override for lane-meta status line
  blockUntilApprove?: boolean;               // if true, autoplay pauses until 'demo:approve' event
}

export interface Sample {
  id: string;
  tabLabel: I18nString;
  filename: string;
  yamlId: string;                           // matches data-yaml-id in DemoYaml.astro
  lanes: Lane[];
  tasks: Task[];
  frames: Frame[];
  frameIntervalMs?: number;                 // default 2600
  interactive?: { taskId: string; kind: 'approve'; autoApproveMs?: number };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run astro check`
Expected: `0 errors` (new file, only internal references)

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/types.ts
git commit -m "add demo types module for homepage samples"
```

---

### Task 2: Build the Smoke Test sample (migrated from current hardcoded data)

**Files:**
- Create: `src/lib/demo/samples.ts`

- [ ] **Step 1: Create samples.ts with only the Smoke Test sample (matches existing animation exactly)**

```ts
// src/lib/demo/samples.ts
import type { Sample } from './types';

const smokeTest: Sample = {
  id: 'smoke-test',
  tabLabel: { en: 'Smoke Test', zh: '全链路测试' },
  filename: '.tagma/test-pipeline.yaml',
  yamlId: 'smoke-test',
  lanes: [
    { color: 'blue',  name: { en: 'Backend', zh: '后端' },     driver: 'opencode · big-pickle' },
    { color: 'green', name: { en: 'Ops',     zh: '运维' },     driver: 'shell' },
    { color: 'pink',  name: { en: 'Review',  zh: '审查' },     driver: 'claude-code · opus' },
  ],
  tasks: [
    { id: 't1', lane: 0, col: 0, color: 'teal',   glyph: '◆',
      title: { en: 'Plan the change',      zh: '规划变更' },
      driverLine: 'opencode · opencode/big', chips: ['g', 'r', 'default'] },
    { id: 't2', lane: 0, col: 1, color: 'orange', glyph: '◆',
      title: { en: 'Implement /health',    zh: '实现 /health' },
      driverLine: 'opencode · opencode/big', chips: ['default', 'y', 'r'] },
    { id: 't3', lane: 0, col: 2, color: 'muted',  glyph: '◆',
      title: { en: 'Self-review the diff', zh: '自审 diff' },
      driverLine: 'opencode · opencode/big', chips: ['default', 'default'] },
    { id: 't4', lane: 1, col: 0, color: 'green',  glyph: '▶',
      title: { en: 'Prepare signal dir',   zh: '准备信号目录' },
      driverLine: 'shell · mkdir -p .signals' },
    { id: 't5', lane: 1, col: 1, color: 'green',  glyph: '▶',
      title: { en: 'Wait for signal',      zh: '等待信号' },
      driverLine: 'shell · poll ./signals/done' },
    { id: 't6', lane: 2, col: 3, nudge: 28, color: 'pink', glyph: '◆',
      title: { en: 'Summarize backend run', zh: '汇总本次执行' },
      driverLine: 'claude-code · opus-4.7', chips: ['default', 'b'] },
  ],
  frames: [
    {
      tasks: { t1: 'ok', t2: 'running', t3: 'queued', t4: 'ok', t5: 'ok', t6: 'queued' },
      statusText: { t1: '✓ 13.6s', t2: '▶', t3: '⌛ queued', t4: '✓ 7ms', t5: '✓ 4ms', t6: '⌛ queued' },
      edges: [['t1', 't2', 'active'], ['t2', 't3', 'pending'], ['t4', 't5', 'pending'], ['t3', 't6', 'pending'], ['t5', 't6', 'pending']],
    },
    {
      tasks: { t1: 'ok', t2: 'ok', t3: 'running', t4: 'ok', t5: 'ok', t6: 'queued' },
      statusText: { t1: '✓ 13.6s', t2: '✓ 38.4s', t3: '▶', t4: '✓ 7ms', t5: '✓ 4ms', t6: '⌛ queued' },
      edges: [['t1', 't2', 'pending'], ['t2', 't3', 'active'], ['t4', 't5', 'pending'], ['t3', 't6', 'pending'], ['t5', 't6', 'pending']],
    },
    {
      tasks: { t1: 'ok', t2: 'ok', t3: 'ok', t4: 'ok', t5: 'ok', t6: 'running' },
      statusText: { t1: '✓ 13.6s', t2: '✓ 38.4s', t3: '✓ 21.7s', t4: '✓ 7ms', t5: '✓ 4ms', t6: '▶' },
      edges: [['t1', 't2', 'pending'], ['t2', 't3', 'pending'], ['t4', 't5', 'pending'], ['t3', 't6', 'active'], ['t5', 't6', 'active']],
    },
  ],
};

export const SAMPLES: Sample[] = [smokeTest];
export const DEFAULT_SAMPLE_ID = 'smoke-test';
```

- [ ] **Step 2: Typecheck**

Run: `bun run astro check`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/samples.ts
git commit -m "add smoke-test demo sample migrated from inline data"
```

---

### Task 3: Build replay module (DOM render + controller)

**Files:**
- Create: `src/lib/demo/replay.ts`

- [ ] **Step 1: Create replay.ts**

```ts
// src/lib/demo/replay.ts
import type { Sample, Task, Lane, Frame, Edge } from './types';

export interface ReplayRoots {
  canvas: HTMLElement;      // .canvas
  rail: HTMLElement;        // .lane-rail
  field: HTMLElement;       // .lane-field (contains tasks + strips + svg)
  wires: SVGSVGElement;     // #wires
}

export interface Controller {
  sampleId: string;
  pause(): void;
  start(): void;
  reset(): void;
  destroy(): void;
  approve(): void;
}

type Lang = 'en' | 'zh';

function currentLang(): Lang {
  const w = window as Window & { TAGMA_SHELL?: { get(): { lang: Lang } } };
  return w.TAGMA_SHELL?.get().lang ?? 'en';
}

function createLaneRail(rail: HTMLElement, lanes: Lane[], lang: Lang) {
  rail.innerHTML = '';
  lanes.forEach((lane, idx) => {
    const row = document.createElement('div');
    row.className = 'lane-row';
    row.dataset.lane = String(idx);
    row.innerHTML = `
      <div class="lane-name"><span class="swatch" style="background:var(--${lane.color})"></span><span class="lane-label">${lane.name[lang]}</span></div>
      <div class="lane-meta">${lane.driver}</div>
      <div class="lane-meta lane-status" data-lane="${idx}"></div>
      <span class="cnt"></span>
    `;
    rail.appendChild(row);
  });
}

function createStrips(field: HTMLElement, laneCount: number) {
  field.querySelectorAll('.lane-strip').forEach((n) => n.remove());
  for (let i = 1; i < laneCount; i++) {
    const strip = document.createElement('div');
    strip.className = 'lane-strip';
    strip.style.top = `${(i / laneCount) * 100}%`;
    field.insertBefore(strip, field.firstChild);
  }
}

function createTasks(field: HTMLElement, tasks: Task[], lang: Lang, interactiveTaskId: string | null) {
  field.querySelectorAll('.task').forEach((n) => n.remove());
  tasks.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'task';
    el.dataset.id = t.id;
    el.dataset.lane = String(t.lane);
    el.dataset.col = String(t.col);
    if (t.nudge !== undefined) el.dataset.nudge = String(t.nudge);
    el.dataset.color = t.color;
    const chipsHtml = (t.chips ?? [])
      .map((c) => `<span class="chip${c === 'default' ? '' : ' ' + c}"></span>`)
      .join('');
    const approveHtml = t.id === interactiveTaskId
      ? `<button class="approve-btn" data-role="approve" hidden>APPROVE<span class="countdown"></span></button>`
      : '';
    el.innerHTML = `
      <div class="t1"><span class="glyph">${t.glyph}</span><span class="title">${t.title[lang]}</span><span class="status"></span>${approveHtml}</div>
      <div class="t2"><span class="driver">${t.driverLine}</span><span class="chips">${chipsHtml}</span></div>
    `;
    field.appendChild(el);
  });
}

function positionTasks(field: HTMLElement, tasks: Task[], laneCount: number) {
  const fieldW = field.clientWidth;
  const fieldH = field.clientHeight;
  const pad = 18;
  const cols = 4;
  const gap = 12;
  const taskW = Math.max(158, Math.min(198, (fieldW - pad * 2 - gap * (cols - 1)) / cols));
  const colStep = taskW + gap;
  const laneH = fieldH / laneCount;
  tasks.forEach((t) => {
    const el = field.querySelector<HTMLElement>(`[data-id="${t.id}"]`);
    if (!el) return;
    el.style.width = taskW + 'px';
    const h = el.offsetHeight || 56;
    const x = pad + t.col * colStep + (t.nudge ?? 0);
    const y = t.lane * laneH + (laneH - h) / 2;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });
}

function drawWires(roots: ReplayRoots, edges: Edge[]) {
  const { wires, field } = roots;
  wires.setAttribute('width', String(field.clientWidth));
  wires.setAttribute('height', String(field.clientHeight));
  wires.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  edges.forEach(([a, b, state]) => {
    const A = field.querySelector<HTMLElement>(`[data-id="${a}"]`);
    const B = field.querySelector<HTMLElement>(`[data-id="${b}"]`);
    if (!A || !B) return;
    const ax = A.offsetLeft + A.offsetWidth;
    const ay = A.offsetTop + A.offsetHeight / 2;
    const bx = B.offsetLeft;
    const by = B.offsetTop + B.offsetHeight / 2;
    let d: string;
    if (Math.abs(ay - by) < 4) d = `M ${ax} ${ay} L ${bx} ${by}`;
    else {
      const entry = 18;
      const mid = Math.max(ax + 16, bx - entry);
      d = `M ${ax} ${ay} L ${mid} ${ay} L ${mid} ${by} L ${bx} ${by}`;
    }
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', state);
    wires.appendChild(p);
  });
}

const LANE_PLURAL = { en: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`, zh: (n: number) => `${n} 个任务` };

function updateLaneStatuses(roots: ReplayRoots, sample: Sample, frame: Frame, lang: Lang) {
  sample.lanes.forEach((_, laneIdx) => {
    const meta = roots.rail.querySelector<HTMLElement>(`.lane-status[data-lane="${laneIdx}"]`);
    if (!meta) return;
    if (frame.laneStatus?.[laneIdx]) {
      meta.textContent = frame.laneStatus[laneIdx][lang];
      meta.style.color = '';
      return;
    }
    const ids = sample.tasks.filter((t) => t.lane === laneIdx).map((t) => t.id);
    let ok = 0, run = 0, queued = 0, blocked = 0;
    ids.forEach((id) => {
      const s = frame.tasks[id];
      if (s === 'ok') ok++;
      else if (s === 'running') run++;
      else if (s === 'queued') queued++;
      else if (s === 'blocked') blocked++;
    });
    const total = ids.length;
    const parts = [LANE_PLURAL[lang](total)];
    if (ok) parts.push(lang === 'zh' ? `${ok} 成功` : `${ok} ok`);
    if (run) parts.push(lang === 'zh' ? `${run} 运行` : `${run} run`);
    if (queued) parts.push(lang === 'zh' ? `${queued} 排队` : `${queued} queued`);
    if (blocked) parts.push(lang === 'zh' ? `${blocked} 待审批` : `${blocked} waiting`);
    meta.textContent = parts.join(' · ');
    if (blocked) meta.style.color = 'var(--warn)';
    else if (run) meta.style.color = 'var(--accent)';
    else if (ok && ok === total) meta.style.color = 'var(--green)';
    else meta.style.color = '';
    const cnt = roots.rail.querySelectorAll<HTMLElement>('.lane-row .cnt')[laneIdx];
    if (cnt) cnt.textContent = String(total);
  });
}

function applyFrame(roots: ReplayRoots, sample: Sample, frame: Frame, lang: Lang) {
  sample.tasks.forEach((t) => {
    const el = roots.field.querySelector<HTMLElement>(`[data-id="${t.id}"]`);
    if (!el) return;
    el.classList.remove('running', 'queued', 'blocked');
    const state = frame.tasks[t.id] ?? 'queued';
    if (state === 'running') el.classList.add('running');
    else if (state === 'queued') el.classList.add('queued');
    else if (state === 'blocked') el.classList.add('blocked');
    const statusEl = el.querySelector<HTMLElement>('.status');
    if (statusEl) {
      const txt = frame.statusText[t.id] ?? '';
      statusEl.textContent = txt;
      statusEl.className = 'status' + (state === 'ok' ? ' ok' : state === 'running' ? ' run' : state === 'blocked' ? ' warn' : '');
    }
    const btn = el.querySelector<HTMLElement>('[data-role="approve"]');
    if (btn) {
      const show = state === 'blocked' && sample.interactive?.taskId === t.id;
      btn.toggleAttribute('hidden', !show);
    }
  });
  updateLaneStatuses(roots, sample, frame, lang);
  drawWires(roots, frame.edges);
}

export function mount(roots: ReplayRoots, sample: Sample): Controller {
  const lang = currentLang();
  const interactiveTaskId = sample.interactive?.taskId ?? null;
  createLaneRail(roots.rail, sample.lanes, lang);
  createStrips(roots.field, sample.lanes.length);
  createTasks(roots.field, sample.tasks, lang, interactiveTaskId);
  positionTasks(roots.field, sample.tasks, sample.lanes.length);
  applyFrame(roots, sample, sample.frames[0], lang);

  let frameIdx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  const intervalMs = sample.frameIntervalMs ?? 2600;
  const autoApproveMs = sample.interactive?.autoApproveMs ?? 8000;

  function advance() {
    if (destroyed) return;
    frameIdx = (frameIdx + 1) % sample.frames.length;
    const f = sample.frames[frameIdx];
    applyFrame(roots, sample, f, currentLang());
    scheduleNext(f);
  }

  function scheduleNext(current: Frame) {
    clearTimer();
    if (current.blockUntilApprove) {
      startApproveCountdown();
      return;
    }
    timer = setTimeout(advance, intervalMs);
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const cd = roots.field.querySelector<HTMLElement>('[data-role="approve"] .countdown');
    if (cd) cd.textContent = '';
  }

  function startApproveCountdown() {
    const cd = roots.field.querySelector<HTMLElement>('[data-role="approve"] .countdown');
    let remaining = Math.ceil(autoApproveMs / 1000);
    if (cd) cd.textContent = ` · ${remaining}s`;
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (cd) cd.textContent = remaining > 0 ? ` · ${remaining}s` : '';
      if (remaining <= 0) {
        clearInterval(countdownTimer!);
        countdownTimer = null;
        advance();
      }
    }, 1000);
  }

  function resize() {
    positionTasks(roots.field, sample.tasks, sample.lanes.length);
    drawWires(roots, sample.frames[frameIdx].edges);
  }

  function onApplyLang() {
    const newLang = currentLang();
    sample.tasks.forEach((t) => {
      const el = roots.field.querySelector<HTMLElement>(`[data-id="${t.id}"] .title`);
      if (el) el.textContent = t.title[newLang];
    });
    sample.lanes.forEach((lane, i) => {
      const el = roots.rail.querySelectorAll<HTMLElement>('.lane-label')[i];
      if (el) el.textContent = lane.name[newLang];
    });
    applyFrame(roots, sample, sample.frames[frameIdx], newLang);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('tagma:apply', onApplyLang);
  scheduleNext(sample.frames[0]);

  return {
    sampleId: sample.id,
    pause() { clearTimer(); },
    start() { scheduleNext(sample.frames[frameIdx]); },
    reset() {
      clearTimer();
      frameIdx = 0;
      applyFrame(roots, sample, sample.frames[0], currentLang());
      scheduleNext(sample.frames[0]);
    },
    approve() {
      if (sample.frames[frameIdx].blockUntilApprove) advance();
    },
    destroy() {
      destroyed = true;
      clearTimer();
      window.removeEventListener('resize', resize);
      document.removeEventListener('tagma:apply', onApplyLang);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run astro check`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/replay.ts
git commit -m "add demo replay module with data-driven render and controller"
```

---

### Task 4: Rewire index.astro to use replay module (single sample; visual parity with current demo)

**Files:**
- Modify: `src/pages/index.astro` — remove hardcoded `.lane-rail` rows, hardcoded `.task` divs, and animation script; import and call `mount()`

- [ ] **Step 1: Strip hardcoded lane rows from `.lane-rail`**

Replace lines 105–124 (`<div class="lane-rail">` block) with:

```astro
        <div class="lane-rail" id="laneRail"></div>
```

- [ ] **Step 2: Strip hardcoded task elements and strips from `.lane-field`**

In `.lane-field` (currently lines 126–158), keep only the SVG and remove all `.task` divs and `.lane-strip` divs (replay.ts creates them):

```astro
        <div class="lane-field" id="field">
          <svg id="wires"></svg>
        </div>
```

- [ ] **Step 3: Replace the demo animation script block**

Replace the entire animation section of `<script>` in `index.astro` — from the `function positionTasks()` declaration (around line 666) through the closing `setInterval(...)` call (around line 806) — with the following imports + wiring. Keep all the non-demo code (download menu, os switcher, copy buttons, etc.) intact.

```ts
import { SAMPLES, DEFAULT_SAMPLE_ID } from '../lib/demo/samples';
import { mount, type Controller, type ReplayRoots } from '../lib/demo/replay';

function demoRoots(): ReplayRoots | null {
  const canvas = document.getElementById('canvas');
  const rail = document.getElementById('laneRail');
  const field = document.getElementById('field');
  const wires = document.getElementById('wires') as unknown as SVGSVGElement | null;
  if (!canvas || !rail || !field || !wires) return null;
  return { canvas, rail, field, wires };
}

let currentCtrl: Controller | null = null;

function switchSample(id: string) {
  const roots = demoRoots();
  if (!roots) return;
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (currentCtrl) currentCtrl.destroy();
  currentCtrl = mount(roots, sample);
}

window.addEventListener('load', () => switchSample(DEFAULT_SAMPLE_ID));
if (document.readyState === 'complete') switchSample(DEFAULT_SAMPLE_ID);
```

- [ ] **Step 4: Typecheck**

Run: `bun run astro check`
Expected: `0 errors`. If errors appear about unused imports/vars remaining from the old script, delete them.

- [ ] **Step 5: Visual verify**

Run: `bun run dev`
Open: `http://localhost:4321/`
Verify:
- Demo stage shows 3 lanes (Backend / Ops / Review), 6 tasks, wires drawn
- Animation loops through 3 frames, roughly every 2.6s
- Hover still highlights tasks
- Resize window → tasks reposition, wires redraw

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro
git commit -m "rewire homepage demo to use data-driven replay module"
```

---

### Task 5: Add Parallel Review sample

**Files:**
- Modify: `src/lib/demo/samples.ts`

- [ ] **Step 1: Add sample object above `export const SAMPLES`**

```ts
const parallelReview: Sample = {
  id: 'parallel-review',
  tabLabel: { en: 'Parallel Review', zh: '并行审查' },
  filename: '.tagma/review.yaml',
  yamlId: 'parallel-review',
  lanes: [
    { color: 'blue',   name: { en: 'Security',    zh: '安全' },     driver: 'claude-code · sonnet' },
    { color: 'teal',   name: { en: 'Performance', zh: '性能' },     driver: 'codex · gpt-5-codex' },
    { color: 'pink',   name: { en: 'Style',       zh: '风格' },     driver: 'opencode · big-pickle' },
    { color: 'orange', name: { en: 'Consolidate', zh: '汇总' },     driver: 'claude-code · opus' },
  ],
  tasks: [
    { id: 'sec',  lane: 0, col: 1, color: 'blue',   glyph: '◆',
      title: { en: 'Security review',     zh: '安全审查' },
      driverLine: 'claude-code · sonnet',    chips: ['r', 'default', 'default'] },
    { id: 'perf', lane: 1, col: 1, color: 'teal',   glyph: '◆',
      title: { en: 'Perf hotpaths',       zh: '性能热点' },
      driverLine: 'codex · gpt-5-codex',     chips: ['y', 'default', 'default'] },
    { id: 'sty',  lane: 2, col: 1, color: 'pink',   glyph: '◆',
      title: { en: 'Style & idioms',      zh: '风格与习惯' },
      driverLine: 'opencode · big-pickle',   chips: ['g', 'default'] },
    { id: 'sum',  lane: 3, col: 3, color: 'orange', glyph: '◆',
      title: { en: 'Consolidate findings', zh: '汇总发现' },
      driverLine: 'claude-code · opus',      chips: ['b', 'default'] },
  ],
  frames: [
    {
      tasks: { sec: 'queued', perf: 'queued', sty: 'queued', sum: 'queued' },
      statusText: { sec: '⌛ queued', perf: '⌛ queued', sty: '⌛ queued', sum: '⌛ queued' },
      edges: [['sec', 'sum', 'pending'], ['perf', 'sum', 'pending'], ['sty', 'sum', 'pending']],
    },
    {
      tasks: { sec: 'running', perf: 'running', sty: 'running', sum: 'queued' },
      statusText: { sec: '▶', perf: '▶', sty: '▶', sum: '⌛ queued' },
      edges: [['sec', 'sum', 'pending'], ['perf', 'sum', 'pending'], ['sty', 'sum', 'pending']],
    },
    {
      tasks: { sec: 'ok', perf: 'running', sty: 'ok', sum: 'queued' },
      statusText: { sec: '✓ 18.2s', perf: '▶', sty: '✓ 11.5s', sum: '⌛ queued' },
      edges: [['sec', 'sum', 'active'], ['perf', 'sum', 'pending'], ['sty', 'sum', 'active']],
    },
    {
      tasks: { sec: 'ok', perf: 'ok', sty: 'ok', sum: 'running' },
      statusText: { sec: '✓ 18.2s', perf: '✓ 24.7s', sty: '✓ 11.5s', sum: '▶' },
      edges: [['sec', 'sum', 'active'], ['perf', 'sum', 'active'], ['sty', 'sum', 'active']],
    },
  ],
};
```

- [ ] **Step 2: Add to SAMPLES array + change default**

Change:
```ts
export const SAMPLES: Sample[] = [smokeTest];
export const DEFAULT_SAMPLE_ID = 'smoke-test';
```
to:
```ts
export const SAMPLES: Sample[] = [parallelReview, smokeTest];
export const DEFAULT_SAMPLE_ID = 'parallel-review';
```

- [ ] **Step 3: Typecheck + visual verify**

Run: `bun run astro check` → `0 errors`
Run: `bun run dev` → default demo now shows 4 lanes (Security/Performance/Style/Consolidate). Animation cycles through 4 frames: all queued → all running → two done + consolidating → all done.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/samples.ts
git commit -m "add parallel-review demo sample and make it default"
```

---

### Task 6: Add Bug Triage sample

**Files:**
- Modify: `src/lib/demo/samples.ts`

- [ ] **Step 1: Add sample above SAMPLES export**

```ts
const bugTriage: Sample = {
  id: 'bug-triage',
  tabLabel: { en: 'Bug Triage', zh: '缺陷排查' },
  filename: '.tagma/triage.yaml',
  yamlId: 'bug-triage',
  lanes: [
    { color: 'green',  name: { en: 'Shell',    zh: 'Shell' },    driver: 'shell' },
    { color: 'pink',   name: { en: 'Diagnose', zh: '诊断' },     driver: 'claude-code · sonnet' },
    { color: 'orange', name: { en: 'Fix',      zh: '修复' },     driver: 'opencode · big-pickle' },
  ],
  tasks: [
    { id: 'repro',    lane: 0, col: 0, color: 'green',  glyph: '▶',
      title: { en: 'Reproduce failure',   zh: '复现问题' },
      driverLine: 'shell · bun test --bail 1' },
    { id: 'diag',     lane: 1, col: 1, color: 'pink',   glyph: '◆',
      title: { en: 'Diagnose root cause', zh: '定位根因' },
      driverLine: 'claude-code · sonnet',   chips: ['r', 'default', 'default'] },
    { id: 'fix',      lane: 2, col: 2, color: 'orange', glyph: '◆',
      title: { en: 'Patch the bug',       zh: '修复缺陷' },
      driverLine: 'opencode · big-pickle',  chips: ['g', 'default', 'y'] },
    { id: 'verify',   lane: 0, col: 3, color: 'green',  glyph: '▶',
      title: { en: 'Re-run test',         zh: '回归验证' },
      driverLine: 'shell · bun test' },
  ],
  frames: [
    { tasks: { repro: 'running', diag: 'queued', fix: 'queued', verify: 'queued' },
      statusText: { repro: '▶', diag: '⌛ queued', fix: '⌛ queued', verify: '⌛ queued' },
      edges: [['repro', 'diag', 'active'], ['diag', 'fix', 'pending'], ['fix', 'verify', 'pending']] },
    { tasks: { repro: 'ok', diag: 'running', fix: 'queued', verify: 'queued' },
      statusText: { repro: '✓ 1.2s · exit 1', diag: '▶', fix: '⌛ queued', verify: '⌛ queued' },
      edges: [['repro', 'diag', 'active'], ['diag', 'fix', 'pending'], ['fix', 'verify', 'pending']] },
    { tasks: { repro: 'ok', diag: 'ok', fix: 'running', verify: 'queued' },
      statusText: { repro: '✓ 1.2s · exit 1', diag: '✓ 14.8s', fix: '▶', verify: '⌛ queued' },
      edges: [['repro', 'diag', 'pending'], ['diag', 'fix', 'active'], ['fix', 'verify', 'pending']] },
    { tasks: { repro: 'ok', diag: 'ok', fix: 'ok', verify: 'running' },
      statusText: { repro: '✓ 1.2s · exit 1', diag: '✓ 14.8s', fix: '✓ 27.3s', verify: '▶' },
      edges: [['repro', 'diag', 'pending'], ['diag', 'fix', 'pending'], ['fix', 'verify', 'active']] },
    { tasks: { repro: 'ok', diag: 'ok', fix: 'ok', verify: 'ok' },
      statusText: { repro: '✓ 1.2s · exit 1', diag: '✓ 14.8s', fix: '✓ 27.3s', verify: '✓ 0.9s · exit 0' },
      edges: [['repro', 'diag', 'pending'], ['diag', 'fix', 'pending'], ['fix', 'verify', 'pending']] },
  ],
};
```

- [ ] **Step 2: Add to SAMPLES array**

Change:
```ts
export const SAMPLES: Sample[] = [parallelReview, smokeTest];
```
to:
```ts
export const SAMPLES: Sample[] = [parallelReview, bugTriage, smokeTest];
```

- [ ] **Step 3: Typecheck**

Run: `bun run astro check` → `0 errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/samples.ts
git commit -m "add bug-triage demo sample"
```

---

### Task 7: Add Migration Gate sample (with interactive approval)

**Files:**
- Modify: `src/lib/demo/samples.ts`

- [ ] **Step 1: Add sample above SAMPLES export**

```ts
const migrationGate: Sample = {
  id: 'migration-gate',
  tabLabel: { en: 'Migration Gate', zh: '审批迁移' },
  filename: '.tagma/migration.yaml',
  yamlId: 'migration-gate',
  interactive: { taskId: 'approve', kind: 'approve', autoApproveMs: 8000 },
  lanes: [
    { color: 'pink',   name: { en: 'Plan',     zh: '规划' }, driver: 'claude-code · opus' },
    { color: 'muted',  name: { en: 'Approval', zh: '审批' }, driver: 'manual trigger' },
    { color: 'orange', name: { en: 'Apply',    zh: '执行' }, driver: 'codex · workspace-write' },
  ],
  tasks: [
    { id: 'plan',    lane: 0, col: 0, color: 'pink',   glyph: '◆',
      title: { en: 'Plan migration',    zh: '规划迁移步骤' },
      driverLine: 'claude-code · opus',        chips: ['b', 'default'] },
    { id: 'approve', lane: 1, col: 1, color: 'muted',  glyph: '⚠',
      title: { en: 'Human approval',    zh: '人工审批' },
      driverLine: 'trigger · manual' },
    { id: 'apply',   lane: 2, col: 2, color: 'orange', glyph: '◆',
      title: { en: 'Apply migration',   zh: '应用迁移' },
      driverLine: 'codex · workspace-write',   chips: ['r', 'y', 'default'] },
    { id: 'verify',  lane: 2, col: 3, color: 'green',  glyph: '▶',
      title: { en: 'Verify rollback',   zh: '验证回滚' },
      driverLine: 'shell · migrate:verify' },
  ],
  frames: [
    { tasks: { plan: 'running', approve: 'queued', apply: 'queued', verify: 'queued' },
      statusText: { plan: '▶', approve: '⌛ queued', apply: '⌛ queued', verify: '⌛ queued' },
      edges: [['plan', 'approve', 'active'], ['approve', 'apply', 'pending'], ['apply', 'verify', 'pending']] },
    { tasks: { plan: 'ok', approve: 'blocked', apply: 'queued', verify: 'queued' },
      statusText: { plan: '✓ 22.1s', approve: '🖐 waiting', apply: '⌛ queued', verify: '⌛ queued' },
      edges: [['plan', 'approve', 'pending'], ['approve', 'apply', 'pending'], ['apply', 'verify', 'pending']],
      blockUntilApprove: true },
    { tasks: { plan: 'ok', approve: 'ok', apply: 'running', verify: 'queued' },
      statusText: { plan: '✓ 22.1s', approve: '✓ approved', apply: '▶', verify: '⌛ queued' },
      edges: [['plan', 'approve', 'pending'], ['approve', 'apply', 'active'], ['apply', 'verify', 'pending']] },
    { tasks: { plan: 'ok', approve: 'ok', apply: 'ok', verify: 'running' },
      statusText: { plan: '✓ 22.1s', approve: '✓ approved', apply: '✓ 41.0s', verify: '▶' },
      edges: [['plan', 'approve', 'pending'], ['approve', 'apply', 'pending'], ['apply', 'verify', 'active']] },
  ],
};
```

- [ ] **Step 2: Add to SAMPLES array**

```ts
export const SAMPLES: Sample[] = [parallelReview, bugTriage, migrationGate, smokeTest];
```

- [ ] **Step 3: Typecheck**

Run: `bun run astro check` → `0 errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/samples.ts
git commit -m "add migration-gate demo sample with interactive approval"
```

---

### Task 8: Add tab bar + CSS to stage chrome

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace the stage chrome block**

Find the existing `<div class="stage-chrome">…</div>` block (lines 95–102) and replace with:

```astro
      <div class="stage-chrome">
        <div class="sample-tabs" id="sampleTabs" role="tablist"></div>
        <span class="sp"></span>
        <span class="pill" data-role="reset">⟲ <span data-i18n="ed.reset">RESET</span></span>
        <span class="pill" data-role="yaml">&lt;/&gt; YAML</span>
        <span class="pill live"><span class="dot"></span>LIVE</span>
        <span class="pill run" data-role="run">▶ RUN</span>
      </div>
```

- [ ] **Step 2: Add CSS inside the `<style is:global>` block**

Append to the end of the style block (just before `</style>`):

```css
  .sample-tabs {
    display: flex; gap: 0; flex: 1; min-width: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    letter-spacing: 0.08em; text-transform: uppercase;
    overflow-x: auto; scrollbar-width: none;
  }
  .sample-tabs::-webkit-scrollbar { display: none; }
  .sample-tab {
    padding: 4px 12px; color: var(--fg-dim); cursor: pointer;
    border: 0; background: transparent;
    border-bottom: 2px solid transparent;
    white-space: nowrap; user-select: none;
    font: inherit; text-transform: inherit; letter-spacing: inherit;
    transition: color .12s, border-color .12s;
  }
  .sample-tab:hover { color: var(--fg); }
  .sample-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .stage-chrome .pill { cursor: pointer; }
  .stage-chrome .pill[data-role="yaml"].active { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  [data-theme="light"] .stage-chrome .pill[data-role="yaml"].active { color: var(--bg); }

  /* blocked state + approve button */
  .task.blocked { border-color: var(--warn); box-shadow: 0 0 0 1px var(--warn), 0 0 20px -8px var(--warn); }
  .task.blocked .glyph { color: var(--warn); }
  .task .t1 .status.warn { color: var(--warn); }
  .approve-btn {
    margin-left: 6px; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.08em;
    padding: 2px 8px; background: var(--accent); color: var(--accent-ink);
    border: 0; cursor: pointer; font-weight: 600;
  }
  [data-theme="light"] .approve-btn { color: #fff; }
  .approve-btn:hover { background: #ff8a3d; }
  .approve-btn .countdown { font-weight: 400; opacity: .75; }
```

- [ ] **Step 3: Visual verify**

Run: `bun run dev`
Verify:
- Stage chrome shows: empty tab slot (tabs built in next task), RESET / YAML / LIVE / RUN pills
- Page still animates the default Parallel Review sample (tabs not wired yet, but demo still works via `load` handler)

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "add tab bar markup and styles to demo stage chrome"
```

---

### Task 9: Wire tab rendering + switching

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add tab rendering function to the script**

Inside the demo-wiring section added in Task 4, add above `switchSample`:

```ts
function renderTabs(activeId: string) {
  const host = document.getElementById('sampleTabs');
  if (!host) return;
  const lang = (window as Window & { TAGMA_SHELL?: { get(): { lang: 'en' | 'zh' } } }).TAGMA_SHELL?.get().lang ?? 'en';
  host.innerHTML = '';
  SAMPLES.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sample-tab' + (s.id === activeId ? ' active' : '');
    btn.dataset.sampleId = s.id;
    btn.setAttribute('role', 'tab');
    btn.textContent = s.tabLabel[lang];
    host.appendChild(btn);
  });
}
```

- [ ] **Step 2: Update `switchSample` to also re-render tabs**

```ts
function switchSample(id: string) {
  const roots = demoRoots();
  if (!roots) return;
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (currentCtrl) currentCtrl.destroy();
  currentCtrl = mount(roots, sample);
  renderTabs(sample.id);
}
```

- [ ] **Step 3: Wire tab click delegation + i18n re-render**

After the `window.addEventListener('load', …)` line, add:

```ts
document.getElementById('sampleTabs')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.sample-tab');
  if (!btn || !btn.dataset.sampleId) return;
  if (currentCtrl?.sampleId === btn.dataset.sampleId) return;
  switchSample(btn.dataset.sampleId);
});

document.addEventListener('tagma:apply', () => {
  if (currentCtrl) renderTabs(currentCtrl.sampleId);
});
```

- [ ] **Step 4: Typecheck + visual verify**

Run: `bun run astro check` → `0 errors`
Run: `bun run dev`
Verify:
- 4 tabs render: Parallel Review · Bug Triage · Migration Gate · Smoke Test
- Default active: Parallel Review
- Click each tab → lane rail + tasks + wires rebuild for that sample; animation starts from frame 0
- Toggle language (EN/中 button in TWEAKS panel bottom-right) → tab labels switch
- No flicker on switch

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "wire sample tab rendering and switching"
```

---

### Task 10: Wire Approve button + event

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Delegate approve clicks to the controller**

Inside the script section, add after the tab-click delegation:

```ts
document.getElementById('field')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-role="approve"]');
  if (!btn) return;
  currentCtrl?.approve();
});
```

- [ ] **Step 2: Visual verify**

Run: `bun run dev`
- Click "Migration Gate" tab
- Wait for frame 2 (~2.6s after mount): `approve` task should show blocked (⚠ glyph, warn-colored border, "🖐 waiting" status)
- An orange "APPROVE · 8s" button appears; countdown ticks 7s, 6s, …
- Click APPROVE immediately → animation advances to frame 3 (apply running)
- Reload, let it auto-timeout → animation advances after 8s without click

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "wire approve button click to demo controller"
```

---

### Task 11: Wire RUN and RESET pills

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add pill click delegation**

Inside the script, append after the approve handler:

```ts
document.querySelector('.stage-chrome')?.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest<HTMLElement>('.pill[data-role]');
  if (!pill || !currentCtrl) return;
  const role = pill.dataset.role;
  if (role === 'run') currentCtrl.reset();
  else if (role === 'reset') { currentCtrl.reset(); currentCtrl.pause(); }
});
```

**Note:** this delegates only for pills with `data-role="run"` or `data-role="reset"`. The YAML pill has `data-role="yaml"` but is handled by a separate listener in Task 13. Order doesn't matter since each handler filters on its own role.

- [ ] **Step 2: Visual verify**

Run: `bun run dev`
- Click RUN on any sample → animation restarts from frame 0 and loops
- Click RESET → animation stops at frame 0 (lane statuses + edges visible but static)
- Click RUN again → resumes looping

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "wire run and reset pills in demo stage chrome"
```

---

### Task 12: Build DemoYaml.astro component with pre-rendered Shiki blocks

**Files:**
- Create: `src/components/DemoYaml.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create the component using Astro's built-in `<Code>`**

```astro
---
// src/components/DemoYaml.astro
import { Code } from 'astro:components';

const parallelReviewYaml = `pipeline:
  name: pr-review
  driver: claude-code
  plugins:
    - "@tagma/driver-claude-code"
    - "@tagma/driver-codex"
  tracks:
    - id: security
      name: Security
      tasks:
        - id: review
          prompt: "Review this PR for auth, injection, and secret-handling issues."

    - id: performance
      name: Performance
      driver: codex
      tasks:
        - id: hotpaths
          prompt: "Identify perf regressions in the PR diff."

    - id: style
      name: Style
      driver: opencode
      tasks:
        - id: idioms
          prompt: "Flag style and idiom issues."

    - id: consolidate
      name: Consolidate
      tasks:
        - id: summary
          prompt: "Merge the three reviews into one report."
          depends_on: [security.review, performance.hotpaths, style.idioms]
          continue_from: security.review
`;

const bugTriageYaml = `pipeline:
  name: bug-triage
  driver: claude-code
  plugins:
    - "@tagma/driver-claude-code"
  tracks:
    - id: main
      name: Triage
      tasks:
        - id: repro
          command: "bun test --bail 1"

        - id: diagnose
          prompt: "Look at the failing test output and explain the root cause."
          depends_on: [repro]
          continue_from: repro

        - id: fix
          driver: opencode
          prompt: "Patch the bug identified in diagnose."
          permissions: { read: true, write: true, execute: false }
          depends_on: [diagnose]
          continue_from: diagnose

        - id: verify
          command: "bun test"
          depends_on: [fix]
          completion: { type: exit_code, expect: 0 }
`;

const migrationGateYaml = `pipeline:
  name: migration
  driver: claude-code
  plugins:
    - "@tagma/driver-claude-code"
    - "@tagma/driver-codex"
  tracks:
    - id: plan
      name: Plan
      tasks:
        - id: outline
          prompt: "Outline the migration steps and rollback plan."

    - id: gate
      name: Approval
      tasks:
        - id: approve
          trigger: { type: manual }
          depends_on: [plan.outline]

    - id: apply
      name: Apply
      driver: codex
      permissions: { read: true, write: true, execute: true }
      tasks:
        - id: run
          prompt: "Apply the migration from plan.outline."
          depends_on: [gate.approve]
          continue_from: plan.outline

        - id: verify
          command: "./scripts/migrate-verify.sh"
          depends_on: [run]
          completion: { type: exit_code, expect: 0 }
`;

const smokeTestYaml = `pipeline:
  name: full-feature-smoke-test
  driver: opencode
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
        - id: review
          prompt: "Self-review the diff."
          depends_on: [implement]
          continue_from: implement

    - id: ops
      name: Ops
      tasks:
        - id: prep
          command: "mkdir -p .signals"
        - id: wait
          command: "while [ ! -f .signals/done ]; do sleep 0.1; done"
          depends_on: [prep]

    - id: review
      name: Review
      driver: claude-code
      tasks:
        - id: summarize
          prompt: "Summarize the backend run for the release notes."
          depends_on: [backend.review, ops.wait]
          continue_from: backend.review
`;

const samples = [
  { id: 'parallel-review', file: '.tagma/review.yaml',    code: parallelReviewYaml },
  { id: 'bug-triage',      file: '.tagma/triage.yaml',    code: bugTriageYaml },
  { id: 'migration-gate',  file: '.tagma/migration.yaml', code: migrationGateYaml },
  { id: 'smoke-test',      file: '.tagma/test-pipeline.yaml', code: smokeTestYaml },
];
---

<div class="demo-yaml" id="demoYaml" hidden>
  {samples.map((s) => (
    <div class="demo-yaml-block" data-yaml-id={s.id} hidden>
      <div class="demo-yaml-header">{s.file}</div>
      <div class="demo-yaml-body">
        <Code code={s.code} lang="yaml" theme="github-dark" />
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Import and place in index.astro**

At the top of `src/pages/index.astro`, add to imports (alongside the existing `BaseLayout` and `site` imports):
```astro
import DemoYaml from '../components/DemoYaml.astro';
```

Inside `.stage`, after the closing `</div>` of `.canvas` (but still inside `.stage`), add:
```astro
<DemoYaml />
```

Final structure:
```
<div class="stage">
  <div class="stage-chrome">…</div>
  <div class="canvas" id="canvas">…</div>
  <DemoYaml />
</div>
```

- [ ] **Step 3: Add CSS for YAML view**

Append to the `<style>` block:

```css
  .demo-yaml { background: var(--bg-1); }
  .demo-yaml[hidden] { display: none !important; }
  .demo-yaml-block[hidden] { display: none !important; }
  .demo-yaml-header {
    padding: 8px 14px; border-bottom: 1px solid var(--line);
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--fg-dim); background: var(--bg);
  }
  .demo-yaml-body { max-height: 420px; overflow: auto; padding: 16px 20px; font-size: 12.5px; }
  .demo-yaml-body pre { margin: 0; background: transparent !important; }
  .demo-yaml-body code { font-family: 'JetBrains Mono', monospace; }
```

- [ ] **Step 4: Typecheck + visual verify (YAML hidden by default)**

Run: `bun run astro check` → `0 errors`
Run: `bun run dev`
Verify: page looks identical to before — `.demo-yaml` is hidden, flowchart still active.

- [ ] **Step 5: Commit**

```bash
git add src/components/DemoYaml.astro src/pages/index.astro
git commit -m "add pre-rendered yaml blocks component for demo samples"
```

---

### Task 13: Wire YAML view toggle

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add YAML toggle state + handler to the script**

In the script block, after the RUN/RESET delegation:

```ts
let yamlOpen = false;
function applyYamlView(sampleId: string) {
  const host = document.getElementById('demoYaml');
  const canvas = document.getElementById('canvas');
  const pill = document.querySelector<HTMLElement>('.stage-chrome .pill[data-role="yaml"]');
  if (!host || !canvas || !pill) return;
  pill.classList.toggle('active', yamlOpen);
  host.toggleAttribute('hidden', !yamlOpen);
  canvas.toggleAttribute('hidden', yamlOpen);
  host.querySelectorAll<HTMLElement>('.demo-yaml-block').forEach((b) => {
    b.toggleAttribute('hidden', b.dataset.yamlId !== sampleId);
  });
}

document.querySelector('.stage-chrome')?.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest<HTMLElement>('.pill[data-role="yaml"]');
  if (!pill || !currentCtrl) return;
  yamlOpen = !yamlOpen;
  applyYamlView(currentCtrl.sampleId);
});
```

**Note:** this is a SEPARATE listener from the RUN/RESET one. It filters on `data-role="yaml"` specifically, so they coexist without conflict.

- [ ] **Step 2: Re-apply YAML view state on sample switch**

Update `switchSample` to preserve the YAML state:
```ts
function switchSample(id: string) {
  const roots = demoRoots();
  if (!roots) return;
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (currentCtrl) currentCtrl.destroy();
  currentCtrl = mount(roots, sample);
  renderTabs(sample.id);
  applyYamlView(sample.id);
}
```

- [ ] **Step 3: Hide canvas when YAML open (CSS guard)**

Add to style block:
```css
  .canvas[hidden] { display: none !important; }
```

- [ ] **Step 4: Visual verify**

Run: `bun run dev`
- Click `</>YAML` pill → flowchart hides, syntax-highlighted YAML appears for the active sample (dark theme, monospace), with filename header on top
- Switch tabs while YAML is open → YAML content swaps to the new sample's YAML
- Click `</>YAML` again → flowchart returns; animation resumes from where it was (not reset)
- Scroll inside YAML works for long samples

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "wire yaml view toggle in demo stage chrome"
```

---

### Task 14: Cleanup + i18n for RESET + final verify

**Files:**
- Modify: `src/pages/index.astro`
- Possibly modify: i18n source file (to be located in step 2)

- [ ] **Step 1: Hunt for leftover dead code from the old demo**

Search `src/pages/index.astro` for any remaining references to symbols that belonged to the old inline demo:
- `LANE_TASKS`
- `BASE` (the old status-text constants table)
- `cycle` (the old frame array)
- `ANIM_INTERVAL_MS` (now lives in replay.ts as `intervalMs`)
- `currentEdges` declared at file scope
- The old inline `applyFrame`, `drawWires`, `positionTasks`, `updateLaneStatuses` functions

Any leftover declarations: delete them. The replay module owns all of this now.

- [ ] **Step 2: Verify i18n keys for new chrome strings**

Check whether `ed.reset` exists in the i18n dictionary:

```bash
grep -rn "ed\.history\|ed\.reset" src/
```

If `ed.history` is found in an i18n source file (likely `src/i18n/*.ts` or inline in `BaseLayout.astro`), add a sibling `ed.reset` entry:
- en: `RESET`
- zh: `重置`

If no i18n source file is found (i.e. `ed.history` only appears in the old index.astro markup — which you already removed in Task 8), then i18n for this key is a no-op. In that case, leave the `data-i18n="ed.reset"` attribute in place: harmless if nothing reads it, and ready for future i18n.

- [ ] **Step 3: Full typecheck + build**

```bash
bun run astro check
bun run build
```
Both should exit `0`. Fix any strict-mode errors (likely around `window.TAGMA_SHELL` typing — reuse the existing `Window & { TAGMA_SHELL?: … }` pattern already established).

- [ ] **Step 4: End-to-end visual pass**

Run `bun run dev` and walk through each sample:

1. **Parallel Review (default)**
   - 4 lanes, 4 tasks, fan-in wires all connect to `sum`
   - Frames: all queued → all running → 2 done + consolidating → all done
   - Click RUN → restarts from frame 0
2. **Bug Triage**
   - 3 lanes, 4 tasks, linear progression with shell→AI→AI→shell alternation
   - Status text shows real-looking command output (`exit 1`, `exit 0`)
3. **Migration Gate**
   - 3 lanes, 4 tasks
   - Frame 2 blocks: ⚠ glyph, warn border, "🖐 waiting" status, APPROVE button with live countdown
   - Clicking APPROVE advances immediately
   - Letting countdown finish advances automatically at ~8s
4. **Smoke Test**
   - Matches original demo (baseline regression check)
5. **YAML toggle** on each sample — renders correct YAML with filename header
6. **Language toggle** (EN/中 in TWEAKS panel) — tab labels, task titles, lane names all switch
7. **Resize** browser — tasks reposition, wires redraw correctly on all samples
8. **Mobile (< 960px)** — tabs scroll horizontally without overflow

- [ ] **Step 5: Final commit**

```bash
git add src/pages/index.astro
git commit -m "finalize interactive demo samples with i18n and cleanup"
```

---

## Spec coverage self-check

| Spec requirement | Task(s) |
|---|---|
| Goal #1: switch between 4 samples via tabs | 8, 9 |
| Goal #2: toggle flowchart vs YAML | 12, 13 |
| Goal #3: RUN replays from frame 0 | 11 |
| Goal #4: Approve button on Sample #3 | 7, 10 |
| 4 samples approved: Parallel Review, Bug Triage, Migration Gate, Smoke Test | 2, 5, 6, 7 |
| Default active: Parallel Review | 5 |
| Data-driven frame replay module split | 1, 2, 3 |
| `blockUntilApprove` frame field | 1, 7, 10 (replay.ts in Task 3 handles it) |
| Stage chrome: tabs + RESET + YAML + LIVE + RUN | 8, 11, 13 |
| Drop crumb, show filename in YAML header | 8, 12 |
| 8s auto-approve fallback with countdown | 3 (in replay.ts), 10 |
| i18n tabs + titles + lane names | 3 (onApplyLang), 9, 14 |
| Resize still works | 3, 14 |
| No `< 960px` regression | 8 (scroll-x), 14 |

All spec requirements have at least one task. No placeholders found. Type names (`Sample`, `Frame`, `Controller`, `Edge`, `Lane`, `Task`) are consistent across Tasks 1, 3, 4, 5, 6, 7. Controller method names (`pause` / `start` / `reset` / `approve` / `destroy`) are defined in Task 3 and consistently called in Tasks 10, 11, 13.
