/* PO-Matcher — "Ontvangen items" (modal, IHC-stijl)
   Klikbare stat-tegel -> overzicht van moederregels die niet (meer) in de
   expediting-lijst (Kolom A) staan en dus al zijn ontvangen/verwerkt in het ERP.
   Per regel:
     • volledig ontvangen        — heel PO afgehandeld (komt nergens meer in Kol A voor)
     • deels ontvangen           — PO heeft nog open regels (die worden getoond)
     • mogelijk formaatverschil  — staat nog in expediting onder een andere notatie
   Zelfstandige module; leest globals allRows + fileData via hun kale naam. */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function _cap(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\u2026' : s; }
  const _strip = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const _basePO = k => { const i = String(k).indexOf('-'); return i < 0 ? String(k) : String(k).slice(0, i); };
  const _suffix = k => { const i = String(k).indexOf('-'); return i < 0 ? '' : String(k).slice(i + 1); };

  // allRows / fileData zijn lexicale globals (let/const), géén window-properties.
  function _getAll() { try { if (typeof allRows !== 'undefined' && Array.isArray(allRows)) return allRows; } catch (e) {} return (window.allRows || []); }
  function _getFd()  { try { if (typeof fileData !== 'undefined' && fileData) return fileData; } catch (e) {} return (window.fileData || {}); }

  let _injected = false;
  function _injectStyle() {
    if (_injected) return; _injected = true;
    const css = `
    .nmd-clickable { cursor: pointer; }
    .nmd-clickable:hover .stat-lbl { text-decoration: underline; }
    .nmd-clickable:hover .stat-val { filter: brightness(1.18); }
    .nmd-overlay { position: fixed; inset: 0; background: rgba(4,9,20,.72); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .nmd-modal { background: var(--mid, #0F2040); color: var(--text, #D4DEF0); border: 1px solid var(--steel, #1E3A5F); border-radius: 12px; width: min(1040px, 96vw); max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,.5); font-family: var(--body, 'Barlow', sans-serif); }
    .nmd-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--steel, #1E3A5F); }
    .nmd-title { font-family: var(--condensed, 'Barlow Condensed', sans-serif); font-size: 1.35rem; font-weight: 700; letter-spacing: .3px; }
    .nmd-title b { color: var(--ihc-red, #D91F2C); }
    .nmd-close { background: transparent; border: 0; color: var(--muted, #8FA3BF); font-size: 1.25rem; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; }
    .nmd-close:hover { color: var(--text, #D4DEF0); background: var(--navy, #0A1628); }
    .nmd-sub { padding: 12px 20px 0; color: var(--muted, #8FA3BF); font-size: .9rem; line-height: 1.5; }
    .nmd-sub b { color: var(--text, #D4DEF0); }
    .nmd-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 20px; }
    .nmd-tools input[type=text], .nmd-tools select { background: var(--navy, #0A1628); border: 1px solid var(--steel, #1E3A5F); color: var(--text, #D4DEF0); border-radius: 8px; padding: 8px 10px; font-size: .9rem; }
    .nmd-tools input[type=text] { flex: 1 1 220px; min-width: 160px; }
    .nmd-tools input[type=text]:focus, .nmd-tools select:focus { outline: none; border-color: var(--teal, #00B4C8); }
    .nmd-btn { background: var(--steel, #1E3A5F); color: var(--text, #D4DEF0); border: 1px solid var(--steel, #1E3A5F); border-radius: 8px; padding: 8px 12px; font-size: .85rem; cursor: pointer; }
    .nmd-btn:hover { background: var(--navy, #0A1628); }
    .nmd-count { margin-left: auto; color: var(--muted, #8FA3BF); font-size: .82rem; }
    .nmd-tablewrap { overflow: auto; margin: 0 20px 20px; border: 1px solid var(--steel, #1E3A5F); border-radius: 8px; }
    .nmd-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .nmd-table th { position: sticky; top: 0; background: var(--navy, #0A1628); color: var(--muted, #8FA3BF); text-align: left; font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--steel, #1E3A5F); white-space: nowrap; }
    .nmd-table td { padding: 8px 12px; border-bottom: 1px solid rgba(30,58,95,.4); vertical-align: top; }
    .nmd-table tr:hover td { background: rgba(0,180,200,.05); }
    .nmd-key { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: .82rem; color: var(--text, #D4DEF0); white-space: nowrap; }
    .nmd-avail { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: .8rem; color: #FF8A3D; }
    .nmd-near { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: .82rem; color: var(--amber, #FFB300); }
    .nmd-dim { color: var(--muted, #8FA3BF); }
    .nmd-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .72rem; font-weight: 600; white-space: nowrap; }
    .nmd-badge.note { background: rgba(255,179,0,.15); color: var(--amber, #FFB300); border: 1px solid rgba(255,179,0,.4); }
    .nmd-badge.done { background: rgba(0,200,83,.15); color: var(--green, #00C853); border: 1px solid rgba(0,200,83,.4); }
    .nmd-badge.part { background: rgba(0,180,200,.15); color: var(--teal, #00B4C8); border: 1px solid rgba(0,180,200,.4); }
    .nmd-badge.line { background: rgba(255,138,61,.15); color: #FF8A3D; border: 1px solid rgba(255,138,61,.45); }
    .nmd-badge.miss { background: rgba(217,31,44,.15); color: #f87171; border: 1px solid rgba(217,31,44,.4); }
    .nmd-empty { padding: 28px 20px; text-align: center; color: var(--muted, #8FA3BF); }
    `;
    const st = document.createElement('style'); st.id = 'nmd-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  let _rows = [];
  let _counts = { notation: 0, lineDiff: 0, poMissing: 0 };

  function _build() {
    const all = _getAll();
    const fd  = _getFd();
    const exp = (fd.expediting && fd.expediting.data) || [];
    const colAKey = (fd.expediting && fd.expediting.headers && fd.expediting.headers[0])
                 || (exp[0] && Object.keys(exp[0])[0]);
    const expByStripped = new Map();   // gestripte tekens -> originele Kol A
    const expByPO = new Map();         // base-PO (lower) -> Set originele Kol A
    for (const er of exp) {
      const v = String((colAKey ? er[colAKey] : '') || '').trim();
      if (!v) continue;
      const s = _strip(v);
      if (s && !expByStripped.has(s)) expByStripped.set(s, v);
      const bp = _basePO(v).toLowerCase();
      if (!expByPO.has(bp)) expByPO.set(bp, new Set());
      expByPO.get(bp).add(v);
    }
    _counts = { notation: 0, lineDiff: 0, poMissing: 0 };
    _rows = all.filter(r => r.noMatch).map(r => {
      const key  = r.combined || '';
      const near = expByStripped.get(_strip(key)) || null;
      const bp   = _basePO(key).toLowerCase();
      const poSet = expByPO.get(bp);
      let cat;
      if (near && near.toLowerCase() !== key.toLowerCase()) cat = 'notation';
      else if (poSet && poSet.size) cat = 'lineDiff';
      else cat = 'poMissing';
      _counts[cat]++;
      const avail = (cat === 'lineDiff') ? [...poSet].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })) : [];
      return { supplier: r.colSupplier || '', desc: r.colE || '', key, near, cat, avail };
    });
  }

  const _catLabel = c => c === 'notation' ? 'mogelijk formaatverschil' : c === 'lineDiff' ? 'deels ontvangen' : 'volledig ontvangen';
  function _badge(c) {
    if (c === 'notation') return '<span class="nmd-badge note">mogelijk formaatverschil</span>';
    if (c === 'lineDiff')  return '<span class="nmd-badge part">deels ontvangen</span>';
    return '<span class="nmd-badge done">volledig ontvangen</span>';
  }
  function _availCell(r) {
    if (r.cat === 'notation') return r.near ? `<span class="nmd-near">${_esc(r.near)}</span>` : '<span class="nmd-dim">\u2014</span>';
    if (r.cat === 'lineDiff') {
      const sfx = r.avail.map(_suffix).filter(Boolean);
      const show = sfx.slice(0, 10).map(_esc).join(', ');
      const more = sfx.length > 10 ? ` <span class="nmd-dim">(+${sfx.length - 10} meer)</span>` : '';
      return `<span class="nmd-avail" title="${_esc(r.avail.join(', '))}">${show}${more}</span>`;
    }
    return '<span class="nmd-dim">\u2014</span>';
  }

  function _filtered() {
    const q = (document.getElementById('nmd-search').value || '').trim().toLowerCase();
    const cat = document.getElementById('nmd-cat').value;
    return _rows.filter(r => {
      if (cat !== 'all' && r.cat !== cat) return false;
      if (!q) return true;
      return (r.supplier + ' ' + r.key + ' ' + r.avail.join(' ') + ' ' + r.desc).toLowerCase().includes(q);
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
          <td>${_badge(r.cat)}</td>
          <td>${_availCell(r)}</td>
        </tr>`).join('');
    }
    document.getElementById('nmd-count').textContent = `${shown.length} van ${_rows.length} getoond`;
  }

  function _copy() {
    const shown = _filtered();
    const tsv = ['Leverancier\tVergelijkingssleutel (Kol C)\tStatus\tNog open in expediting (dit PO)']
      .concat(shown.map(r => {
        const av = r.cat === 'lineDiff' ? r.avail.join(' ') : (r.cat === 'notation' ? (r.near || '') : '');
        return `${r.supplier}\t${r.key}\t${_catLabel(r.cat)}\t${av}`;
      })).join('\n');
    const done = () => { const b = document.getElementById('nmd-copy'); if (!b) return; const o = b.textContent; b.textContent = '\u2713 Gekopieerd'; setTimeout(() => { b.textContent = o; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(done).catch(() => {});
    } else {
      const ta = document.createElement('textarea'); ta.value = tsv; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove();
    }
  }

  function close() { const o = document.getElementById('nmd-overlay'); if (o) o.remove(); document.removeEventListener('keydown', _onKey); }
  function _onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    _injectStyle();
    _build();
    const total = _getAll().length;
    close();
    const ov = document.createElement('div');
    ov.className = 'nmd-overlay'; ov.id = 'nmd-overlay';
    ov.innerHTML = `
      <div class="nmd-modal" role="dialog" aria-modal="true">
        <div class="nmd-head">
          <div class="nmd-title">Overzicht \u2014 <b>Ontvangen items</b></div>
          <button class="nmd-close" id="nmd-close" title="Sluiten">\u2715</button>
        </div>
        <div class="nmd-sub">
          <b>${_rows.length}</b> van ${total} moederregels staan niet (meer) in de expediting-lijst en zijn dus al ontvangen/verwerkt in het ERP. Daarvan:
          <b>${_counts.poMissing}</b> \u00d7 volledig ontvangen (heel PO afgehandeld),
          <b>${_counts.lineDiff}</b> \u00d7 deels ontvangen (PO heeft nog open regels)${_counts.notation ? `, <b>${_counts.notation}</b> \u00d7 mogelijk formaatverschil (staat nog in expediting onder andere notatie)` : ''}.
        </div>
        <div class="nmd-tools">
          <input type="text" id="nmd-search" placeholder="Filter op leverancier, sleutel of omschrijving\u2026">
          <select id="nmd-cat" title="Filter op status">
            <option value="all">Alle statussen</option>
            <option value="poMissing">Volledig ontvangen</option>
            <option value="lineDiff">Deels ontvangen</option>
            <option value="notation">Mogelijk formaatverschil</option>
          </select>
          <button class="nmd-btn" id="nmd-copy">\uD83D\uDCCB Kopieer</button>
          <span class="nmd-count" id="nmd-count"></span>
        </div>
        <div class="nmd-tablewrap">
          <table class="nmd-table">
            <thead><tr>
              <th>Leverancier</th>
              <th>Vergelijkingssleutel (Kol C)</th>
              <th>Diagnose</th>
              <th>Nog open in expediting (dit PO)</th>
            </tr></thead>
            <tbody id="nmd-tbody"></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.getElementById('nmd-close').addEventListener('click', close);
    document.getElementById('nmd-search').addEventListener('input', _render);
    document.getElementById('nmd-cat').addEventListener('change', _render);
    document.getElementById('nmd-copy').addEventListener('click', _copy);
    document.addEventListener('keydown', _onKey);
    _render();
  }

  window.NoMatchDiag = { open: open, close: close };
})();
