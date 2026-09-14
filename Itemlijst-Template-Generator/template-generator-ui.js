/**
 * template-generator-ui.js  –  IHC Expedite 2.0 · Itemlijst Template Generator
 * Bouwt de interactie bovenop template-generator.js (state/logica) en
 * lparts-numbering.js (systeemnummers).
 */
(function () {
  const TG = window.TemplateGenerator;
  const LN = window.LPartsNumbering;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const trim = v => String(v ?? '').trim();

  let currentPO = '';

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, cls) {
    const el = $('tg-status');
    if (!el) return;
    el.innerHTML = `<span class="${cls || 'info-msg'}">${msg}</span>`;
  }

  /* ─── Resultatenlijst renderen ──────────────────────────────────────── */

  function renderResults() {
    const { expRows, selected, extraItems } = TG.getState();
    const wrap = $('tg-results');
    if (!wrap) return;

    if (!expRows.length && !extraItems.length) {
      wrap.innerHTML = '<p class="tg-empty">Nog geen PO opgezocht.</p>';
      $('tg-actions').style.display = 'none';
      return;
    }
    $('tg-actions').style.display = 'flex';

    const C = window.ExpeditingCore.COLS;
    const poRowsHtml = expRows.map((r, i) => {
      const checked = selected.has(i) ? 'checked' : '';
      const lineNo = trim(r['Line No']), releaseNo = trim(r['Release No']);
      const uref = trim(r[C.uref]);
      return `
        <label class="tg-row">
          <input type="checkbox" data-i="${i}" class="tg-check" ${checked}>
          <span class="tg-col tg-col-line">${esc(lineNo)}-${esc(releaseNo)}</span>
          <span class="tg-col tg-col-desc">${esc(trim(r[C.desc]))}</span>
          <span class="tg-col tg-col-qty">${esc(trim(r[C.qty]))} ${esc(trim(r[C.uom] || r['Purch UoM']))}</span>
          <span class="tg-col tg-col-supplier">${esc(trim(r[C.supplier]))}</span>
          <span class="tg-col tg-col-mark">${uref ? esc(uref) : '<i>nog geen merk</i>'}</span>
        </label>`;
    }).join('');

    const extraRowsHtml = extraItems.map((it, i) => `
      <div class="tg-row tg-row-extra">
        <span class="tg-col tg-col-line">L${esc(it.lineNo)}/${esc(it.releaseNo)}</span>
        <span class="tg-col tg-col-desc">${esc(it.description)}</span>
        <span class="tg-col tg-col-qty">${esc(it.qty)} ${esc(it.uom)}</span>
        <span class="tg-col tg-col-supplier"><i>nieuw onderdeel</i></span>
        <span class="tg-col tg-col-mark">${esc(it.itemNo)}</span>
        <button type="button" class="tg-del" data-idx="${i}" title="Verwijderen">🗑️</button>
      </div>`).join('');

    wrap.innerHTML = `
      ${expRows.length ? `
        <div class="tg-section-label">PO-regels (${expRows.length}) — vink aan wat in de template moet</div>
        <div class="tg-list">${poRowsHtml}</div>
      ` : ''}
      ${extraItems.length ? `
        <div class="tg-section-label">Nieuwe onderdelen — niet op de PO, worden L-Parts (${extraItems.length})</div>
        <div class="tg-list">${extraRowsHtml}</div>
      ` : ''}
    `;

    wrap.querySelectorAll('.tg-check').forEach(cb => {
      cb.addEventListener('change', () => { TG.toggleSelected(Number(cb.dataset.i)); updateCount(); });
    });
    wrap.querySelectorAll('.tg-del').forEach(btn => {
      btn.addEventListener('click', () => { TG.removeExtraItem(Number(btn.dataset.idx)); renderResults(); updateCount(); });
    });

    updateCount();
  }

  function updateCount() {
    const { selected, extraItems } = TG.getState();
    const n = selected.size + extraItems.length;
    $('tg-count').textContent = n ? `${n} regel(s) klaar voor de template` : 'Nog geen regels geselecteerd';
    $('btn-tg-generate').disabled = n === 0;
    $('btn-tg-mail').disabled = n === 0;
  }

  /* ─── PO zoeken ──────────────────────────────────────────────────────── */

  async function doSearch() {
    const po = trim($('tg-po-input').value);
    if (!po) { setStatus('Voer eerst een PO-nummer in.', 'error-msg'); return; }
    setStatus('⏳ Zoeken in de bedrijfsbrede Expediting-lijst…');
    const { rows, error } = await TG.searchPO(po);
    if (error) { setStatus(error, 'error-msg'); TG.setExpRows([]); renderResults(); return; }
    currentPO = po;
    TG.setExpRows(rows);
    // Standaard alles aanvinken — team kan uitzetten wat niet in de template hoeft.
    TG.selectAll();
    renderResults();
    setStatus(`✓ ${rows.length} regel(s) gevonden voor PO ${esc(po)}.`, 'success-msg');
  }

  /* ─── Nieuw onderdeel toevoegen (L-Part) ─────────────────────────────── */

  function addExtraItem() {
    if (!currentPO) { setStatus('Zoek eerst een PO op voordat je een nieuw onderdeel toevoegt.', 'error-msg'); return; }
    if (!LN) { setStatus('L-Parts-nummering niet geladen.', 'error-msg'); return; }

    const lineRelease = window.prompt('Onder welke bestaande Order-regel (Line-Release) valt dit nieuwe onderdeel?\nBijvoorbeeld: 1-1', '');
    if (lineRelease === null || !trim(lineRelease)) return;
    const m = trim(lineRelease).match(/^(\d+)[-\/](\d+)$/);
    if (!m) { window.alert('Ongeldig formaat — gebruik Line-Release, bv. 1-1.'); return; }
    const [, lineNo, releaseNo] = m;

    const description = window.prompt('Omschrijving van het nieuwe onderdeel:', '');
    if (description === null || !trim(description)) return;
    const qty = window.prompt('Aantal:', '1') || '1';
    const uom = window.prompt('Eenheid (bv. pcs, Meter):', 'pcs') || 'pcs';

    const itemNo = LN.getNext(currentPO, lineNo, releaseNo, key => window.prompt(
      `Nog geen basis-componentnummer bekend voor deze Order-regel (Line ${lineNo}/${releaseNo}).\n` +
      `Voer het basisnummer in (bv. 2253-000) — volgende nieuwe onderdelen op ` +
      `dezelfde Order-regel krijgen dan automatisch {basisnummer}.01, .02, .03, ...`,
      ''
    ));
    if (itemNo === null) return;

    TG.addExtraItem({ po: currentPO, lineNo, releaseNo, itemNo, description: trim(description), qty: trim(qty), uom: trim(uom) });
    renderResults();
    setStatus(`✓ Nieuw onderdeel toegevoegd met systeemnummer ${esc(itemNo)}.`, 'success-msg');
  }

  /* ─── Template genereren (download) ──────────────────────────────────── */

  async function generateXlsx() {
    const rows = TG.buildTemplateRows(currentPO);
    if (!rows.length) return;
    if (!window.TemplateXlsxWriter) { setStatus('Template-schrijfmodule niet geladen.', 'error-msg'); return; }

    const filename = `${currentPO}_Itemlijst_template.xlsx`;
    setStatus('⏳ Template opbouwen…');
    try {
      await window.TemplateXlsxWriter.downloadFilledTemplate(TG.IL_COLS, rows, filename);
      setStatus(`✓ ${filename} gedownload — met behoud van de opmaak, tabel en keuzelijsten.`, 'success-msg');
    } catch (err) {
      setStatus(`⚠ ${err.message}`, 'error-msg');
    }
  }

  /* ─── Unieke link ─────────────────────────────────────────────────────── */

  function generateLink() {
    if (!currentPO) return;
    const link = TG.buildShareLink(currentPO);
    const box = $('tg-link-box');
    box.style.display = 'block';
    box.querySelector('#tg-link-value').value = link;
  }

  async function copyLink() {
    const val = $('tg-link-value').value;
    try { await navigator.clipboard.writeText(val); setStatus('✓ Link gekopieerd.', 'success-msg'); }
    catch (e) { setStatus('Kopiëren mislukt — selecteer de link handmatig.', 'error-msg'); }
  }

  /* ─── Init ────────────────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-tg-search').addEventListener('click', doSearch);
    $('tg-po-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    $('btn-tg-add-extra').addEventListener('click', addExtraItem);
    $('btn-tg-generate').addEventListener('click', generateXlsx);
    $('btn-tg-mail').addEventListener('click', () => {
      const rows = TG.buildTemplateRows(currentPO);
      if (!rows.length) return;
      if (!window.TemplateMail) { setStatus('Mail-module niet geladen.', 'error-msg'); return; }
      window.TemplateMail.open(currentPO, rows);
    });
    $('btn-tg-link').addEventListener('click', generateLink);
    $('btn-tg-link-copy').addEventListener('click', copyLink);

    renderResults();

    // Kwam de pagina open via een gedeelde link (?po=...)? Dan het PO-nummer
    // automatisch invullen en meteen opzoeken.
    const qp = new URLSearchParams(window.location.search);
    if (qp.has('po')) {
      const decoded = TG.decodePO(qp.get('po'));
      if (decoded) { $('tg-po-input').value = decoded; doSearch(); }
    }
  });
})();
