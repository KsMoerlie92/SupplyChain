/* ============================================================================
 *  shared/validatie-log.js — teller van itemlijst-validaties
 *  ---------------------------------------------------------------------------
 *  De suite draait op GitHub Pages: puur statisch, geen backend. De telling
 *  werkt daarom net als kpi-history.json en expediting-data.json:
 *
 *    1. Elke validatie wordt lokaal vastgelegd (localStorage).
 *    2. Je downloadt de bijgewerkte log en commit shared/validatie-log.json.
 *    3. Iedereen die de site opent, ziet het teambrede totaal.
 *
 *  Samenvoegen is veilig: elk event heeft een eigen id, dus een event dat al
 *  gecommit is wordt nooit dubbel geteld — ook niet als twee mensen los van
 *  elkaar downloaden en na elkaar committen.
 *
 *  Gebruik:  ValidatieLog.log({ tool:'itemlijst-validator', deliveryRef:'1321-010',
 *                               supplier:'Alfa Laval', regels:42, fouten:3 });
 * ========================================================================== */
(function (global) {
  'use strict';

  const JSON_URL = (function () {
    // pad naar het gecommitte bestand, afgeleid van dit script zelf
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]+$/, 'validatie-log.json') : '../shared/validatie-log.json';
  })();
  const LS_KEY = 'validatieLogLokaal';   // events die nog niet gecommit zijn

  let _commit = null;                    // { meta, events } uit de repo

  // ── lokale opslag ────────────────────────────────────────────────────────
  function lokaal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function bewaar(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function nieuwId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /** Legt één validatie vast. Gooit nooit en blokkeert nooit. */
  function log(data) {
    try {
      const ev = Object.assign({
        id: nieuwId(),
        ts: new Date().toISOString(),
        tool: 'onbekend',
      }, data || {});
      const arr = lokaal(); arr.push(ev); bewaar(arr);
      _render();
      return ev;
    } catch (e) { return null; }
  }

  // ── gecommitte log ophalen ───────────────────────────────────────────────
  async function laadCommit() {
    if (_commit) return _commit;
    try {
      const res = await fetch(JSON_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('niet gevonden');
      const j = await res.json();
      _commit = { meta: j.meta || {}, events: Array.isArray(j.events) ? j.events : [] };
    } catch (e) {
      _commit = { meta: {}, events: [] };     // nog niet gecommit → leeg beginnen
    }
    return _commit;
  }

  /** Voegt gecommitte + lokale events samen, ontdubbeld op id. */
  function samenvoegen(commitEvents, extra) {
    const zien = new Set(); const uit = [];
    for (const e of (commitEvents || []).concat(extra || [])) {
      if (!e || !e.id || zien.has(e.id)) continue;
      zien.add(e.id); uit.push(e);
    }
    uit.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    return uit;
  }

  // ── statistiek ───────────────────────────────────────────────────────────
  async function stats() {
    const c = await laadCommit();
    const l = lokaal();
    const alles = samenvoegen(c.events, l);
    const nieuw = l.filter(e => !c.events.some(x => x.id === e.id)).length;
    const maand = new Date().toISOString().slice(0, 7);
    return {
      totaal: alles.length,
      nietGecommit: nieuw,
      dezeMaand: alles.filter(e => String(e.ts).slice(0, 7) === maand).length,
      gecommitBijgewerkt: c.meta.bijgewerkt || null,
      events: alles,
    };
  }

  // ── downloaden om te committen ───────────────────────────────────────────
  async function download() {
    const c = await laadCommit();
    const alles = samenvoegen(c.events, lokaal());
    const uit = {
      meta: { bijgewerkt: new Date().toISOString(), events: alles.length,
              toelichting: 'Teller van itemlijst-validaties. Commit dit bestand als shared/validatie-log.json.' },
      events: alles,
    };
    const blob = new Blob([JSON.stringify(uit, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'validatie-log.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    return uit;
  }

  /** Leest een bestaand log-bestand in en voegt het samen (bv. van een collega). */
  function inlezen(file) {
    return new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result);
          const ev = Array.isArray(j.events) ? j.events : (Array.isArray(j) ? j : null);
          if (!ev) throw new Error("Bestand bevat geen 'events'.");
          _commit = { meta: j.meta || {}, events: samenvoegen((_commit && _commit.events) || [], ev) };
          _render(); res(_commit.events.length);
        } catch (e) { rej(e); }
      };
      rd.onerror = () => rej(new Error('Kon het bestand niet lezen.'));
      rd.readAsText(file);
    });
  }

  /** Wist de lokale (nog niet gecommitte) events — na het committen. */
  function wisLokaal() { try { localStorage.removeItem(LS_KEY); } catch (e) {} _render(); }

  // ── klein paneel in de validator ─────────────────────────────────────────
  function _mount() {
    const bar = document.querySelector('.val-toolbar');
    if (!bar || document.getElementById('vlog-panel')) return;
    const st = document.createElement('style');
    st.textContent =
      '#vlog-panel{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:.5rem 0 0;' +
      'padding:.45rem .7rem;background:var(--navy-mid,#0F2040);border:1px solid var(--steel,#1e3a6e);' +
      'border-radius:8px;font-family:var(--mono,monospace);font-size:.68rem;color:var(--white,#F0F4FA)}' +
      '#vlog-txt{color:var(--grey,#8FA3BF)} #vlog-txt b{color:var(--teal,#00B4D8)}' +
      '#vlog-panel .vlog-btn{font-family:inherit;font-size:.65rem;font-weight:700;letter-spacing:.04em;' +
      'padding:.25rem .6rem;border-radius:5px;border:1px solid var(--steel,#1e3a6e);background:transparent;' +
      'color:var(--white,#F0F4FA);cursor:pointer}' +
      '#vlog-panel .vlog-btn:hover{border-color:var(--teal,#00B4D8);background:rgba(0,180,216,.1)}' +
      '#vlog-panel .vlog-new{color:#f5b83d}';
    document.head.appendChild(st);
    const p = document.createElement('div');
    p.id = 'vlog-panel';
    p.innerHTML = '<span id="vlog-txt">validaties laden…</span>' +
      '<span style="margin-left:auto"></span>' +
      '<input type="file" id="vlog-file" accept=".json" style="display:none">' +
      '<button class="vlog-btn" id="vlog-load" title="Voeg een log van een collega samen">📄 Log inlezen</button>' +
      '<button class="vlog-btn" id="vlog-dl" title="Download en commit als shared/validatie-log.json">⬇ Log downloaden</button>';
    bar.parentNode.insertBefore(p, bar.nextSibling);
    p.querySelector('#vlog-load').onclick = () => p.querySelector('#vlog-file').click();
    p.querySelector('#vlog-file').onchange = (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (f) inlezen(f).catch(err => alert('Log inlezen mislukt: ' + err.message));
    };
    p.querySelector('#vlog-dl').onclick = async () => {
      await download();
      if (confirm('validatie-log.json gedownload.\n\nCommit dit bestand als shared/validatie-log.json.\n\nLokale telling nu wissen? (doe dit pas ná het committen)'))
        wisLokaal();
    };
    _render();
  }

  async function _render() {
    const el = document.getElementById('vlog-txt'); if (!el) return;
    const s = await stats();
    el.innerHTML = '📊 <b>' + s.totaal + '</b> validaties totaal · <b>' + s.dezeMaand + '</b> deze maand' +
      (s.nietGecommit ? ' · <span class="vlog-new">' + s.nietGecommit + ' nog niet gecommit</span>' : '');
  }

  global.ValidatieLog = { log, stats, download, inlezen, wisLokaal, _lokaal: lokaal, _mount };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mount);
  else _mount();
})(window);
