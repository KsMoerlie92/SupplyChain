/**
 * val-lparts.js  –  IHC Expedite 2.0 · Itemlijst-Validator
 * Versie 1.0 – "Maak L-Parts aan"-popup
 *
 * Toont, los van de validatiestap, alle regels die via de handmatige
 * koppel-popup (val-manual-match.js) zijn gemarkeerd voor "Nieuw
 * registreren" (localStorage-wachtrij "ihcQuickAddQueue"), en genereert
 * daaruit de EXACTE IFS-klembordtekst voor de view CPartsWithoutPurchOrd /
 * C_PARTS_WITHOUT_PURCH_ORD — geverifieerd tegen een echte IFS-export:
 *
 *   !IFS.COPYOBJECT
 *   $LU=CPartsWithoutPurchOrd
 *   $VIEW=C_PARTS_WITHOUT_PURCH_ORD
 *   $RECORD=!
 *   -$0:LINE_SEQ=1
 *   -$1:ORDER_NO=...
 *   -$2:LINE_NO=...
 *   -$3:RELEASE_NO=...
 *   -$5:VENDOR_PART_NO=...
 *   -$6:VENDOR_PART_DESC=...
 *   -$7:QTY=...
 *   -$8:BUY_UNIT_MEAS=...
 *   -
 *   ...
 *
 * Let op: kolom $4 (CONTRACT) bestaat in deze view maar wordt in de
 * geverifieerde export nooit meegestuurd — bewust overgeslagen, net als
 * $9 (CREATION), dat IFS zelf zet bij het aanmaken.
 *
 * Zelflaadpatroon, identiek aan val-crossref.js / val-manual-match.js.
 */

(function () {
  if (window.__valLPartsLoaded) return;
  window.__valLPartsLoaded = true;

  const QUEUE_KEY = 'ihcQuickAddQueue';
  const trim = v => String(v ?? '').trim();

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

  /**
   * Bouwt de exacte IFS-klembordtekst uit de wachtrij-items.
   * LINE_SEQ telt op over de HELE batch (1, 2, 3, ...), ongeacht van welke
   * PO/regel het item komt — exact zoals in de geverifieerde export.
   */
  function buildClipboardText(items, lu, view) {
    let buffer = `!IFS.COPYOBJECT\n$LU=${lu}\n$VIEW=${view}`;
    items.forEach((it, i) => {
      buffer += '\n$RECORD=!';
      buffer += `\n-$0:LINE_SEQ=${i + 1}`;
      buffer += `\n-$1:ORDER_NO=${it.po}`;
      buffer += `\n-$2:LINE_NO=${it.lineNo}`;
      buffer += `\n-$3:RELEASE_NO=${it.releaseNo}`;
      // $4 (CONTRACT) bewust overgeslagen — niet aanwezig in de geverifieerde export.
      buffer += `\n-$5:VENDOR_PART_NO=${it.item}`;
      buffer += `\n-$6:VENDOR_PART_DESC=${it.description}`;
      buffer += `\n-$7:QTY=${it.qty || '1'}`;
      buffer += `\n-$8:BUY_UNIT_MEAS=${it.uom || 'pcs'}`;
      buffer += '\n-';
    });
    buffer += '\n\n';
    return buffer;
  }

  function css(el, styles) { Object.assign(el.style, styles); return el; }

  function makeBtn(text, variant) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    const styles = {
      primary:   { background: 'var(--ihc-teal,#00B4D8)', color: 'var(--ihc-navy,#0A1628)', border: 'none', fontWeight: '700' },
      secondary: { background: 'transparent', color: '#a0b0c8', border: '1px solid var(--ihc-steel,#1e3a6e)', fontWeight: '400' },
      danger:    { background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', fontWeight: '400' },
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

  function openLPartsPopup() {
    let items = loadQueue();

    const overlay = css(document.createElement('div'), {
      position: 'fixed', inset: '0', background: 'rgba(10,22,40,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '9999',
    });
    const card = css(document.createElement('div'), {
      background: 'var(--ihc-mid,#0F2040)', border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '10px', padding: '26px 30px', maxWidth: '720px', width: '94%',
      maxHeight: '86vh', overflowY: 'auto',
      color: 'var(--text,#e8edf5)', fontFamily: 'Barlow, sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() { if (document.body.contains(overlay)) document.body.removeChild(overlay); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    function render() {
      if (!items.length) {
        card.innerHTML = `
          <h3 style="margin:0 0 10px;font-size:1.02rem;color:var(--ihc-teal,#00B4D8);font-weight:700;">➕ Maak L-Parts aan</h3>
          <p style="font-size:0.85rem;color:#a0b0c8;line-height:1.6">
            Er staan nog geen regels klaar. Markeer eerst regels als "Nieuw registreren"
            via de 🔗-knop bij een itemlijst-regel, of tijdens de handmatige-koppeling-popup.
          </p>
          <div style="margin-top:16px"><button id="lp-close" type="button"></button></div>
        `;
        const closeBtn = makeBtn('Sluiten', 'secondary');
        card.querySelector('div:last-child').replaceChild(closeBtn, card.querySelector('#lp-close'));
        closeBtn.addEventListener('click', close);
        return;
      }

      const rowsHtml = items.map((it, i) => `
        <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;
                    border-bottom:1px solid var(--ihc-steel,#1e3a6e);font-size:0.8rem">
          <b style="color:var(--ihc-teal,#00B4D8);min-width:90px">${escapeHtml(it.po)}</b>
          <span style="color:#6b7a99;min-width:50px">L${escapeHtml(it.lineNo)}/${escapeHtml(it.releaseNo)}</span>
          <span style="color:#e8edf5;min-width:120px">${escapeHtml(it.item)}</span>
          <span style="color:#a0b0c8;flex:1">${escapeHtml(it.description)}</span>
          <button type="button" data-i="${i}" class="lp-del" title="Verwijderen"
            style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.9rem">🗑️</button>
        </div>`).join('');

      card.innerHTML = `
        <h3 style="margin:0 0 4px;font-size:1.02rem;color:var(--ihc-teal,#00B4D8);font-weight:700;">
          ➕ Maak L-Parts aan (${items.length})
        </h3>
        <p style="margin:0 0 12px;font-size:0.82rem;color:#a0b0c8;line-height:1.5">
          Genereert de klembordtekst voor IFS-view <code>CPartsWithoutPurchOrd</code> —
          plak deze rechtstreeks in IFS (of in de <a href="../IFS-Migration-Tool/index.html"
          target="_blank" style="color:var(--ihc-teal,#00B4D8)">IFS Migration Tool</a> om nog te bewerken).
        </p>
        <div style="margin-bottom:14px;border:1px solid var(--ihc-steel,#1e3a6e);border-radius:6px;
                    max-height:220px;overflow-y:auto">${rowsHtml}</div>
        <textarea id="lp-preview" readonly style="width:100%;min-height:160px;font-family:'JetBrains Mono',monospace;
          font-size:0.72rem;background:var(--ihc-navy,#0A1628);color:#a0b0c8;border:1px solid var(--ihc-steel,#1e3a6e);
          border-radius:6px;padding:10px;margin-bottom:14px;white-space:pre;overflow:auto"></textarea>
        <div id="lp-btnrow" style="display:flex;gap:10px;flex-wrap:wrap"></div>
        <div id="lp-status" style="margin-top:10px;font-size:0.8rem;min-height:1.2em"></div>
      `;

      const preview = card.querySelector('#lp-preview');
      preview.value = buildClipboardText(items, 'CPartsWithoutPurchOrd', 'C_PARTS_WITHOUT_PURCH_ORD');

      card.querySelectorAll('.lp-del').forEach(btn => {
        btn.addEventListener('click', () => {
          items.splice(Number(btn.dataset.i), 1);
          saveQueue(items);
          render();
        });
      });

      const btnRow = card.querySelector('#lp-btnrow');
      const statusEl = card.querySelector('#lp-status');

      const copyBtn = makeBtn('📋 Kopieer naar klembord', 'primary');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(preview.value);
          statusEl.style.color = '#4ade80';
          statusEl.textContent = `✓ Gekopieerd — plak direct in IFS (view CPartsWithoutPurchOrd).`;
        } catch (e) {
          statusEl.style.color = '#ef4444';
          statusEl.textContent = '⚠ Kopiëren mislukt — selecteer en kopieer de tekst hierboven handmatig.';
        }
      });
      btnRow.appendChild(copyBtn);

      const clearBtn = makeBtn('🗑️ Wachtrij legen', 'danger');
      clearBtn.addEventListener('click', () => {
        if (!window.confirm('Alle klaargezette regels verwijderen?')) return;
        items = [];
        saveQueue(items);
        render();
      });
      btnRow.appendChild(clearBtn);

      const closeBtn = makeBtn('Sluiten', 'secondary');
      closeBtn.addEventListener('click', close);
      btnRow.appendChild(closeBtn);
    }

    render();
  }

  window.ValLParts = { openLPartsPopup, buildClipboardText, loadQueue };
})();
