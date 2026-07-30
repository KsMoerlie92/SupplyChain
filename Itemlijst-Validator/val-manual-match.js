/**
 * val-manual-match.js  –  IHC Expedite 2.0 · Itemlijst-Validator
 * Versie 1.0 – Handmatige koppeling voor rijen zonder automatische match
 *
 * Vult GEEN nieuwe matchlogica in naast val-crossref.js — dit script
 * vouwt zich om de bestaande, publieke `ValCrossref.runIfNeeded()` heen.
 * Nadat de automatische Strategie A/B klaar is, controleert dit script
 * welke rijen nog steeds geen Component/Mark (kolom H) hebben terwijl
 * het PO-nummer (kolom C) wél bekend is. Voor die rijen:
 *
 *   1. Kandidaten ophalen uit de Expediting-lijst met hetzelfde
 *      PO-nummer (kolom C), ongeacht line/release-match.
 *   2. Kandidaten sorteren op tekstgelijkenis tussen itemlijst-kolom E
 *      (Item description) en de Expediting-omschrijving — beste eerst.
 *   3. De gebruiker kiest zelf de juiste regel (of slaat over).
 *   4. Geen enkele kandidaat passend (of geen PO-nummer bekend)?
 *      → "Nieuw registreren" opent de IFS Migration Tool met het
 *      PO-nummer en omschrijving al klaargezet, plus een zelf in te
 *      vullen itemnummer.
 *
 * Zelflaadpatroon, identiek aan val-crossref.js / val-mailgen.js.
 * Vereist dat val-crossref.js AL geladen is (leunt op het publieke
 * ValCrossref-object: IL, EXP, applyMatch, buildLookups).
 */

(function () {
  if (window.__valManualMatchLoaded) return;
  window.__valManualMatchLoaded = true;

  const XR = window.ValCrossref;
  if (!XR) {
    console.warn('val-manual-match.js: ValCrossref (val-crossref.js) niet gevonden — laad dat script eerst.');
    return;
  }

  const { IL, EXP, applyMatch } = XR;
  const trim = v => String(v ?? '').trim();

  /* ─── Tekstgelijkenis (woord-overlap) ─────────────────────────────────── */

  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'van', 'een', 'de', 'het']);

  function tokenize(s) {
    return trim(s).toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  }

  /**
   * Eenvoudige Jaccard-achtige woord-overlapscore tussen twee teksten,
   * 0 (niets gemeenschappelijk) .. 1 (identieke woordenset).
   * Geen externe library nodig — voldoende onderscheidend voor
   * technische item-omschrijvingen (modelnamen, aantallen, varianten).
   */
  function similarity(a, b) {
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    if (!ta.size || !tb.size) return 0;
    let overlap = 0;
    ta.forEach(w => { if (tb.has(w)) overlap++; });
    const union = new Set([...ta, ...tb]).size;
    return union ? overlap / union : 0;
  }

  /**
   * Bouw en sorteer de kandidatenlijst voor één itemlijst-rij.
   * @returns {{candidate: Object, score: number}[]} aflopend gesorteerd
   */
  function rankCandidates(row, lookups) {
    const ihcPo = trim(row[IL.C]);
    if (!ihcPo || !lookups || !lookups.mapByOrder[ihcPo]) return [];
    const desc = row[IL.E];
    return lookups.mapByOrder[ihcPo]
      .map(candidate => ({ candidate, score: similarity(desc, candidate[EXP.DESC]) }))
      .sort((a, b) => b.score - a.score);
  }

  /* ─── UI-hulpfuncties (zelfde stijl als val-crossref.js) ─────────────── */

  function css(el, styles) { Object.assign(el.style, styles); return el; }

  function makeBtn(text, variant) {
    const b = document.createElement('button');
    b.textContent = text;
    const styles = {
      primary:   { background: 'var(--ihc-teal,#00B4D8)', color: 'var(--ihc-navy,#0A1628)', border: 'none', fontWeight: '700' },
      secondary: { background: 'transparent', color: '#a0b0c8', border: '1px solid var(--ihc-steel,#1e3a6e)', fontWeight: '400' },
      accent:    { background: 'var(--ihc-red,#D91F2C)', color: '#fff', border: 'none', fontWeight: '700' },
    }[variant || 'secondary'];
    css(b, {
      padding: '8px 16px', borderRadius: '5px', cursor: 'pointer',
      fontFamily: 'Barlow, sans-serif', fontSize: '0.85rem',
      transition: 'opacity .15s', ...styles,
    });
    b.onmouseenter = () => (b.style.opacity = '0.82');
    b.onmouseleave = () => (b.style.opacity = '1');
    return b;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ─── "Nieuw registreren" — overdracht naar IFS Migration Tool ────────── */

  const QUICK_ADD_KEY = 'ihcQuickAddQueue';

  function queueQuickAdd(row, itemNo) {
    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QUICK_ADD_KEY) || '[]'); } catch (e) {}
    queue.push({
      po: trim(row[IL.C]),
      item: trim(itemNo),
      description: trim(row[IL.E]),
      qty: trim(row[IL.F]),
      uom: trim(row[IL.G]),
      supplier: trim(row[IL.K]),
      ts: Date.now(),
    });
    localStorage.setItem(QUICK_ADD_KEY, JSON.stringify(queue));
  }

  /* ─── Modal: rij-voor-rij handmatige koppeling ────────────────────────── */

  function showManualMatchModal(rows, unresolved, lookups, onComplete) {
    let idx = 0;

    const overlay = css(document.createElement('div'), {
      position: 'fixed', inset: '0', background: 'rgba(10,22,40,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '9999',
    });
    const card = css(document.createElement('div'), {
      background: 'var(--ihc-mid,#0F2040)', border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '10px', padding: '26px 30px', maxWidth: '640px', width: '94%',
      maxHeight: '86vh', overflowY: 'auto',
      color: 'var(--text,#e8edf5)', fontFamily: 'Barlow, sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function finish() {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      onComplete(rows);
    }

    function renderRow() {
      if (idx >= unresolved.length) return finish();
      const row = unresolved[idx];
      const ranked = rankCandidates(row, lookups);
      const ihcPo = trim(row[IL.C]);

      const listHtml = ranked.length
        ? ranked.map(({ candidate, score }, i) => {
            const pct = Math.round(score * 100);
            const line = trim(candidate[EXP.LINE]);
            const release = trim(candidate[EXP.RELEASE]);
            return `
              <label class="vmm-cand${i === 0 ? ' vmm-best' : ''}" style="display:flex;gap:10px;align-items:flex-start;
                    padding:10px 12px;border-radius:6px;cursor:pointer;margin-bottom:6px;
                    border:1px solid ${i === 0 ? 'var(--ihc-teal,#00B4D8)' : 'var(--ihc-steel,#1e3a6e)'};
                    background:${i === 0 ? 'rgba(0,180,216,0.08)' : 'transparent'};">
                <input type="radio" name="vmm-pick" value="${i}" ${i === 0 ? 'checked' : ''} style="margin-top:3px">
                <span style="flex:1;font-size:0.82rem;line-height:1.5">
                  <b style="color:#e8edf5">${escapeHtml(candidate[EXP.DESC])}</b>
                  ${i === 0 && score > 0 ? `<span style="color:#4ade80;font-size:0.72rem;margin-left:6px">★ beste match (${pct}%)</span>` : ''}
                  <br><span style="color:#6b7a99">Line/Release: ${escapeHtml(line)}-${escapeHtml(release)}
                    &nbsp;·&nbsp; Qty: ${escapeHtml(trim(candidate[EXP.QTY]))} ${escapeHtml(trim(candidate[EXP.UOM]))}
                    &nbsp;·&nbsp; ${escapeHtml(trim(candidate[EXP.SUPPLIER]))}</span>
                </span>
              </label>`;
          }).join('')
        : `<p style="color:#fbbf24;font-size:0.85rem;margin:0 0 14px">
             ⚠ Geen regels gevonden voor PO ${escapeHtml(ihcPo || '(onbekend)')} in de geladen Expediting-lijst.
           </p>`;

      card.innerHTML = `
        <h3 style="margin:0 0 4px;font-size:1.02rem;color:var(--ihc-teal,#00B4D8);font-weight:700;">
          🔗 Handmatige koppeling (${idx + 1}/${unresolved.length})
        </h3>
        <p style="margin:0 0 14px;font-size:0.82rem;color:#a0b0c8;line-height:1.5;">
          Deze itemlijst-regel kon niet automatisch gekoppeld worden.
          <br><b style="color:#e8edf5">${escapeHtml(row[IL.D] || '—')}</b> —
          ${escapeHtml(row[IL.E] || '(geen omschrijving)')}
          ${ihcPo ? `<br>PO: <b style="color:#e8edf5">${escapeHtml(ihcPo)}</b>` : ''}
        </p>
        <div id="vmm-list" style="margin-bottom:16px">${listHtml}</div>
        <div id="vmm-btnrow" style="display:flex;gap:10px;flex-wrap:wrap"></div>
        <div id="vmm-status" style="margin-top:10px;font-size:0.8rem;min-height:1.2em"></div>
      `;

      const btnRow = card.querySelector('#vmm-btnrow');
      const statusEl = card.querySelector('#vmm-status');

      if (ranked.length) {
        const confirmBtn = makeBtn('✓ Koppel deze regel', 'primary');
        confirmBtn.addEventListener('click', () => {
          const picked = card.querySelector('input[name="vmm-pick"]:checked');
          const chosen = ranked[picked ? Number(picked.value) : 0];
          applyMatch(row, chosen.candidate);
          idx++;
          renderRow();
        });
        btnRow.appendChild(confirmBtn);
      }

      const skipBtn = makeBtn('Overslaan', 'secondary');
      skipBtn.addEventListener('click', () => { idx++; renderRow(); });
      btnRow.appendChild(skipBtn);

      const addNewBtn = makeBtn('➕ Nieuw registreren (IFS Migration Tool)', 'accent');
      addNewBtn.addEventListener('click', () => {
        const itemNo = window.prompt(
          `Nieuw itemnummer voor deze regel (PO ${ihcPo || '(onbekend)'}):`,
          ''
        );
        if (itemNo === null || !trim(itemNo)) return;
        queueQuickAdd(row, itemNo);
        statusEl.style.color = '#4ade80';
        statusEl.textContent = `✓ Klaargezet voor IFS Migration Tool (item ${trim(itemNo)}). Wordt in een nieuw tabblad geopend…`;
        window.open('../IFS-Migration-Tool/index.html', '_blank');
        setTimeout(() => { idx++; renderRow(); }, 1200);
      });
      btnRow.appendChild(addNewBtn);
    }

    renderRow();
  }

  /* ─── Inhaken op ValCrossref.runIfNeeded ─────────────────────────────── */

  const originalRunIfNeeded = XR.runIfNeeded;

  XR.runIfNeeded = function (rows, onComplete) {
    originalRunIfNeeded(rows, (rowsAfterAuto) => {
      const unresolved = rowsAfterAuto.filter(r => trim(r[IL.C]) && !trim(r[IL.H]));
      if (!unresolved.length) return onComplete(rowsAfterAuto);

      const lookups = XR._lastLookups;
      if (!lookups) {
        // Geen Expediting-lijst geladen tijdens de automatische stap
        // (gebruiker koos "Overslaan") — er is dan niets om kandidaten
        // uit op te halen. Bied per rij alleen "Nieuw registreren" aan.
        showManualMatchModal(rowsAfterAuto, unresolved, null, onComplete);
        return;
      }
      showManualMatchModal(rowsAfterAuto, unresolved, lookups, onComplete);
    });
  };

  // Publieke API — vooral handig voor testen
  window.ValManualMatch = {
    rankCandidates, similarity, queueQuickAdd, QUICK_ADD_KEY,
    // Rechtstreeks aan te roepen met al-gebouwde lookups (bv. vanuit de
    // centrale expeditinglijst die de validatorpagina al heeft geladen),
    // zonder de upload-gedreven ValCrossref.runIfNeeded-flow te doorlopen.
    showManualMatchModal,
  };

})();
