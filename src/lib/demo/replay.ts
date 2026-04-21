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
