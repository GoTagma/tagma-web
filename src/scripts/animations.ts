import { REDUCED_MOTION } from './motion';

function initReveal(): void {
  if (REDUCED_MOTION) {
    document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
      el.classList.add('revealed');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const delay = parseFloat(el.dataset.revealDelay || '0');
        setTimeout(() => el.classList.add('revealed'), delay);
        observer.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function animateCounter(el: HTMLElement, target: number, duration = 1600, suffix = ''): void {
  if (REDUCED_MOTION) {
    el.textContent = String(target) + suffix;
    return;
  }
  const start = performance.now();
  function tick(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutQuart(progress);
    const current = Math.round(eased * target);
    el.textContent = String(current) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initCounters(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const raw = el.dataset.countTarget ?? '';
        const match = raw.match(/^([0-9.]+)(.*)$/);
        if (match) {
          animateCounter(el, parseFloat(match[1]), 1400, match[2] || '');
        }
        observer.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('[data-count-target]').forEach((el) => observer.observe(el));
}

function initParallax(): void {
  if (REDUCED_MOTION) return;
  const mark = document.querySelector<HTMLElement>('.foot-mark');
  if (!mark) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const rect = mark.parentElement!.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.max(0, Math.min(1, 1 - rect.top / vh));
      mark.style.transform = `translate3d(0, ${progress * -60}px, 0)`;
      ticking = false;
    });
  }, { passive: true });
}

export function mountAnimations(): void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  initReveal();
  initCounters();
  initParallax();
}
