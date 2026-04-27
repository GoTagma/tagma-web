// Mounted only on doc pages. Adds copy buttons to <pre> blocks, rewrites
// heading anchor clicks to copy the canonical URL, and runs a scroll-spy
// that highlights the current section in the "On this page" panel.

function flashCopied(el: HTMLElement, originalText?: string) {
  el.classList.add('copied');
  const prev = el.textContent;
  if (originalText !== undefined) el.textContent = originalText;
  setTimeout(() => {
    el.classList.remove('copied');
    if (originalText !== undefined && prev !== null) el.textContent = prev;
  }, 1200);
}

function mountCopyButtons() {
  const article = document.querySelector('.doc-main');
  if (!article) return;
  const pres = article.querySelectorAll<HTMLPreElement>('pre');
  pres.forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-block')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', async () => {
      const text = pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        flashCopied(btn, 'Copied');
      } catch {
        flashCopied(btn, 'Failed');
      }
    });
    wrap.appendChild(btn);
  });
}

function mountHeadingAnchors() {
  const anchors = document.querySelectorAll<HTMLAnchorElement>('.doc-main .heading-anchor');
  anchors.forEach((a) => {
    a.addEventListener('click', async (event) => {
      const heading = a.parentElement;
      const id = heading?.id;
      if (!id) return;
      event.preventDefault();
      const url = `${location.origin}${location.pathname}#${id}`;
      history.replaceState(null, '', `#${id}`);
      try {
        await navigator.clipboard.writeText(url);
        flashCopied(a);
      } catch {
        // fragment update already happened
      }
    });
  });
}

// Highlight the TOC entry for the section currently under the reader's
// eye. Each h2/h3 with an id is observed against a narrow band near the
// top of the viewport; whichever heading is inside the band (or, as a
// fallback, the last one above it) is marked active.
function mountTocScrollSpy() {
  const tocs = document.querySelectorAll<HTMLElement>('.doc-toc, .doc-toc-inline-list');
  const article = document.querySelector<HTMLElement>('.doc-main');
  if (tocs.length === 0 || !article) return;

  const links = Array.from(tocs).flatMap((toc) =>
    Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')),
  );
  if (links.length === 0) return;

  const linksById = new Map<string, HTMLAnchorElement[]>();
  for (const a of links) {
    const id = a.getAttribute('href')?.slice(1);
    if (!id) continue;
    const decoded = decodeURIComponent(id);
    const list = linksById.get(decoded) ?? [];
    list.push(a);
    linksById.set(decoded, list);
  }

  const headings = Array.from(
    article.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]'),
  ).filter((h) => linksById.has(h.id));
  if (headings.length === 0) return;

  const visible = new Set<string>();
  let activeId: string | null = null;

  const setActive = (id: string | null) => {
    if (id === activeId) return;
    activeId = id;
    for (const a of links) a.classList.remove('active');
    if (id) linksById.get(id)?.forEach((a) => a.classList.add('active'));
  };

  const pickActive = () => {
    if (visible.size > 0) {
      for (const h of headings) {
        if (visible.has(h.id)) {
          setActive(h.id);
          return;
        }
      }
    }
    const cutoff = window.scrollY + 120;
    let best: HTMLHeadingElement | null = null;
    for (const h of headings) {
      const top = h.getBoundingClientRect().top + window.scrollY;
      if (top <= cutoff) best = h;
      else break;
    }
    setActive(best ? best.id : headings[0].id);
  };

  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      pickActive();
    },
    {
      rootMargin: '-72px 0px -65% 0px',
      threshold: 0,
    },
  );

  for (const h of headings) obs.observe(h);
  pickActive();
}

function mountCollapsibles() {
  const triggers = document.querySelectorAll<HTMLButtonElement>('[data-collapse-toggle]');
  triggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
    });
  });
}

function init() {
  mountCopyButtons();
  mountHeadingAnchors();
  mountTocScrollSpy();
  mountCollapsibles();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
