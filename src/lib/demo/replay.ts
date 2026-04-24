// src/lib/demo/replay.ts
import type { Sample, Task, Lane, Frame, Edge } from './types';

export interface ReplayRoots {
  canvas: HTMLElement;      // .canvas
  rail: HTMLElement;        // .lane-rail
  field: HTMLElement;       // .lane-field — outer, clips, hosts lane strips, captures pan
  content: HTMLElement;     // .field-content — inner, translates for pan, hosts wires + tasks
  wires: SVGSVGElement;     // #wires (child of content)
  minimap?: HTMLElement;    // .minimap-i (optional — per-sample minimap contents)
}

// Horizontal pan margin — each side of the "world" extends this fraction of
// the field width beyond the visible viewport. Controls both the maximum pan
// range and the minimap's task-strip inset.
const PAN_MARGIN = 0.25;

export interface MountOptions {
  onStateChange?: (running: boolean) => void;
  startFrame?: number;    // resume from this frame (default 0)
  autoStart?: boolean;    // start autoplaying after mount (default true)
}

export interface Controller {
  sampleId: string;
  pause(): void;
  start(): void;
  reset(): void;
  destroy(): void;
  approve(): void;
  isRunning(): boolean;
  getFrameIdx(): number;
  // Force a re-layout of tasks + wires + minimap from current DOM sizes.
  // Needed when the canvas was hidden (display: none → clientWidth == 0)
  // during mount and has just become visible again.
  relayout(): void;
}

type Lang = 'en' | 'zh';

function currentLang(): Lang {
  const w = window as Window & { TAGMA_SHELL?: { get(): { lang: Lang } } };
  return w.TAGMA_SHELL?.get().lang ?? 'en';
}

// Map lane/task color tokens to CSS variables. `orange` and `muted` are
// aliases that don't have a `--orange` / `--muted` var defined, so render
// them from the right token instead of letting them fall through to black.
const COLOR_VAR: Record<string, string> = {
  teal:   'var(--teal)',
  green:  'var(--green)',
  orange: 'var(--accent)',
  pink:   'var(--pink)',
  blue:   'var(--blue)',
  muted:  'var(--fg-muted)',
};
function colorVar(name: string): string {
  return COLOR_VAR[name] ?? 'var(--fg-muted)';
}

function createLaneRail(rail: HTMLElement, lanes: Lane[], lang: Lang) {
  rail.innerHTML = '';
  lanes.forEach((lane, idx) => {
    const row = document.createElement('div');
    row.className = 'lane-row';
    row.dataset.lane = String(idx);
    row.innerHTML = `
      <div class="lane-name"><span class="swatch" style="background:${colorVar(lane.color)}"></span><span class="lane-label">${lane.name[lang]}</span></div>
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

function createTasks(content: HTMLElement, tasks: Task[], lang: Lang, interactiveTaskId: string | null) {
  content.querySelectorAll('.task').forEach((n) => n.remove());
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
    content.appendChild(el);
  });
}

function positionTasks(content: HTMLElement, tasks: Task[], laneCount: number) {
  const fieldW = content.clientWidth;
  const fieldH = content.clientHeight;
  const narrow = fieldW < 360;
  const pad = narrow ? 10 : 18;
  const cols = 4;
  const gap = narrow ? 8 : 12;
  const minW = narrow ? 128 : 158;
  const taskW = Math.max(minW, Math.min(198, (fieldW - pad * 2 - gap * (cols - 1)) / cols));
  const colStep = taskW + gap;
  const laneH = fieldH / laneCount;
  tasks.forEach((t) => {
    const el = content.querySelector<HTMLElement>(`[data-id="${t.id}"]`);
    if (!el) return;
    el.style.width = taskW + 'px';
    const h = el.offsetHeight || 56;
    const x = pad + t.col * colStep + (t.nudge ?? 0);
    const y = t.lane * laneH + (laneH - h) / 2;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });
}

// Cubic bezier wire, mirroring apps/editor BoardCanvas.stepPath(): a smooth
// horizontal-handle curve that tightens when start/end are close.
function bezierPath(ax: number, ay: number, bx: number, by: number): string {
  const c = Math.max(40, Math.abs(bx - ax) * 0.5);
  return `M ${ax} ${ay} C ${ax + c} ${ay}, ${bx - c} ${by}, ${bx} ${by}`;
}

function drawWires(roots: ReplayRoots, edges: Edge[]) {
  const { wires, content } = roots;
  wires.setAttribute('width', String(content.clientWidth));
  wires.setAttribute('height', String(content.clientHeight));
  wires.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  edges.forEach(([a, b, state]) => {
    const A = content.querySelector<HTMLElement>(`[data-id="${a}"]`);
    const B = content.querySelector<HTMLElement>(`[data-id="${b}"]`);
    if (!A || !B) return;
    const ax = A.offsetLeft + A.offsetWidth;
    const ay = A.offsetTop + A.offsetHeight / 2;
    const bx = B.offsetLeft;
    const by = B.offsetTop + B.offsetHeight / 2;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', bezierPath(ax, ay, bx, by));
    p.setAttribute('class', state);
    wires.appendChild(p);
  });
}

function renderMinimap(mm: HTMLElement, sample: Sample) {
  mm.innerHTML = '';
  const laneCount = sample.lanes.length;
  for (let i = 1; i < laneCount; i++) {
    const line = document.createElement('div');
    line.className = 'mm-lane';
    line.style.top = `${(i / laneCount) * 100}%`;
    mm.appendChild(line);
  }
  // inner track stripes: subtle tint per lane color so a 3-lane and
  // 4-lane pipeline look visibly different in the minimap.
  sample.lanes.forEach((lane, i) => {
    const stripe = document.createElement('div');
    stripe.className = 'mm-stripe';
    stripe.style.top = `${(i / laneCount) * 100}%`;
    stripe.style.height = `${(1 / laneCount) * 100}%`;
    stripe.style.background = `color-mix(in srgb, ${colorVar(lane.color)} 10%, transparent)`;
    mm.appendChild(stripe);
  });
  // one placeholder per task — concrete position set by updateMinimapPositions.
  sample.tasks.forEach((t) => {
    const b = document.createElement('div');
    b.className = 'mm-block';
    b.dataset.id = t.id;
    b.style.background = colorVar(t.color);
    mm.appendChild(b);
  });
  const view = document.createElement('div');
  view.className = 'mm-view';
  mm.appendChild(view);
}

// Drive minimap block positions from the real DOM positions of the tasks, and
// paint the viewport rectangle from the current pan offset. The "world" is a
// virtual strip `1 + 2*PAN_MARGIN` times the field width, so pan range stays
// a visible subset of the minimap.
const WORLD_RATIO = 1 + 2 * PAN_MARGIN;
function updateMinimapPositions(mm: HTMLElement, content: HTMLElement, panX: number) {
  const fw = content.clientWidth;
  const fh = content.clientHeight;
  if (fw === 0 || fh === 0) return;
  mm.querySelectorAll<HTMLElement>('.mm-block').forEach((b) => {
    const id = b.dataset.id;
    if (!id) return;
    const task = content.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!task) return;
    const xf = (task.offsetLeft / fw + PAN_MARGIN) / WORLD_RATIO;
    const wf = (task.offsetWidth / fw) / WORLD_RATIO;
    b.style.left = `${xf * 100}%`;
    b.style.width = `${wf * 100}%`;
    b.style.top = `${(task.offsetTop / fh) * 100}%`;
    b.style.height = `${Math.max(4, (task.offsetHeight / fh) * 100)}%`;
  });
  const view = mm.querySelector<HTMLElement>('.mm-view');
  if (view) {
    const vwf = 1 / WORLD_RATIO;
    const vxf = Math.max(0, Math.min(1 - vwf, (PAN_MARGIN - panX / fw) / WORLD_RATIO));
    view.style.left = `${vxf * 100}%`;
    view.style.width = `${vwf * 100}%`;
    view.style.right = 'auto';
    view.style.top = '0';
    view.style.bottom = '0';
  }
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
    const el = roots.content.querySelector<HTMLElement>(`[data-id="${t.id}"]`);
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

export function mount(roots: ReplayRoots, sample: Sample, opts: MountOptions = {}): Controller {
  const lang = currentLang();
  const interactiveTaskId = sample.interactive?.taskId ?? null;
  const startFrame = Math.min(Math.max(0, opts.startFrame ?? 0), sample.frames.length - 1);
  let panX = 0;
  roots.content.style.transform = 'translateX(0px)';
  createLaneRail(roots.rail, sample.lanes, lang);
  createStrips(roots.field, sample.lanes.length);
  createTasks(roots.content, sample.tasks, lang, interactiveTaskId);
  positionTasks(roots.content, sample.tasks, sample.lanes.length);
  applyFrame(roots, sample, sample.frames[startFrame], lang);
  if (roots.minimap) {
    renderMinimap(roots.minimap, sample);
    updateMinimapPositions(roots.minimap, roots.content, panX);
  }

  let frameIdx = startFrame;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  let running = false;
  const intervalMs = sample.frameIntervalMs ?? 2600;
  const autoApproveMs = sample.interactive?.autoApproveMs ?? 8000;

  function setRunning(r: boolean, force = false) {
    if (!force && running === r) return;
    running = r;
    opts.onStateChange?.(running);
  }

  function advance() {
    if (destroyed) return;
    frameIdx = (frameIdx + 1) % sample.frames.length;
    const f = sample.frames[frameIdx];
    applyFrame(roots, sample, f, currentLang());
    scheduleNext(f);
  }

  function scheduleNext(current: Frame) {
    clearTimer();
    setRunning(true);
    if (current.blockUntilApprove) {
      startApproveCountdown();
      return;
    }
    timer = setTimeout(advance, intervalMs);
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const cd = roots.content.querySelector<HTMLElement>('[data-role="approve"] .countdown');
    if (cd) cd.textContent = '';
  }

  function startApproveCountdown() {
    const cd = roots.content.querySelector<HTMLElement>('[data-role="approve"] .countdown');
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
    positionTasks(roots.content, sample.tasks, sample.lanes.length);
    clampPan();
    drawWires(roots, sample.frames[frameIdx].edges);
    if (roots.minimap) updateMinimapPositions(roots.minimap, roots.content, panX);
  }

  function clampPan() {
    const range = roots.content.clientWidth * PAN_MARGIN;
    panX = Math.max(-range, Math.min(range, panX));
    roots.content.style.transform = `translateX(${panX}px)`;
  }

  // ── Drag ─────────────────────────────────────────────────────────────
  // Two gestures share the same pointer pipeline:
  //   • grab a `.task`  → horizontal task-drag (stays in its lane row)
  //   • grab background → pan the canvas via a translateX on .field-content
  // Wires + minimap are recomputed on every pointer tick in both modes.
  type Mode = 'task' | 'pan' | null;
  let mode: Mode = null;
  let dragging: HTMLElement | null = null;
  let dragDx = 0;
  let panStart = 0;
  let panStartClientX = 0;

  function onDragStart(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-role="approve"]')) return;
    const el = target.closest<HTMLElement>('.task');
    if (el && roots.content.contains(el)) {
      mode = 'task';
      dragging = el;
      const rect = el.getBoundingClientRect();
      dragDx = e.clientX - rect.left;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else if (roots.field.contains(target)) {
      mode = 'pan';
      panStart = panX;
      panStartClientX = e.clientX;
      roots.field.classList.add('panning');
      try { roots.field.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else {
      return;
    }
    e.preventDefault();
  }
  function onDragMove(e: PointerEvent) {
    if (mode === 'task' && dragging) {
      // Horizontal-only task drag — never leaves its lane row.
      const fr = roots.content.getBoundingClientRect();
      const fw = roots.content.clientWidth;
      const w = dragging.offsetWidth;
      let x = e.clientX - fr.left - dragDx;
      x = Math.max(0, Math.min(fw - w, x));
      dragging.style.left = `${x}px`;
      drawWires(roots, sample.frames[frameIdx].edges);
      if (roots.minimap) updateMinimapPositions(roots.minimap, roots.content, panX);
    } else if (mode === 'pan') {
      panX = panStart + (e.clientX - panStartClientX);
      clampPan();
      if (roots.minimap) updateMinimapPositions(roots.minimap, roots.content, panX);
    }
  }
  function onDragEnd(e: PointerEvent) {
    if (mode === 'task' && dragging) {
      dragging.classList.remove('dragging');
      try { dragging.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragging = null;
    } else if (mode === 'pan') {
      roots.field.classList.remove('panning');
      try { roots.field.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    mode = null;
  }
  roots.field.addEventListener('pointerdown', onDragStart);
  roots.field.addEventListener('pointermove', onDragMove);
  roots.field.addEventListener('pointerup', onDragEnd);
  roots.field.addEventListener('pointercancel', onDragEnd);

  function onApplyLang() {
    const newLang = currentLang();
    sample.tasks.forEach((t) => {
      const el = roots.content.querySelector<HTMLElement>(`[data-id="${t.id}"] .title`);
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
  if (opts.autoStart === false) setRunning(false, true);
  else scheduleNext(sample.frames[frameIdx]);

  return {
    sampleId: sample.id,
    pause() { clearTimer(); setRunning(false); },
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
    isRunning() { return running; },
    getFrameIdx() { return frameIdx; },
    relayout() { resize(); },
    destroy() {
      destroyed = true;
      clearTimer();
      setRunning(false);
      window.removeEventListener('resize', resize);
      document.removeEventListener('tagma:apply', onApplyLang);
      roots.field.removeEventListener('pointerdown', onDragStart);
      roots.field.removeEventListener('pointermove', onDragMove);
      roots.field.removeEventListener('pointerup', onDragEnd);
      roots.field.removeEventListener('pointercancel', onDragEnd);
    },
  };
}
