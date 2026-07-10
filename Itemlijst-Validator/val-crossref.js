/**
 * val-crossref.js  –  IHC Expedite 2.0 · Itemlijst-Validator
 * Versie 2.0 – Bidirectionele cross-referentie
 *
 * Twee zoekstrategieën worden gecombineerd:
 *
 *  Strategie A  (forward  H → M)
 *    Itemlijst kolom H (Component / Mark&Label)
 *      ↔  Expediting kolom M (Unified Reference Code)
 *    Bij match: vult itemlijst kolommen C, D, E, F, G, K
 *
 *  Strategie B  (reverse  C+D → B+C+D)
 *    Itemlijst kolom C (IHC PO) + D (Item = "-1-1")
 *      ↔  Expediting kolom B (Order No) + C (Line No) + D (Release No)
 *    Bij match: vult itemlijst kolommen E, F, G, H, K
 *
 *  Sub-project filter (kolom B)
 *    Itemlijst B (Project, bijv. "YN1321")
 *      ↔  Expediting F (Sub Project ID)
 *    Matches uit een ander project worden genegeerd
 *    (als B leeg is, wordt de filter niet toegepast)
 *
 * Bestaande (niet-lege) cellen worden NOOIT overschreven.
 *
 * Zelflaadpatroon: validator.js laadt dit script dynamisch,
 * identiek aan val-mailgen.js.
 */

(function () {
  if (window.__valCrossrefLoaded) return;
  window.__valCrossrefLoaded = true;

  /* ─── Itemlijst-kolomnamen ────────────────────────────────────────────── */
  const IL = {
    B: 'Project',                  // Sub Project ID (filter)
    C: 'IHC PO',                   // te zoeken én in te vullen
    D: 'Item',                     // te zoeken én in te vullen
    E: 'Item description',         // in te vullen
    F: 'Quantity',                 // in te vullen
    G: 'Unit of measure',          // in te vullen
    H: 'Component (Mark/Label)',   // te zoeken én in te vullen
    K: 'Supplier',                 // in te vullen
  };

  /* ─── Expediting-kolomnamen ──────────────────────────────────────────── */
  const EXP = {
    ORDER   : 'Order No',                // B  →  IL.C
    LINE    : 'Line No',                 // C  →  deel IL.D
    RELEASE : 'Release No',              // D  →  deel IL.D
    SUBPROJ : 'Sub Project ID',          // F  ↔  IL.B (filter)
    SUPPLIER: 'Supplier Name',           // J  →  IL.K
    DESC    : 'Description',             // L  →  IL.E
    UREF    : 'Unified Reference Code',  // M  ↔  IL.H
    QTY     : 'Qty',                     // O  →  IL.F
    UOM     : 'Purch UoM',              // R  →  IL.G
  };

  /* ─── Hulpfuncties ───────────────────────────────────────────────────── */

  const trim = v => String(v ?? '').trim();

  /** Zet item-string "-1-1" om naar { line: "1", release: "1" } */
  function parseItem(itemStr) {
    const m = trim(itemStr).match(/^-?(\d+)-(\d+)$/);
    return m ? { line: m[1], release: m[2] } : null;
  }

  /** Bouw PO-sleutel: "3156010690|1|1" */
  function poKey(orderNo, line, release) {
    return `${trim(orderNo)}|${trim(line)}|${trim(release)}`;
  }

  /* ─── Lookup-tabellen bouwen ─────────────────────────────────────────── */

  /**
   * Leest het Expediting-bestand (ArrayBuffer) en bouwt:
   *   mapByMark  : { "2236-012" : expRowObject }   (Strategie A)
   *   mapByPO    : { "3156010690|1|1" : expRowObject } (Strategie B – vol)
   *   mapByOrder : { "3156010690" : [expRowObjects] }  (Strategie B – PO-only fallback)
   */
  function buildLookups(arrayBuffer) {
    const wb  = XLSX.read(arrayBuffer, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Vind de header-rij (bevat "Unified Reference Code")
    let headerIdx = -1;
    let colMap    = {};

    for (let i = 0; i < raw.length; i++) {
      if (raw[i].some(c => trim(c) === EXP.UREF)) {
        headerIdx = i;
        raw[i].forEach((cell, idx) => {
          const k = trim(cell);
          if (k) colMap[k] = idx;
        });
        break;
      }
    }

    if (headerIdx === -1) throw new Error(
      `Kolom "${EXP.UREF}" niet gevonden.\n` +
      `Is dit de juiste Expediting lijst?`
    );

    // Controleer vereiste kolommen
    const required = [EXP.ORDER, EXP.LINE, EXP.RELEASE, EXP.SUBPROJ,
                      EXP.SUPPLIER, EXP.DESC, EXP.QTY, EXP.UOM];
    const missing = required.filter(k => !(k in colMap));
    if (missing.length) throw new Error(
      `Vereiste kolom(men) niet gevonden: ${missing.join(', ')}`
    );

    // Converteer rijen naar objecten met kolomnamen als sleutel
    const headerRow  = raw[headerIdx];
    const expObjects = raw.slice(headerIdx + 1).map(arr => {
      const obj = {};
      headerRow.forEach((h, i) => { if (trim(h)) obj[trim(h)] = arr[i]; });
      return obj;
    }).filter(obj => trim(obj[EXP.ORDER]) || trim(obj[EXP.UREF]));

    const mapByMark  = {};   // mark → eerste expRow
    const mapByPO    = {};   // "order|line|release" → expRow
    const mapByOrder = {};   // "order" → [expRows]

    for (const row of expObjects) {
      const mark    = trim(row[EXP.UREF]);
      const orderNo = trim(row[EXP.ORDER]);
      const line    = trim(row[EXP.LINE]);
      const release = trim(row[EXP.RELEASE]);

      if (mark    && !mapByMark[mark])      mapByMark[mark] = row;
      if (orderNo) {
        const key = poKey(orderNo, line, release);
        if (!mapByPO[key])               mapByPO[key] = row;
        if (!mapByOrder[orderNo])        mapByOrder[orderNo] = [];
        mapByOrder[orderNo].push(row);
      }
    }

    return { mapByMark, mapByPO, mapByOrder, total: expObjects.length };
  }

  /* ─── Rijen verrijken ────────────────────────────────────────────────── */

  /**
   * Vul lege kolommen in op basis van één gevonden expediting-rij.
   * Overschrijft NOOIT bestaande waarden.
   */
  function applyMatch(ilRow, expRow) {
    const orderNo = trim(expRow[EXP.ORDER]);
    const line    = trim(expRow[EXP.LINE]);
    const release = trim(expRow[EXP.RELEASE]);
    const item    = (line && release) ? `-${line}-${release}` : line;

    const fill = (ilCol, val) => {
      if (!trim(ilRow[ilCol]) && trim(val)) ilRow[ilCol] = val;
    };

    fill(IL.C, orderNo);
    fill(IL.D, item);
    fill(IL.E, expRow[EXP.DESC]);
    fill(IL.F, expRow[EXP.QTY]);
    fill(IL.G, expRow[EXP.UOM]);
    fill(IL.H, expRow[EXP.UREF]);
    fill(IL.K, expRow[EXP.SUPPLIER]);
  }

  /**
   * Loop door alle itemlijst-rijen, pas beide strategieën toe.
   * Geeft uitgebreide statistieken terug.
   */
  function enrichRows(rows, lookups) {
    const { mapByMark, mapByPO, mapByOrder } = lookups;

    let stratA = 0, stratB = 0, noMatch = [], filtered = 0;

    for (const row of rows) {
      const mark    = trim(row[IL.H]);
      const ihcPo   = trim(row[IL.C]);
      const itemStr = trim(row[IL.D]);
      const subProj = trim(row[IL.B]);   // sub-project filter

      // Sla rijen over die al volledig zijn
      const needsFill = !trim(row[IL.E]) || !trim(row[IL.K]) ||
                        !ihcPo || !itemStr || !mark;
      if (!needsFill) continue;

      let expRow = null;
      let usedStrategy = null;

      /* ── Strategie A: H → M (forward) ── */
      if (mark) {
        const candidate = mapByMark[mark];
        if (candidate) {
          // Sub-project filter
          if (!subProj || trim(candidate[EXP.SUBPROJ]) === subProj) {
            expRow = candidate;
            usedStrategy = 'A';
          } else {
            filtered++;
          }
        }
      }

      /* ── Strategie B: C+D → B+C+D (reverse) ── */
      if (!expRow && ihcPo) {
        const parsed = parseItem(itemStr);

        if (parsed) {
          // Volledige match: PO + line + release
          const key = poKey(ihcPo, parsed.line, parsed.release);
          const candidate = mapByPO[key];
          if (candidate) {
            if (!subProj || trim(candidate[EXP.SUBPROJ]) === subProj) {
              expRow = candidate;
              usedStrategy = 'B-full';
            } else {
              filtered++;
            }
          }
        }

        // Fallback: alleen PO (eerste rij die overeenkomt met dit project)
        if (!expRow && mapByOrder[ihcPo]) {
          const candidates = mapByOrder[ihcPo];
          const candidate  = subProj
            ? candidates.find(r => trim(r[EXP.SUBPROJ]) === subProj)
            : candidates[0];
          if (candidate) {
            expRow = candidate;
            usedStrategy = 'B-po';
          }
        }
      }

      /* ── Vul in ── */
      if (expRow) {
        applyMatch(row, expRow);
        if (usedStrategy === 'A')                 stratA++;
        else                                      stratB++;
      } else if (mark || ihcPo) {
        noMatch.push(mark || ihcPo);
      }
    }

    return { stratA, stratB, noMatch, filtered };
  }

  /* ─── Modal UI ───────────────────────────────────────────────────────── */

  function css(el, styles) { Object.assign(el.style, styles); return el; }

  function makeBtn(text, primary) {
    const b = document.createElement('button');
    b.textContent = text;
    css(b, {
      padding: '9px 20px', borderRadius: '5px', cursor: 'pointer',
      fontFamily: 'Barlow, sans-serif', fontSize: '0.9rem',
      fontWeight: primary ? '700' : '400',
      background: primary ? 'var(--ihc-teal,#00B4D8)' : 'transparent',
      color:      primary ? 'var(--ihc-navy,#0A1628)'  : '#a0b0c8',
      border:     primary ? 'none' : '1px solid var(--ihc-steel,#1e3a6e)',
      transition: 'opacity .15s',
    });
    b.onmouseenter = () => (b.style.opacity = '0.82');
    b.onmouseleave = () => (b.style.opacity = '1');
    return b;
  }

  function showModal(rows, onComplete) {
    /* ── Overlay ── */
    const overlay = css(document.createElement('div'), {
      position: 'fixed', inset: '0',
      background: 'rgba(10,22,40,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '9999',
    });

    /* ── Card ── */
    const card = css(document.createElement('div'), {
      background: 'var(--ihc-mid,#0F2040)',
      border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '10px', padding: '28px 32px',
      maxWidth: '520px', width: '92%',
      color: 'var(--text,#e8edf5)', fontFamily: 'Barlow, sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    });

    const emptyC = rows.filter(r => !trim(r[IL.C]) && (trim(r[IL.H]) || trim(r[IL.C]))).length;
    const emptyH = rows.filter(r => !trim(r[IL.H]) && trim(r[IL.C])).length;
    const totalNeedsFill = rows.filter(r =>
      !trim(r[IL.E]) || !trim(r[IL.K]) || !trim(r[IL.C]) || !trim(r[IL.H])
    ).length;

    // Sub-project detectie
    const subProjects = [...new Set(rows.map(r => trim(r[IL.B])).filter(Boolean))];
    const spInfo = subProjects.length
      ? `<br>Sub-project filter actief: <b style="color:#e8edf5">${subProjects.join(', ')}</b>`
      : '';

    card.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--ihc-teal,#00B4D8);font-weight:700;">
        🔗 Cross-referentie – Expediting lijst
      </h3>
      <p style="margin:0 0 4px;font-size:0.875rem;color:#a0b0c8;line-height:1.55;">
        <b style="color:#e8edf5">${totalNeedsFill} rijen</b> hebben ontbrekende velden.
        ${spInfo}
      </p>

      <div style="background:rgba(0,180,216,0.07);border:1px solid rgba(0,180,216,0.2);
                  border-radius:6px;padding:11px 14px;margin:12px 0 18px;
                  font-size:0.8rem;color:#a0b0c8;line-height:1.75;">
        <b style="color:#e8edf5">Strategie A – forward (H → M)</b><br>
        Itemlijst <b>H</b> (Component/Mark) ↔ Expediting <b>M</b> (Unified Ref.)<br>
        <span style="color:#6b7a99">vult: C (IHC PO), D (Item), E (omschrijving), F (qty), G (eenheid), K (leverancier)</span>
        <br><br>
        <b style="color:#e8edf5">Strategie B – reverse (C+D → B+C+D)</b><br>
        Itemlijst <b>C</b> (IHC PO) + <b>D</b> (Item) ↔ Expediting <b>B+C+D</b> (Order + Line + Release)<br>
        <span style="color:#6b7a99">vult: E (omschrijving), F (qty), G (eenheid), H (Component/Mark), K (leverancier)</span>
      </div>

      <div id="xr-btnrow" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
      <div id="xr-status" style="margin-top:14px;font-size:0.82rem;line-height:1.55;
                                  min-height:1.2em;color:#a0b0c8;"></div>
    `;

    const btnRow   = card.querySelector('#xr-btnrow');
    const statusEl = card.querySelector('#xr-status');

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.xlsx,.xlsm';
    fileInput.style.display = 'none';

    const pickBtn = makeBtn('Expediting lijst kiezen', true);
    const skipBtn = makeBtn('Overslaan', false);
    btnRow.append(fileInput, pickBtn, skipBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }

    pickBtn.addEventListener('click', () => fileInput.click());
    skipBtn.addEventListener('click', () => { close(); onComplete(rows); });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      pickBtn.disabled = true; skipBtn.disabled = true;
      statusEl.style.color = '#a0b0c8';
      statusEl.textContent = '⏳ Expediting lijst inladen…';

      try {
        const buf     = await file.arrayBuffer();
        const lookups = buildLookups(buf);

        statusEl.textContent =
          `✓ ${lookups.total} regels geladen uit Expediting lijst. Koppelen…`;
        await new Promise(r => setTimeout(r, 150));

        const { stratA, stratB, noMatch, filtered } = enrichRows(rows, lookups);
        const total = stratA + stratB;

        // Resultaat tonen
        let html = '';
        if (total > 0) {
          html += `<span style="color:#4ade80">✓ ${total} rijen aangevuld</span>`;
          if (stratA) html += `<br>&nbsp;&nbsp;Strategie A (H→M): ${stratA} rijen`;
          if (stratB) html += `<br>&nbsp;&nbsp;Strategie B (C+D→PO): ${stratB} rijen`;
        } else {
          html += `<span style="color:#fbbf24">⚠ Geen rijen aangevuld</span>`;
        }
        if (filtered)
          html += `<br><span style="color:#94a3b8">↳ ${filtered} mogelijke matches overgeslagen (verkeerd sub-project)</span>`;
        if (noMatch.length) {
          const shown = noMatch.slice(0, 4).join(', ');
          const extra = noMatch.length > 4 ? ` +${noMatch.length - 4}` : '';
          html += `<br><span style="color:#fbbf24">⚠ Geen match gevonden (${noMatch.length}): ${shown}${extra}</span>`;
        }

        statusEl.innerHTML = html;
        await new Promise(r => setTimeout(r, 1800));
        close();
        onComplete(rows);

      } catch (err) {
        statusEl.style.color = '#f87171';
        statusEl.textContent = `✗ ${err.message}`;
        pickBtn.disabled = false; skipBtn.disabled = false;
      }
    });
  }

  /* ─── Publieke API ───────────────────────────────────────────────────── */

  window.ValCrossref = {
    /**
     * Controleer of cross-referentie nodig is en voer het uit.
     * Roept onComplete(rows) aan zodra klaar (met of zonder invullen).
     *
     * @param {Object[]} rows        Geparsede itemlijst-rijen (object per rij)
     * @param {Function} onComplete  Callback na afronding: fn(rows)
     */
    runIfNeeded(rows, onComplete) {
      if (!Array.isArray(rows) || rows.length === 0) return onComplete(rows);

      // Toon modal als er rijen zijn die aanvulling nodig hebben
      const needsRef = rows.some(r =>
        (!trim(r[IL.C]) && trim(r[IL.H])) ||   // Strat A: H bekend, C ontbreekt
        (trim(r[IL.C]) && !trim(r[IL.H]))  ||   // Strat B: C bekend, H ontbreekt
        (!trim(r[IL.E]) || !trim(r[IL.K]))       // Omschrijving of leverancier ontbreekt
      );

      if (!needsRef) return onComplete(rows);
      showModal(rows, onComplete);
    },

    // Laag-niveau API voor testen
    buildLookups,
    enrichRows,
  };

})();
