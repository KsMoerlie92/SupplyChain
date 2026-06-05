// ── IHC Expedite 2.0 — Navigation bar (subpages) ─────────────────────────
// Injects a fixed top nav bar. Include in every subpage AFTER page content.
// For the root index.html use shared-root.js (different href prefix).

(function () {
  const PAGES = [
    { href: '../',                    icon: '🏠', label: 'Home',                badge: ''           },
    { href: '../PO-Matcher/',         icon: '🔍', label: 'PO Matcher',          badge: 'Expediting' },
    { href: '../Legplan/',            icon: '📦', label: 'Legplan & CIPL',       badge: 'Shipment'   },
    { href: '../Itemlijst-Validator/',icon: '📋', label: 'Itemlijst Validator',  badge: 'Validatie'  },
    { href: '../DG-Overview/',        icon: '⚠️', label: 'DG Overview',          badge: 'Hazardous'  },
  ];

  const path = window.location.pathname.toLowerCase();

  function isActive(href) {
    if (href === '../') return false; // never highlight Home on subpages
    const seg = href.replace('../', '').replace('/', '').toLowerCase();
    return seg && path.includes(seg);
  }

  const links = PAGES.map(p => {
    const active = isActive(p.href) ? 'active' : '';
    const badge  = p.badge ? `<span class="ihc-nav-badge">${p.badge}</span>` : '';
    return `<a href="${p.href}" class="ihc-nav-link ${active}">
      <span class="ihc-nav-icon">${p.icon}</span>
      <span class="ihc-nav-label">${p.label}</span>
      ${badge}
    </a>`;
  }).join('');

  const nav = document.createElement('nav');
  nav.className = 'ihc-nav';
  nav.id = 'ihc-nav';
  nav.innerHTML = `
    <a class="ihc-nav-brand" href="../">
      <span class="ihc-nav-logo">IHC</span>
      <span class="ihc-nav-title">Expedite 2.0</span>
    </a>
    <div class="ihc-nav-links">${links}</div>`;

  const spacer = document.createElement('div');
  spacer.className = 'ihc-nav-spacer';

  // Insert at very top of body
  document.body.insertBefore(spacer, document.body.firstChild);
  document.body.insertBefore(nav, spacer);
})();
