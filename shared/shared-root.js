// ── IHC Expedite 2.0 — Navigation bar (root index.html) ──────────────────
// Same as shared.js but hrefs don't have the ../ prefix.

(function () {
  const PAGES = [
    { href: 'PO-Matcher/',          icon: '🔍', label: 'Expediting Tool',          badge: 'Expediting' },
    { href: 'Legplan/',             icon: '📦', label: 'Logistic Portal',       badge: 'Shipment'   },
    { href: 'Itemlijst-Validator/', icon: '📋', label: 'Itemlijst Validator',  badge: 'Validatie'  },
    { href: 'DG-Overview/',         icon: '⚠️', label: 'DG Overview',          badge: 'Hazardous'  },
    { href: 'Expediting-Mailer/',   icon: '✉️', label: 'Expediting Mailer',    badge: 'Mailer'     },
    { href: 'FAT-Overview/',        icon: '🏭', label: 'FAT Overview',         badge: 'FAT'        },
    { href: 'Admin/',               icon: '⚙️', label: 'Admin',                badge: 'Beheer'     },
  ];

  const links = PAGES.map(p => {
    const badge = p.badge ? `<span class="ihc-nav-badge">${p.badge}</span>` : '';
    return `<a href="${p.href}" class="ihc-nav-link">
      <span class="ihc-nav-icon">${p.icon}</span>
      <span class="ihc-nav-label">${p.label}</span>
      ${badge}
    </a>`;
  }).join('');

  const nav = document.createElement('nav');
  nav.className = 'ihc-nav';
  nav.id = 'ihc-nav';
  nav.innerHTML = `
    <a class="ihc-nav-brand" href="./">
      <span class="ihc-nav-logo">IHC</span>
      <span class="ihc-nav-title">Expedite 2.0</span>
    </a>
    <div class="ihc-nav-links">${links}</div>`;

  const spacer = document.createElement('div');
  spacer.className = 'ihc-nav-spacer';

  document.body.insertBefore(spacer, document.body.firstChild);
  document.body.insertBefore(nav, spacer);
})();
