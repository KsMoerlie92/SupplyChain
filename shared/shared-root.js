// ── IHC Expedite 2.0 — Navigation bar (root index.html) ──────────────────
// Same behaviour as shared.js, but hrefs have NO ../ prefix (root level).

(function () {
  // ── Thema (donker/licht) — toepassen vóór de nav wordt opgebouwd ─────────
  try {
    if (localStorage.getItem('ihc-theme') === 'light')
      document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

  // Twee menu's met dropdowns — gelijk aan de subpagina's (root-hrefs)
  const MENUS = [
    { label: 'Expediting', items: [
      { href: 'PO-Matcher/',          icon: '🔍', title: 'Expediting Tool',    sub: 'Expediting- vs. moederlijst & late items' },
      { href: 'Expediting-Mailer/',   icon: '✉️', title: 'Expediting Mailer',  sub: 'Stel expediting-mails op per order' },
      { href: 'FAT-Overview/',        icon: '🏭', title: 'FAT Overview',       sub: 'Factory Acceptance Tests in beeld' },
    ]},
    { label: 'Logistics', items: [
      { href: 'Legplan/',             icon: '📦', title: 'Logistic Portal',    sub: 'Legplan, CIPL & shipment-informatie' },
      { href: 'DG-Overview/',         icon: '⚠️', title: 'DG Overview',        sub: 'Gevaarlijke stoffen in de lijst' },
      { href: 'Itemlijst-Validator/', icon: '📋', title: 'Itemlijst Validator', sub: 'Valideer & corrigeer itemlijsten' },
    ]},
  ];

  // Exacte segment-match (voorkomt false positives)
  const segs = window.location.pathname.toLowerCase().split('/').filter(Boolean);
  const seg = href => href.replace(/\/$/, '').toLowerCase();
  const isActive = href => { const s = seg(href); return !!s && segs.includes(s); };

  const menusHtml = MENUS.map(m => {
    const groupActive = m.items.some(it => isActive(it.href));
    const items = m.items.map(it => `
      ${it.href}
        <span class="ihc-dd-ico">${it.icon}</span>
        <span class="ihc-dd-txt"><span class="ihc-dd-title">${it.title}</span><span class="ihc-dd-sub">${it.sub}</span></span>
        <svg class="ihc-chev" viewBox="0 0 32 32"><path d="M22 16L12 26l-1.4-1.4 8.6-8.6-8.6-8.6L12 6z"></path></svg>
      </a>`).join('');
    return `
      <div class="ihc-nav-item">
        <button class="ihc-nav-trigger${groupActive ? ' active' : ''}" type="button">${m.label} <svg class="ihc-caret" viewBox="0 0 32 32"><path d="M22 16L12 26l-1.4-1.4 8.6-8.6-8.6-8.6L12 6z"></path></svg></button>
        <div class="ihc-dropdown">${items}</div>
      </div>`;
  }).join('');

  const nav = document.createElement('nav');
  nav.className = 'ihc-nav';
  nav.id = 'ihc-nav';
  nav.innerHTML = `
    ./
      ./shared/logo-dark.png
      ./shared/logo.png
      <span class="ihc-nav-title">Expedite 2.0</span>
    </a>
    <button class="ihc-burger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
    <div class="ihc-nav-menu" id="ihc-nav-menu">${menusHtml}</div>
    <div class="ihc-nav-actions">
      Admin/
      <button class="ihc-theme-toggle" id="ihc-theme-toggle" type="button"
        title="${isLight() ? 'Donker thema' : 'Licht thema'}"
        aria-label="Wissel thema">${isLight() ? '🌙' : '☀️'}</button>
    </div>`;

  const spacer = document.createElement('div');
  spacer.className = 'ihc-nav-spacer';

  document.body.insertBefore(spacer, document.body.firstChild);
  document.body.insertBefore(nav, spacer);

  const menu = document.getElementById('ihc-nav-menu');
  const burger = nav.querySelector('.ihc-burger');

  const closeMobileMenu = () => {
    if (menu) menu.classList.remove('show');
    if (burger) burger.setAttribute('aria-expanded', 'false');
    nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
  };

  // ── Mobiel: burger + tik-om-uit-te-klappen ───────────────────────────────
  if (burger) burger.addEventListener('click', e => {
    e.stopPropagation();
    const show = menu.classList.toggle('show');
    burger.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (!show) nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
  });

  nav.querySelectorAll('.ihc-nav-trigger').forEach(t => {
    t.addEventListener('click', () => {
      if (window.matchMedia('(min-width:861px)').matches) return; // desktop = hover
      const item = t.closest('.ihc-nav-item');
      const open = item.classList.contains('open');
      nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
      if (!open) item.classList.add('open');
    });
  });

  nav.querySelectorAll('.ihc-dd-link').forEach(a => {
    a.addEventListener('click', () => closeMobileMenu());
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.ihc-nav')) closeMobileMenu();
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width:861px)').matches) closeMobileMenu();
  });

  // ── Thema wisselen + onthouden ──────────────────────────────────────────
  const btn = document.getElementById('ihc-theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    const toLight = !isLight();
    if (toLight) document.documentElement.setAttribute('data-theme', 'light');
    else         document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('ihc-theme', toLight ? 'light' : 'dark'); } catch (e) {}
    btn.textContent = toLight ? '🌙' : '☀️';
    btn.title = toLight ? 'Donker thema' : 'Licht thema';
  });
})();
