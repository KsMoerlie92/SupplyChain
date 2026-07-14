// ── IHC Expedite 2.0 — Navigation bar (subpages, prefix ../) ─────────────
(function () {
  try {
    if (localStorage.getItem('ihc-theme') === 'light')
      document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

  const PREFIX = '../'; // subpagina's; op root wordt dit ''
  const MENUS = [
    { label: 'Expediting', items: [
      { href: PREFIX + 'PO-Matcher/',          icon: '🔍', title: 'Expediting Tool',    sub: 'Expediting- vs. moederlijst & late items' },
      { href: PREFIX + 'Expediting-Mailer/',   icon: '✉️', title: 'Expediting Mailer',  sub: 'Stel expediting-mails op per order' },
      { href: PREFIX + 'FAT-Overview/',        icon: '🧪', title: 'FAT Overview',       sub: 'Factory Acceptance Tests in beeld' },
    ]},
    { label: 'Logistics', items: [
      { href: PREFIX + 'Legplan/',             icon: '📦', title: 'Logistic Portal',    sub: 'Legplan, CIPL & shipment-informatie' },
      { href: PREFIX + 'DG-Overview/',         icon: '⚠️', title: 'DG Overview',        sub: 'Gevaarlijke stoffen in de lijst' },
      { href: PREFIX + 'Itemlijst-Validator/', icon: '📋', title: 'Itemlijst Validator', sub: 'Valideer & corrigeer itemlijsten' },
    ]},
  ];

  const segs = window.location.pathname.toLowerCase().split('/').filter(Boolean);
  const seg  = h => h.replace('../', '').replace(/\/$/, '').toLowerCase();
  const isActive = h => { const s = seg(h); return !!s && segs.includes(s); };

  const CHEV  = '<svg class="ihc-chev" viewBox="0 0 32 32"><path d="M22 16L12 26l-1.4-1.4 8.6-8.6-8.6-8.6L12 6z"></path></svg>';
  const CARET = '<svg class="ihc-caret" viewBox="0 0 32 32"><path d="M22 16L12 26l-1.4-1.4 8.6-8.6-8.6-8.6L12 6z"></path></svg>';

  const el = (tag, props = {}, txt) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => (k in n) ? (n[k] = v) : n.setAttribute(k, v));
    if (txt != null) n.textContent = txt;
    return n;
  };

  // ── Nav opbouwen via DOM (geen losse <a>/<img> in strings) ───────────────
  const nav = el('nav', { className: 'ihc-nav', id: 'ihc-nav' });

  const brand = el('a', { className: 'ihc-nav-brand', href: PREFIX });
  brand.append(
    el('img', { className: 'ihc-logo ihc-logo-dark',  src: PREFIX + 'shared/logo-dark.png', alt: 'Royal IHC' }),
    el('img', { className: 'ihc-logo ihc-logo-light', src: PREFIX + 'shared/logo.png',      alt: 'Royal IHC' }),
    el('span', { className: 'ihc-nav-title' }, 'Expedite 2.0')
  );

  const burger = el('button', { className: 'ihc-burger', type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false' }, '☰');

  const menu = el('div', { className: 'ihc-nav-menu', id: 'ihc-nav-menu' });
  MENUS.forEach(m => {
    const item = el('div', { className: 'ihc-nav-item' });
    const trig = el('button', { className: 'ihc-nav-trigger' + (m.items.some(it => isActive(it.href)) ? ' active' : ''), type: 'button' });
    trig.innerHTML = m.label + ' ' + CARET;
    const dd = el('div', { className: 'ihc-dropdown' });
    m.items.forEach(it => {
      const a = el('a', { className: 'ihc-dd-link' + (isActive(it.href) ? ' active' : ''), href: it.href });
      a.innerHTML =
        '<span class="ihc-dd-ico">' + it.icon + '</span>' +
        '<span class="ihc-dd-txt"><span class="ihc-dd-title">' + it.title + '</span>' +
        '<span class="ihc-dd-sub">' + it.sub + '</span></span>' + CHEV;
      dd.appendChild(a);
    });
    item.append(trig, dd);
    menu.appendChild(item);
  });

  const actions = el('div', { className: 'ihc-nav-actions' });
  actions.append(
    el('a', { className: 'ihc-nav-btn', id: 'ihc-admin-btn', href: PREFIX + 'Admin/', title: 'Admin — centrale expediting-upload', 'aria-label': 'Admin' }, '⚙️'),
    el('button', { className: 'ihc-theme-toggle', id: 'ihc-theme-toggle', type: 'button',
      title: isLight() ? 'Donker thema' : 'Licht thema', 'aria-label': 'Wissel thema' }, isLight() ? '🌙' : '☀️')
  );

  nav.append(brand, burger, menu, actions);
  const spacer = el('div', { className: 'ihc-nav-spacer' });

  // ── Invoegen VÓÓR de wiring → balk altijd zichtbaar ──────────────────────
  document.body.insertBefore(spacer, document.body.firstChild);
  document.body.insertBefore(nav, spacer);

  // ── Events (afgeschermd) ─────────────────────────────────────────────────
  try {
    const closeMobileMenu = () => {
      menu.classList.remove('show');
      burger.setAttribute('aria-expanded', 'false');
      nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
    };
    burger.addEventListener('click', e => {
      e.stopPropagation();
      const show = menu.classList.toggle('show');
      burger.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (!show) nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
    });
    nav.querySelectorAll('.ihc-nav-trigger').forEach(t => t.addEventListener('click', () => {
      if (window.matchMedia('(min-width:861px)').matches) return;
      const item = t.closest('.ihc-nav-item');
      const open = item.classList.contains('open');
      nav.querySelectorAll('.ihc-nav-item.open').forEach(i => i.classList.remove('open'));
      if (!open) item.classList.add('open');
    }));
    nav.querySelectorAll('.ihc-dd-link').forEach(a => a.addEventListener('click', closeMobileMenu));
    document.addEventListener('click', e => { if (!e.target.closest('.ihc-nav')) closeMobileMenu(); });
    window.addEventListener('resize', () => { if (window.matchMedia('(min-width:861px)').matches) closeMobileMenu(); });

    const btn = document.getElementById('ihc-theme-toggle');
    btn.addEventListener('click', () => {
      const toLight = !isLight();
      if (toLight) document.documentElement.setAttribute('data-theme', 'light');
      else         document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('ihc-theme', toLight ? 'light' : 'dark'); } catch (e) {}
      btn.textContent = toLight ? '🌙' : '☀️';
      btn.title = toLight ? 'Donker thema' : 'Licht thema';
    });
  } catch (e) { console.error('[ihc-nav] event wiring faalde:', e); }
})();
