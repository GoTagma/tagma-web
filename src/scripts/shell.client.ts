// Client-side shell runtime. Ported from shell.js.
// Mounted by BaseLayout.astro on every page.
import { I18N, type Lang } from '../i18n';

type Theme = 'dark' | 'light';
interface Tweaks { theme: Theme; lang: Lang }

const KEY = 'tagma_tweaks';

// Site config values injected by BaseLayout.astro via <script type="application/json" id="tagma-cfg">
interface SiteCfg { v: string; ch: string; size: number; agents: string[] }
let cfg: SiteCfg = { v: '', ch: '', size: 0, agents: [] };
try {
  const el = document.getElementById('tagma-cfg');
  if (el?.textContent) cfg = JSON.parse(el.textContent);
} catch { /* ignore */ }

function formatAgents(agents: string[], lang: Lang): string {
  if (agents.length === 0) return '';
  if (agents.length === 1) return `<b>${agents[0]}</b>`;
  const and = lang === 'zh' ? '以及' : 'and';
  if (agents.length === 2) return `<b>${agents[0]}</b> ${and} <b>${agents[1]}</b>`;
  const head = agents.slice(0, -1).map((a) => `<b>${a}</b>`).join(', ');
  return `${head} ${and} <b>${agents[agents.length - 1]}</b>`;
}

function subst(text: string, lang: Lang): string {
  return text
    .replace(/\{v\}/g, cfg.v)
    .replace(/\{ch\}/g, cfg.ch)
    .replace(/\{size\}/g, String(cfg.size))
    .replace(/\{agents\}/g, formatAgents(cfg.agents, lang));
}

function readTweaks(): Tweaks {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { theme: 'dark', lang: 'en', ...saved };
  } catch {
    return { theme: 'dark', lang: 'en' };
  }
}

const TWEAKS: Tweaks = readTweaks();

function applyLang(): void {
  const lang = TWEAKS.lang;
  const dict = I18N[lang] || I18N.en;
  const fallback = I18N.en;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n;
    if (!k) return;
    const v = dict[k] ?? fallback[k];
    if (v != null) el.innerHTML = subst(v, lang);
  });
  document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
}

function apply(): void {
  document.body.dataset.theme = TWEAKS.theme;
  document.querySelectorAll<HTMLElement>('#lang .opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === TWEAKS.lang);
  });
  const trigLabel = document.querySelector<HTMLElement>('#lang .trigger .label');
  if (trigLabel) trigLabel.textContent = TWEAKS.lang === 'zh' ? '中' : 'EN';
  applyLang();
  document.dispatchEvent(new CustomEvent('tagma:apply', { detail: { ...TWEAKS } }));
}

function persist(patch: Partial<Tweaks>): void {
  Object.assign(TWEAKS, patch);
  try { localStorage.setItem(KEY, JSON.stringify(TWEAKS)); } catch { /* ignore */ }
  apply();
}

function wire(): void {
  const themeBtn = document.getElementById('themeBtn');
  themeBtn?.addEventListener('click', () => {
    persist({ theme: TWEAKS.theme === 'dark' ? 'light' : 'dark' });
  });

  const langMenu = document.getElementById('lang');
  if (langMenu) {
    langMenu.querySelector('.trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('open');
    });
    langMenu.querySelectorAll<HTMLButtonElement>('.opt').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('disabled') || !btn.dataset.v) return;
        persist({ lang: btn.dataset.v as Lang });
        langMenu.classList.remove('open');
      });
    });
    document.addEventListener('click', () => langMenu.classList.remove('open'));
  }
  apply();
}

declare global {
  interface Window {
    TAGMA_SHELL?: { persist: typeof persist; get: () => Tweaks; apply: typeof apply };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}

window.TAGMA_SHELL = { persist, get: () => ({ ...TWEAKS }), apply };
