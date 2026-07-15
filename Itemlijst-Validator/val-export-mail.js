/**
 * val-export-mail.js  –  IHC Expedite 2.0 · Itemlijst-Validator
 *
 * Vervangt de "Export naar Excel" download door een mail-popup die
 * een kant-en-klare .eml klaarzet voor de Power Automate koppeling.
 *
 * Stroom:
 *   1. Gebruiker klikt "Versturen naar Moederlijst"
 *   2. Popup toont de vooraf ingevulde mail ter controle
 *   3. Gebruiker klikt "Mail klaarzetten"
 *   4. .eml downloadt → dubbelklik opent in Outlook als bewerkbaar concept
 *      (X-Unsent:1) met bijlage erin → gebruiker bewerkt evt. en klikt Verzenden
 *   5. Power Automate pikt de mail op via het subject-sleutelwoord "Itemlijst"
 *      en schrijft de bijlage terug naar de Moederlijst
 *
 * Subject-formaat:  "{Kolom A}  Itemlijst  {Kolom K}"
 *   Voorbeeld:      "1321-010 Itemlijst Alfa Laval"
 *
 * Bijlage-bestandsnaam:  "{Kolom A}_Itemlijst_{Kolom K}.xlsx"
 *
 * Ontvanger:  m.wendels@royalihc.com
 *
 * Zelflaadpatroon: validator.js laadt dit script dynamisch,
 * identiek aan val-mailgen.js / val-crossref.js.
 */

(function () {
  if (window.__valExportMailLoaded) return;
  window.__valExportMailLoaded = true;

  /* ─── Configuratie ────────────────────────────────────────────────────── */

  const RECIPIENT  = 'm.wendels@royalihc.com';
  const TRIGGER_KW = 'ITEMLIJST';       // Power Automate trigger-sleutelwoord (was 'Itemlijst')
  const TABLE_NAME = 'Itemlijst';       // naam van de Excel-tabel (voor Power Automate)
  const SENDER_LBL = 'IHC Expedite 2.0';

  // Itemlijst-kolomnamen die het onderwerp bepalen
  const COL_A = 'Delivery ref.';   // → eerste deel subject
  const COL_K = 'Supplier';        // → derde deel subject

  // Kolomvolgorde voor de Excel-bijlage (zelfde als origineel)
  const EXPORT_COLS = [
    'Delivery ref.', 'Project', 'IHC PO', 'Item', 'Item description',
    'Quantity', 'Unit of measure', 'Component (Mark/Label)', 'Code supplier',
    'Serial number', 'Supplier', 'Make', 'Material', 'Country of origin',
    'Hs-code', 'Value pc (EUR)', 'Value total', 'Collo', 'Type of packaging',
    'Length cm', 'Width cm', 'Height cm', 'Volume m3',
    'Weight gross (collo)', 'Weight nett (collo)', 'Dangerous Goods?',
    'Inspection Level',
  ];

  /* ─── Hulpfuncties ────────────────────────────────────────────────────── */

  const trim = v => String(v ?? '').trim();

  /** Meest voorkomende niet-lege waarde in een kolom */
  function dominant(rows, col) {
    const counts = {};
    for (const r of rows) {
      const v = trim(r[col]);
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }

  /** Bouw het e-mailonderwerp */
  function buildSubject(rows) {
    const delivRef = dominant(rows, COL_A);
    const supplier = dominant(rows, COL_K);
    return [delivRef, TRIGGER_KW, supplier].filter(Boolean).join(' ');
  }

  /** Bestandsnaam voor de bijlage */
  function buildFilename(rows) {
    const delivRef = dominant(rows, COL_A).replace(/[/\\:*?"<>|]/g, '-');
    const supplier = dominant(rows, COL_K).replace(/[/\\:*?"<>|]/g, '-');
    return [delivRef, TRIGGER_KW, supplier].filter(Boolean).join(' ') + '.xlsx';
  }

  /** Genereer Excel (base64) via SheetJS */
  function rowsToXlsxBase64(rows) {
    // Bepaal welke headers daadwerkelijk in de data voorkomen
    const presentCols = EXPORT_COLS.filter(h =>
      rows.some(r => trim(r[h]))
    );
    // Voeg kolommen toe die in de data zitten maar niet in EXPORT_COLS
    const extraCols = [];
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (!presentCols.includes(k) && !extraCols.includes(k) && trim(row[k])) {
          extraCols.push(k);
        }
      }
    }
    const allCols = [...presentCols, ...extraCols];

    // Kolomnamen uniek + niet-leeg maken. Moet vóór de opbouw gebeuren: de kopcel
    // en de tabelkolomnaam moeten identiek zijn, anders wil Excel het bestand repareren.
    const seenName = Object.create(null);
    const colNames = allCols.map((c, i) => {
      let n = trim(c) || ('Kolom' + (i + 1));
      if (seenName[n.toLowerCase()]) { let k = 2; while (seenName[(n + '_' + k).toLowerCase()]) k++; n = n + '_' + k; }
      seenName[n.toLowerCase()] = true;
      return n;
    });

    const wsData = [
      colNames,
      ...rows.map(r => allCols.map(h => r[h] ?? '')),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Kolombreedtes op basis van inhoud
    ws['!cols'] = allCols.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map(r => trim(r[h]).length).slice(0, 50)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
    });

    XLSX.utils.book_append_sheet(wb, ws, TRIGGER_KW);

    // Als echte Excel-tabel wegschrijven (nodig voor Power Automate).
    // Lukt dat niet, dan valt hij terug op een gewoon werkblad i.p.v. te crashen.
    try {
      return sheetToTableXlsxBase64(wb, colNames, rows.length);
    } catch (e) {
      console.warn('Tabel-injectie mislukt, export als gewoon werkblad:', e);
      return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    }
  }

  /**
   * SheetJS schrijft geen echte Excel-tabel (ListObject). Die injecteren we hier
   * zelf in de xlsx-zip via XLSX.CFB: table1.xml + relatie + content-type + tableParts.
   * Resultaat: een tabel met de naam TABLE_NAME, zoals Ctrl+T in Excel.
   */
  function sheetToTableXlsxBase64(wb, cols, nRows) {
    const xesc = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // cols zijn al uniek + niet-leeg gemaakt in rowsToXlsxBase64 (kop == tabelkolom)
    const names = cols;

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const cfb = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
    const find = (p) => {
      const i = cfb.FullPaths.findIndex(f => f.replace(/^Root Entry\//, '') === p);
      return i < 0 ? null : cfb.FileIndex[i];
    };
    const readTxt = (p) => {
      const f = find(p); if (!f) throw new Error('ontbrekend deel: ' + p);
      const c = f.content;
      let s = ''; for (let i = 0; i < c.length; i++) s += String.fromCharCode(c[i]);
      return decodeURIComponent(escape(s));   // UTF-8 → tekst
    };
    const write = (p, s) => {
      const u = unescape(encodeURIComponent(s));            // tekst → UTF-8
      const a = new Uint8Array(u.length);
      for (let i = 0; i < u.length; i++) a[i] = u.charCodeAt(i) & 0xFF;
      XLSX.CFB.utils.cfb_add(cfb, '/' + p, a);
    };

    const lastCol = XLSX.utils.encode_col(names.length - 1);
    const ref = 'A1:' + lastCol + Math.max(nRows + 1, 2);   // minimaal 1 (lege) datarij

    // 1. de tabel zelf
    const tcols = names.map((n, i) => '<tableColumn id="' + (i + 1) + '" name="' + xesc(n) + '"/>').join('');
    write('xl/tables/table1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" ' +
      'name="' + TABLE_NAME + '" displayName="' + TABLE_NAME + '" ref="' + ref + '" totalsRowShown="0">' +
      '<autoFilter ref="' + ref + '"/>' +
      '<tableColumns count="' + names.length + '">' + tcols + '</tableColumns>' +
      '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" ' +
      'showRowStripes="1" showColumnStripes="0"/></table>');

    // 2. werkblad koppelen (eigen autoFilter weg — de tabel regelt dat zelf)
    let sheet = readTxt('xl/worksheets/sheet1.xml').replace(/<autoFilter[^>]*\/>/, '');
    sheet = sheet.replace('</worksheet>',
      '<tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>');
    write('xl/worksheets/sheet1.xml', sheet);

    // 3. relatie werkblad → tabel
    write('xl/worksheets/_rels/sheet1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" ' +
      'Target="../tables/table1.xml"/></Relationships>');

    // 4. content-type registreren
    write('[Content_Types].xml', readTxt('[Content_Types].xml').replace('</Types>',
      '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>'));

    return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'base64', compression: true });
  }

  /** Bouw de e-mailtekst (body) */
  function buildBody(rows, subject) {
    const delivRef = dominant(rows, COL_A);
    const supplier = dominant(rows, COL_K);
    const collos   = [...new Set(rows.map(r => trim(r['Collo'])).filter(Boolean))];
    const totalVal = rows.reduce((s, r) => {
      const v = parseFloat(String(r['Value total'] ?? '').replace(',', '.'));
      return s + (isNaN(v) ? 0 : v);
    }, 0);

    return [
      `Geachte,`,
      ``,
      `Bijgesloten de gevalideerde itemlijst voor verwerking in de Moederlijst.`,
      ``,
      `Delivery ref. : ${delivRef || '–'}`,
      `Leverancier   : ${supplier || '–'}`,
      `Aantal regels : ${rows.length}`,
      collos.length ? `Collo nummers : ${collos.join(', ')}` : null,
      totalVal > 0  ? `Totaalwaarde  : EUR ${totalVal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : null,
      ``,
      `Onderwerp bevat "${TRIGGER_KW}" als trigger voor Power Automate.`,
      ``,
      `Automatisch gegenereerd door IHC Expedite 2.0.`,
    ].filter(l => l !== null).join('\r\n');
  }

  /** Genereer .eml bestandsinhoud (RFC 2822 + MIME multipart) */
  function buildEml(to, subject, body, xlsxBase64, attachFilename) {
    const boundary = 'IHC_EXPEDITE_' + Date.now().toString(36).toUpperCase();
    // RFC 2045: base64-regels van max 76 tekens
    const b64Lines = (xlsxBase64.match(/.{1,76}/g) || [xlsxBase64]).join('\r\n');

    // Encoded subject voor non-ASCII ondersteuning
    const encSubject = subject;  // ASCII-veilig voor typische delivery refs + namen

    return [
      `To: ${to}`,
      `Subject: ${encSubject}`,
      `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
      `MIME-Version: 1.0`,
      `X-Unsent: 1`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      `X-Generator: IHC-Expedite-2.0`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
      `Content-Disposition: attachment; filename="${attachFilename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      b64Lines,
      ``,
      `--${boundary}--`,
    ].join('\r\n');
  }

  /** Download een blob als bestand */
  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: filename,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ─── Modal: compose-venster ──────────────────────────────────────────── */

  function css(el, s) { Object.assign(el.style, s); return el; }

  function field(label, value, editable = false) {
    const wrap = css(document.createElement('div'), {
      borderBottom: '1px solid rgba(30,58,110,0.5)',
      padding: '8px 0', display: 'flex', gap: '10px', alignItems: 'flex-start',
    });
    const lbl = css(document.createElement('span'), {
      minWidth: '88px', color: 'var(--ihc-muted,#6b7a99)',
      fontSize: '0.8rem', paddingTop: '2px', flexShrink: '0',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      fontFamily: 'Barlow Condensed, Barlow, sans-serif',
    });
    lbl.textContent = label;

    if (editable) {
      const inp = css(document.createElement(
        value.length > 80 ? 'textarea' : 'input'
      ), {
        flex: '1', background: 'transparent',
        color: 'var(--text,#e8edf5)', border: 'none', outline: 'none',
        fontSize: '0.88rem', fontFamily: 'Barlow, sans-serif',
        resize: 'vertical', lineHeight: '1.5',
      });
      inp.value = value;
      if (inp.tagName === 'TEXTAREA') inp.rows = 4;
      wrap.append(lbl, inp);
      wrap._input = inp;
    } else {
      const val = css(document.createElement('span'), {
        flex: '1', color: 'var(--text,#e8edf5)',
        fontSize: '0.88rem', lineHeight: '1.5', wordBreak: 'break-word',
      });
      val.textContent = value;
      wrap.append(lbl, val);
    }
    return wrap;
  }

  function showComposeModal(rows, onSend) {
    /* ── Data voorbereiden ── */
    const subject  = buildSubject(rows);
    const filename = buildFilename(rows);
    const body     = buildBody(rows, subject);
    const collos   = [...new Set(rows.map(r => trim(r['Collo'])).filter(Boolean))];

    /* ── Overlay ── */
    const overlay = css(document.createElement('div'), {
      position: 'fixed', inset: '0',
      background: 'rgba(10,22,40,0.90)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '9999', padding: '16px',
    });

    /* ── Window ── */
    const win = css(document.createElement('div'), {
      background: 'var(--ihc-mid,#0F2040)',
      border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '10px', width: '100%', maxWidth: '580px',
      maxHeight: '92vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Barlow, sans-serif',
      boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
    });

    /* ── Titelbalk ── */
    const titlebar = css(document.createElement('div'), {
      background: 'var(--ihc-navy,#0A1628)',
      borderBottom: '1px solid var(--ihc-steel,#1e3a6e)',
      padding: '12px 18px', display: 'flex',
      alignItems: 'center', gap: '10px',
    });
    titlebar.innerHTML = `
      <span style="font-size:1.05rem;color:var(--ihc-teal,#00B4D8);">📧</span>
      <span style="font-weight:700;color:var(--text,#e8edf5);font-size:0.95rem;">
        Mail klaarzetten – Moederlijst update
      </span>
      <span style="margin-left:auto;font-size:0.75rem;color:var(--ihc-muted,#6b7a99);">
        via Power Automate
      </span>
    `;

    /* ── Body (velden) ── */
    const body_el = css(document.createElement('div'), {
      padding: '0 18px', overflowY: 'auto', flex: '1',
    });

    const fTo      = field('Aan',       RECIPIENT);
    const fFrom    = field('Van',       'Je eigen Outlook-account');
    const fSubjWrap = field('Onderwerp', subject, true);
    const fSubjInp  = fSubjWrap._input;

    /* Bijlage-badge */
    const attachWrap = css(document.createElement('div'), {
      borderBottom: '1px solid rgba(30,58,110,0.5)',
      padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px',
    });
    const attachLbl = css(document.createElement('span'), {
      minWidth: '88px', color: 'var(--ihc-muted,#6b7a99)',
      fontSize: '0.8rem', textTransform: 'uppercase',
      letterSpacing: '0.04em',
      fontFamily: 'Barlow Condensed, Barlow, sans-serif',
    });
    attachLbl.textContent = 'Bijlage';
    const attachBadge = css(document.createElement('span'), {
      background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)',
      borderRadius: '4px', padding: '3px 10px',
      color: 'var(--ihc-teal,#00B4D8)', fontSize: '0.8rem',
      fontFamily: 'JetBrains Mono, monospace',
    });
    attachBadge.textContent = `📎 ${filename}`;
    attachWrap.append(attachLbl, attachBadge);

    /* Info-lijn */
    const infoLine = css(document.createElement('div'), {
      padding: '10px 0 4px',
      fontSize: '0.78rem', color: 'var(--ihc-muted,#6b7a99)',
      lineHeight: '1.6',
    });
    infoLine.innerHTML =
      `<b style="color:#94a3b8">${rows.length} regels</b>` +
      (collos.length ? ` &nbsp;·&nbsp; Collo: <b style="color:#94a3b8">${collos.join(', ')}</b>` : '') +
      `<br>` +
      `Onderwerp bevat <b style="color:var(--ihc-teal,#00B4D8)">"${TRIGGER_KW}"</b> ` +
      `als Power Automate trigger.`;

    /* Body-preview */
    const bodyPreviewWrap = field('Bericht', body);

    body_el.append(fTo, fFrom, fSubjWrap, attachWrap, infoLine, bodyPreviewWrap);

    /* ── Footer ── */
    const footer = css(document.createElement('div'), {
      padding: '14px 18px',
      borderTop: '1px solid var(--ihc-steel,#1e3a6e)',
      display: 'flex', gap: '10px', alignItems: 'center',
    });

    const sendBtn = css(document.createElement('button'), {
      background: 'var(--ihc-teal,#00B4D8)', color: 'var(--ihc-navy,#0A1628)',
      border: 'none', borderRadius: '6px', padding: '10px 22px',
      fontWeight: '700', fontSize: '0.92rem', cursor: 'pointer',
      fontFamily: 'Barlow, sans-serif', display: 'flex', gap: '7px',
      alignItems: 'center',
    });
    sendBtn.innerHTML = '📨 Mail klaarzetten';

    const cancelBtn = css(document.createElement('button'), {
      background: 'transparent', color: '#a0b0c8',
      border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '6px', padding: '10px 18px',
      fontSize: '0.88rem', cursor: 'pointer',
      fontFamily: 'Barlow, sans-serif',
    });
    cancelBtn.textContent = 'Annuleren';

    const statusMsg = css(document.createElement('span'), {
      marginLeft: 'auto', fontSize: '0.8rem', color: '#a0b0c8',
    });

    footer.append(sendBtn, cancelBtn, statusMsg);
    win.append(titlebar, body_el, footer);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    /* ── Events ── */
    const close = () => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    };
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    sendBtn.addEventListener('click', () => {
      sendBtn.disabled = true;
      cancelBtn.disabled = true;
      sendBtn.innerHTML = '⏳ Genereren…';
      statusMsg.textContent = '';

      try {
        // Gebruik het (evt. door gebruiker bijgewerkte) onderwerp
        const finalSubject = trim(fSubjInp?.value || subject) || subject;

        const xlsxB64  = rowsToXlsxBase64(rows);
        const emlBody  = buildBody(rows, finalSubject);
        const emlText  = buildEml(RECIPIENT, finalSubject, emlBody, xlsxB64, filename);
        const emlFile  = filename.replace('.xlsx', '.eml');

        downloadBlob(emlText, emlFile, 'message/rfc822');

        // Feedback
        sendBtn.innerHTML = '✓ Klaar';
        sendBtn.style.background = '#22c55e';
        statusMsg.style.color = '#4ade80';
        statusMsg.innerHTML =
          `<b>${emlFile}</b> gedownload.<br>` +
          `Open het bestand in Outlook en klik Verzenden.`;

        setTimeout(() => { close(); if (onSend) onSend(); }, 3500);

      } catch (err) {
        sendBtn.disabled = false; cancelBtn.disabled = false;
        sendBtn.innerHTML = '📨 Mail klaarzetten';
        statusMsg.style.color = '#f87171';
        statusMsg.textContent = `Fout: ${err.message}`;
      }
    });
  }

  /* ─── Publieke API ────────────────────────────────────────────────────── */

  window.ValExportMail = {
    /**
     * Open de compose-popup voor de Moederlijst-mail.
     *
     * @param {Object[]} rows       Gevalideerde + verrijkte itemlijst-rijen
     * @param {Function} [onSend]   Optionele callback na succesvol klaarzetten
     */
    open(rows, onSend) {
      if (!rows?.length) {
        alert('Geen rijen beschikbaar voor export.');
        return;
      }
      if (typeof XLSX === 'undefined') {
        alert('SheetJS (XLSX) is niet geladen. Controleer de scriptlading.');
        return;
      }
      showComposeModal(rows, onSend);
    },
  };

})();
