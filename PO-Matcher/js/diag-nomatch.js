/* PO-Matcher — Diagnose "Niet in Expediting" (modal, IHC-stijl)
   Klikbare stat-tegel -> overzicht van moederregels die niet in de
   expediting-lijst (Kolom A) zijn teruggevonden. Per regel toont het de
   vergelijkingssleutel (Kol C) en — indien aanwezig — een sleutel in
   expediting met dezelfde tekens maar een andere notatie (formaatverschil).
   Zelfstandige module; leest globals allRows + fileData. */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function _cap(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\u2026' : s; }
  const _strip = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  let _injected = false;
  function _injectStyle() {
    if (_injected) return; _injected = true;
    const css = `
    .nmd-clickable { cursor: pointer; }
    .nmd-clickable:hover .stat-lbl { text-decoration: underline; }
    .nmd-clickable:hover .stat-val { filter: brightness(1.18); }
    .nmd-overlay { position: fixed; inset: 0; background: rgba(4,9,20,.72); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .nmd-modal { background: var(--mid, #0F2040); color: var(--text, #D4DEF0); border: 1px solid var(--steel, #1E3A5F); border-radius: 12px; width: min(980px, 96vw); max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,.5); font-family: var(--body, 'Barlow', sans-serif); }
    .nmd-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--steel, #1E3A5F); }
    .nmd-title { font-family: var(--condensed, 'Barlow Condensed', sans-serif); font-size: 1.35rem; font-weight: 700; letter-spacing: .3px; }
    .nmd-title b { color: var(--ihc-red, #D91F2C); }
    .nmd-close { background: transparent; border: 0; color: var(--muted, #8FA3BF); font-size: 1.25rem; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; }
    .nmd-close:hover { color: var(--text, #D4DEF0); background: var(--navy, #0A1628); }
    .nmd-sub { padding: 12px 20px 0; color: var(--muted, #8FA3BF); font-size: .9rem; line-height: 1.5; }
    .nmd-sub b { color: var(--text, #D4DEF0); }
    .nmd-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 20px; }
    .nmd-tools input[type=text] { flex: 1 1 240px; min-width: 180px; background: var(--navy, #0A1628); border: 1px solid var(--steel, #1E3A5F); color: var(--text, #D4DEF0); border-radius: 8px; padding: 8px 10px; font-size: .9rem; }
    .nmd-tools input[type=text]:focus { outline: none; border-color: var(--teal, #00B4C8); }
    .nmd-tools label { font-size: .85rem; color: var(--muted, #8FA3BF); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .nmd-btn { background: var(--steel, #1E3A5F); color: var(--text, #D4DEF0); border: 1px solid var(--steel, #1E3A5F); border-radius: 8px; padding: 8px 12px; font-size: .85rem; cursor: pointer; }
    .nmd-btn:hover { background: var(--navy, #0A1628); }
    .nmd-count { margin-left: auto; color: var(--muted, #8FA3BF); font-size: .82rem; }
    .nmd-tablewrap { overflow: auto; margin: 0 20px 20px; border: 1px solid var(--steel, #1E3A5F); border-radius: 8px; }
    .nmd-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .nmd-table th { position: sticky; top: 0; background: var(--navy, #0A1628); color: var(--muted, #8FA3BF); text-align: left; font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--steel, #1E3A5F); white-space: nowrap; }
    .nmd-table td { padding: 8px 12px; border-bottom: 1px solid rgba(30,58,95,.4); vertical-align: top; }
    .nmd-table tr:hover td { background: rgba(0,180,200,.05); }
    .nmd-key { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: .82rem; color: var(--text, #D4DEF0); }
    .nmd-near { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: .82rem; color: var(--amber, #FFB300); }
    .nmd-dim { color: var(--muted, #8FA3BF); }
    .nmd-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .72rem; font-weight: 600; white-space: nowrap; }
    .nmd-badge.note { background: rgba(255,179,0,.15); color: var(--amber, #FFB300); border: 1px solid rgba(255,179,0,.4); }
    .nmd-badge.miss { background: rgba(217,31,44,.15); color: #f87171; border: 1px solid rgba(217,31,44,.4); }
    .nmd-empty { padding: 28px 20px; text-align: center; color: var(--muted, #8FA3BF); }
    `;
    const st = document.createElement('style'); st.id = 'nmd-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  let _rows = [];
  function _build() {
    const all = (window.allRows || []);
    const fd  = (window.fileData || {});
    const exp = (fd.expediting && fd.expediting.data) || [];
    const colAKey = (fd.expediting && fd.expediting.headers && fd.expediting.headers[0])
                 || (exp[0] && Object.keys(exp[0])[0]);
    // Expediting Kol A: gestripte tekens -> originele waarde (eerste voorkomen)
    const expByStripped = new Map();
    for (const er of exp) {
      const v = String((colAKey ? er[colAKey] : '') || '').trim();
      if (!v) continue;
      const s = _strip(v);
      if (s && !expByStripped.has(s)) expByStripped.set(s, v);
    }
    _rows = all.filter(r => r.noMatch).map(r => {
      const key  = r.combined || '';
      const near = expByStripped.get(_strip(key)) || null;
      return { supplier: r.colSupplier || '', desc: r.colE || '', key, near };
    });
  }

  function _filtered() {
    const q = (document.getElementById('nmd-search').value || '').trim().toLowerCase();
    const onlyNear = document.getElementById('nmd-onlynear').checked;
    return _rows.filter(r => {
      if (onlyNear && !r.near) return false;
      if (!q) return true;
      return (r.supplier + ' ' + r.key + ' ' + (r.near || '') + ' ' + r.desc).toLowerCase().includes(q);
    });
  }

  function _render() {
    const tb = document.getElementById('nmd-tbody');
    const shown = _filtered();
    if (!shown.length) {
      tb.innerHTML = `<tr><td colspan="4" class="nmd-empty">Geen regels die aan het filter voldoen.</td></tr>`;
    } else {
      tb.innerHTML = shown.map(r => `
        <tr>
          <td title="${_esc(r.supplier)}">${_esc(_cap(r.supplier || '\u2014', 22))}</td>
          <td class="nmd-key" title="${_esc(r.desc)}">${_esc(r.key || '\u2014')}</td>
          <td>${r.near ? `<span class="nmd-near">${_esc(r.near)}</span>` : '<span class="nmd-dim">\u2014</span>'}</td>
          <td>${r.near ? '<span class="nmd-badge note">andere notatie</span>' : '<span class="nmd-badge miss">niet aanwezig</span>'}</td>
        </tr>`).join('');
    }
    document.getElementById('nmd-count').textContent = `${shown.length} van ${_rows.length} getoond`;
  }

  function _copy() {
    const shown = _filtered();
    const tsv = ['Leverancier\tVergelijkingssleutel (Kol C)\tDichtstbij in Expediting (Kol A)\tDiagnose']
      .concat(shown.map(r => `${r.supplier}\t${r.key}\t${r.near || ''}\t${r.near ? 'andere notatie' : 'niet aanwezig'}`))
      .join('\n');
    const done = () => {
      const b = document.getElementById('nmd-copy'); if (!b) return;
      const o = b.textContent; b.textContent = '\u2713 Gekopieerd'; setTimeout(() => { b.textContent = o; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(done).catch(() => {});
    } else {
      const ta = document.createElement('textarea'); ta.value = tsv; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove();
    }
  }

  function close() {
    const o = document.getElementById('nmd-overlay'); if (o) o.remove();
    document.removeEventListener('keydown', _onKey);
  }
  function _onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    _injectStyle();
    _build();
    const total = (window.allRows || []).length;
    const nearCount = _rows.filter(r => r.near).length;
    close();
    const ov = document.createElement('div');
    ov.className = 'nmd-overlay'; ov.id = 'nmd-overlay';
    ov.innerHTML = `
      <div class="nmd-modal" role="dialog" aria-modal="true">
        <div class="nmd-head">
          <div class="nmd-title">Diagnose \u2014 <b>Niet in Expediting</b></div>
          <button class="nmd-close" id="nmd-close" title="Sluiten">\u2715</button>
        </div>
        <div class="nmd-sub">
          <b>${_rows.length}</b> van ${total} moederregels zijn niet teruggevonden in Kolom A van de expediting-lijst.
          ${nearCount ? `Bij <b>${nearCount}</b> daarvan bestaat wel een sleutel in expediting met <b>dezelfde tekens maar een andere notatie</b> (waarschijnlijk een formaatverschil).` : ''}
          De vergelijking gebeurt op de gecombineerde sleutel (Kol C) versus Kol A.
        </div>
        <div class="nmd-tools">
          <input type="text" id="nmd-search" placeholder="Filter op leverancier, sleutel of omschrijving\u2026">
          <label><input type="checkbox" id="nmd-onlynear"> alleen notatie-afwijkingen</label>
          <button class="nmd-btn" id="nmd-copy">\uD83D\uDCCB Kopieer</button>
          <span class="nmd-count" id="nmd-count"></span>
        </div>
        <div class="nmd-tablewrap">
          <table class="nmd-table">
            <thead><tr>
              <th>Leverancier</th>
              <th>Vergelijkingssleutel (Kol C)</th>
              <th>Dichtstbij in Expediting (Kol A)</th>
              <th>Diagnose</th>
            </tr></thead>
            <tbody id="nmd-tbody"></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.getElementById('nmd-close').addEventListener('click', close);
    document.getElementById('nmd-search').addEventListener('input', _render);
    document.getElementById('nmd-onlynear').addEventListener('change', _render);
    document.getElementById('nmd-copy').addEventListener('click', _copy);
    document.addEventListener('keydown', _onKey);
    _render();
  }

  window.NoMatchDiag = { open: open, close: close };
})();
