// Mounted only on doc pages. Adds copy buttons to <pre> blocks and
// rewrites heading anchor clicks to copy the canonical URL instead of
// just navigating to the fragment.

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
        // ignore — fragment update already happened
      }
    });
  });
}

function init() {
  mountCopyButtons();
  mountHeadingAnchors();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
