// Shared shell: injects the topbar + footer templates, wires theme/lang, applies i18n.
(function(){
  const HEADER_HTML = `
<div class="topbar-inner">
  <div class="brand">
    <span class="mark"></span>
    <span>Tagma</span>
    <span class="v">v0.8.2</span>
  </div>
  <nav class="topnav">
    <a href="index.html"     data-nav="index"     data-i18n="nav.product">Product</a>
    <a href="docs.html"      data-nav="docs"      data-i18n="nav.docs">Docs</a>
    <a href="changelog.html" data-nav="changelog" data-i18n="nav.changelog">Changelog</a>
    <a href="#"              data-i18n="nav.github">GitHub ↗</a>
  </nav>
  <div class="topbar-right">
    <div class="lang-menu" id="lang">
      <button class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="label">EN</span><span class="caret">▾</span>
      </button>
      <div class="panel" role="listbox">
        <button class="opt active"  data-v="en" type="button">English<span class="code">EN</span></button>
        <button class="opt"         data-v="zh" type="button">中文<span class="code">ZH</span></button>
        <button class="opt disabled" type="button">日本語<span class="code">Soon</span></button>
        <button class="opt disabled" type="button">Español<span class="code">Soon</span></button>
      </div>
    </div>
    <button class="theme-btn" id="themeBtn" title="Toggle theme">◐</button>
    <a class="accent-btn" href="index.html#download" data-i18n="cta.download">↓ Download</a>
  </div>
</div>`;

  const FOOTER_HTML = `
<div class="foot-inner">
  <div class="foot">
    <div class="brand-col">
      <div class="name"><span class="mark"></span>Tagma</div>
      <p data-i18n="foot.tag">Every agent in formation. A swim-lane editor for AI orchestration — task as atomic unit, plugin-native, local-first.</p>
    </div>
    <div>
      <h5 data-i18n="foot.product">Product</h5>
      <ul>
        <li><a href="index.html#download" data-i18n="foot.download">Download</a></li>
        <li><a href="docs.html"          data-i18n="foot.docs">Documentation</a></li>
        <li><a href="changelog.html"     data-i18n="foot.changelog">Changelog</a></li>
      </ul>
    </div>
    <div>
      <h5 data-i18n="foot.dev">Developers</h5>
      <ul>
        <li><a href="#" data-i18n="foot.gh">GitHub ↗</a></li>
        <li><a href="#" data-i18n="foot.sdk">Plugin SDK</a></li>
        <li><a href="#" data-i18n="foot.discord">Discord</a></li>
      </ul>
    </div>
    <div>
      <h5 data-i18n="foot.legal">Legal</h5>
      <ul>
        <li><a href="#" data-i18n="foot.terms">Terms of Service</a></li>
        <li><a href="#" data-i18n="foot.privacy">Privacy Policy</a></li>
        <li><a href="#" data-i18n="foot.license">License (MIT)</a></li>
      </ul>
    </div>
    <div>
      <h5 data-i18n="foot.contact">Contact</h5>
      <ul>
        <li><a href="mailto:hello@tagma.dev">hello@tagma.dev</a></li>
        <li><a href="#" data-i18n="foot.security">Security</a></li>
        <li><a href="#" data-i18n="foot.status">Status ●</a></li>
      </ul>
    </div>
  </div>
</div>
<div class="foot-base-wrap">
  <div class="foot-base">
    <span data-i18n="foot.copyright">© 2026 Tagma · All rights reserved</span>
    <span>BUILD 2026.04.12 · SHA256 8F2A…C41B</span>
  </div>
</div>`;

  function injectShell() {
    const header = document.querySelector('header.topbar');
    if (header && !header.children.length) header.innerHTML = HEADER_HTML;
    const footer = document.querySelector('footer.site-footer, footer[data-shell]');
    if (footer && !footer.children.length) footer.innerHTML = FOOTER_HTML;

    // auto-activate nav based on current page
    const page = (location.pathname.split('/').pop() || 'index.html').replace('.html','') || 'index';
    document.querySelectorAll('header.topbar .topnav a[data-nav]').forEach(a => {
      if (a.dataset.nav === page) a.classList.add('active');
    });
  }

  const KEY = 'tagma_tweaks';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ return {}; } })();
  const TWEAKS = Object.assign({ theme: 'dark', lang: 'en' }, window.TWEAKS_DEFAULTS || {}, saved);

  function applyLang() {
    const dict = (window.I18N && window.I18N[TWEAKS.lang]) || (window.I18N && window.I18N.en) || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (dict[k] != null) el.innerHTML = dict[k];
    });
    document.documentElement.lang = TWEAKS.lang === 'zh' ? 'zh' : 'en';
  }
  function apply() {
    document.body.dataset.theme = TWEAKS.theme;
    document.querySelectorAll('#lang .opt').forEach(b => b.classList.toggle('active', b.dataset.v === TWEAKS.lang));
    const trigLabel = document.querySelector('#lang .trigger .label');
    if (trigLabel) trigLabel.textContent = TWEAKS.lang === 'zh' ? '中' : 'EN';
    applyLang();
    document.dispatchEvent(new CustomEvent('tagma:apply', { detail: { ...TWEAKS } }));
  }
  function persist(patch) {
    Object.assign(TWEAKS, patch);
    try { localStorage.setItem(KEY, JSON.stringify(TWEAKS)); } catch(e){}
    apply();
  }

  function wireShell() {
    injectShell();

    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => persist({ theme: TWEAKS.theme === 'dark' ? 'light' : 'dark' }));

    const langMenu = document.getElementById('lang');
    if (langMenu) {
      langMenu.querySelector('.trigger').addEventListener('click', e => {
        e.stopPropagation();
        langMenu.classList.toggle('open');
      });
      langMenu.querySelectorAll('.opt').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (btn.classList.contains('disabled') || !btn.dataset.v) return;
          persist({ lang: btn.dataset.v });
          langMenu.classList.remove('open');
        });
      });
      document.addEventListener('click', () => langMenu.classList.remove('open'));
    }
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireShell);
  } else {
    wireShell();
  }

  window.TAGMA_SHELL = { persist, get: () => TWEAKS, apply };
})();
