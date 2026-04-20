// Client-side shell runtime. Ported from shell.js.
// Mounted by BaseLayout.astro on every page.
import { I18N, type Lang } from '../i18n';

type Theme = 'dark' | 'light';
interface Tweaks { theme: Theme; lang: Lang }

const KEY = 'tagma_tweaks';

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
  const dict = I18N[TWEAKS.lang] || I18N.en;
  const fallback = I18N.en;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n;
    if (!k) return;
    const v = dict[k] ?? fallback[k];
    if (v != null) el.innerHTML = v;
  });
  document.documentElement.lang = TWEAKS.lang === 'zh' ? 'zh' : 'en';
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
