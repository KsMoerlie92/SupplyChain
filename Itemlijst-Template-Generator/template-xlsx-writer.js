/**
 * template-xlsx-writer.js  –  IHC Expedite 2.0 · Itemlijst Template Generator
 *
 * Schrijft gegenereerde itemlijst-rijen in de opgemaakte basistemplate
 * (template-base.xlsx — de door Kris aangeleverde, officiële template met
 * eigenaarschap-rij, Excel-tabel, live Volume-formule en keuzelijsten uit
 * het Master-tabblad) in plaats van een kaal bestand op te bouwen.
 *
 * Werkwijze: de basistemplate wordt NIET via XLSX.read()/XLSX.write()
 * herbouwd — dat zou de Excel-tabel, keuzelijsten en opmaak verliezen
 * (bekende beperking van de gratis SheetJS-editie). In plaats daarvan
 * wordt het bestand als ZIP geopend (XLSX.CFB, dezelfde aanpak als
 * val-export-mail.js voor de tabel-injectie) en wordt alleen de
 * <v>-waarde van elke doelcel toegevoegd — de stijl (s="N"), formules
 * en al het overige blijven letterlijk ongewijzigd.
 *
 * Geverifieerd: elk onderdeel van het uitvoerbestand behalve sheet1.xml
 * is byte-voor-byte identiek aan de basistemplate.
 */
(function () {
  if (window.__templateXlsxWriterLoaded) return;
  window.__templateXlsxWriterLoaded = true;

  const trim = v => String(v ?? '').trim();
  const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA'];
  const DATA_START_ROW = 3;   // eerste data-rij in template-base.xlsx
  const TEMPLATE_MAX_ROW = 99; // laatste rij die de template zelf al kant-en-klaar heeft

  let _baseBufferPromise = null;
  function loadBaseTemplate() {
    if (!_baseBufferPromise) {
      _baseBufferPromise = fetch('template-base.xlsx').then(res => {
        if (!res.ok) throw new Error('template-base.xlsx kon niet geladen worden (status ' + res.status + ')');
        return res.arrayBuffer();
      });
    }
    return _baseBufferPromise;
  }

  // Exacte stijl-index per kolom, precies zoals de template 'm op rij 99 heeft
  // staan — gebruikt om nieuwe rijen (>97 regels) te klonen wanneer dat nodig is.
  const ROW_STYLES = {A:14,B:15,C:15,D:15,E:14,F:15,G:14,H:15,I:15,J:15,K:15,L:15,M:15,N:15,O:15,P:16,Q:16,R:15,S:15,T:17,U:17,V:17,W:13,X:17,Y:17,Z:23,AA:18};
  const W_FORMULA = 'Table1[[#This Row],[Length cm]]*Table1[[#This Row],[Width cm]]*Table1[[#This Row],[Height cm]]/1000000';

  function buildClonedRow(r) {
    let cells = '';
    COL_LETTERS.forEach(L => {
      const s = ROW_STYLES[L]; const ref = L + r;
      if (L === 'W') cells += `<c r="${ref}" s="${s}"><f>${W_FORMULA}</f><v>0</v></c>`;
      else if (L === 'Z') cells += `<c r="${ref}" s="${s}" t="b"><v>0</v></c>`;
      else cells += `<c r="${ref}" s="${s}"/>`;
    });
    return `<row r="${r}" spans="1:27">${cells}</row>`;
  }

  /**
   * Breidt de template uit voorbij de kant-en-klare 97 rijen: kloont nieuwe
   * rijen met exact dezelfde opmaak/formule als de laatste bestaande rij, en
   * werkt het rijbereik bij in: de sheet-dimension, de vier dropdown-
   * validaties (Country of origin, Unit of measure, Type of packaging,
   * Inspection Level), de valuta-validatie (Value pc/Value total) en de
   * HS-code-lengtevalidatie. Wordt alleen aangeroepen als er meer regels
   * nodig zijn dan de template al kant-en-klaar heeft.
   */
  function extendSheetIfNeeded(sheet, neededMaxRow) {
    if (neededMaxRow <= TEMPLATE_MAX_ROW) return sheet;
    let newRowsXml = '';
    for (let r = TEMPLATE_MAX_ROW + 1; r <= neededMaxRow; r++) newRowsXml += buildClonedRow(r);
    sheet = sheet.replace('</sheetData>', newRowsXml + '</sheetData>');
    sheet = sheet.replace(/<dimension ref="A1:AA\d+"\/>/, `<dimension ref="A1:AA${neededMaxRow}"/>`);
    // Vier dropdown-validaties, elk van de vorm "<xm:sqref>KOL3:KOL99</xm:sqref>"
    sheet = sheet.replace(/<xm:sqref>([A-Z]{1,2})3:\1(99)<\/xm:sqref>/g,
      (m, col) => `<xm:sqref>${col}3:${col}${neededMaxRow}</xm:sqref>`);
    sheet = sheet.replace('sqref="P3:Q99"', `sqref="P3:Q${neededMaxRow}"`);
    sheet = sheet.replace('sqref="O3 O5 O7:O11 O13:O98"',
      `sqref="O3 O5 O7:O11 O13:O98 O99:O${neededMaxRow}"`);
    return sheet;
  }
  function extendTableRefIfNeeded(tableXml, neededMaxRow) {
    if (neededMaxRow <= TEMPLATE_MAX_ROW) return tableXml;
    return tableXml.replace(/ref="A2:AA\d+"/, `ref="A2:AA${neededMaxRow}"`);
  }

  /**
   * @param {ArrayBuffer} baseBuffer   ruwe bytes van template-base.xlsx
   * @param {string[]} cols            kolomvolgorde (A t/m AA), 27 namen
   * @param {Object[]} rows            itemlijst-rijen, {kolomnaam: waarde}
   * @returns {Uint8Array} de kant-en-klare xlsx, met opmaak behouden
   */
  function patchTemplate(baseBuffer, cols, rows) {
    const neededMaxRow = DATA_START_ROW + rows.length - 1;

    const cfb = XLSX.CFB.read(new Uint8Array(baseBuffer), { type: 'array' });
    const find = (p) => {
      const i = cfb.FullPaths.findIndex(f => f.replace(/^Root Entry\//, '') === p);
      return i < 0 ? null : cfb.FileIndex[i];
    };
    const readTxt = (p) => {
      const f = find(p); if (!f) throw new Error('ontbrekend onderdeel in de template: ' + p);
      const c = f.content;
      let s = ''; for (let i = 0; i < c.length; i++) s += String.fromCharCode(c[i]);
      return decodeURIComponent(escape(s));
    };
    const write = (p, s) => {
      const u = unescape(encodeURIComponent(s));
      const a = new Uint8Array(u.length);
      for (let i = 0; i < u.length; i++) a[i] = u.charCodeAt(i) & 0xFF;
      XLSX.CFB.utils.cfb_add(cfb, '/' + p, a);
    };

    let sheet = readTxt('xl/worksheets/sheet1.xml');
    let table1 = readTxt('xl/tables/table1.xml');
    const notFound = [];

    // Meer regels dan de kant-en-klare 97? Dan eerst de template zelf
    // uitbreiden (nieuwe, gekloonde rijen + bijgewerkte validatiebereiken).
    sheet = extendSheetIfNeeded(sheet, neededMaxRow);
    table1 = extendTableRefIfNeeded(table1, neededMaxRow);

    rows.forEach((row, i) => {
      const r = DATA_START_ROW + i;
      cols.forEach((h, ci) => {
        const val = trim(row[h]);
        if (!val) return; // leeg -> cel blijft zoals in de template (met zijn eigen stijl)
        const cellRef = COL_LETTERS[ci] + r;
        const re = new RegExp('<c r="' + cellRef + '"([^>]*?)/>');
        const m = sheet.match(re);
        if (!m) { notFound.push(cellRef); return; }
        const attrs = m[1].replace(/\st="[^"]*"/, '');
        const isNumeric = /^-?\d+([.,]\d+)?$/.test(val);
        const replacement = isNumeric
          ? `<c r="${cellRef}"${attrs}><v>${xesc(val.replace(',', '.'))}</v></c>`
          : `<c r="${cellRef}"${attrs} t="inlineStr"><is><t xml:space="preserve">${xesc(val)}</t></is></c>`;
        sheet = sheet.replace(re, replacement);
      });
    });

    if (notFound.length) console.warn('template-xlsx-writer: cellen buiten het voorbereide templatebereik, overgeslagen:', notFound);

    write('xl/worksheets/sheet1.xml', sheet);
    write('xl/tables/table1.xml', table1);
    return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
  }

  /**
   * Bouwt de complete, opgemaakte xlsx en geeft 'm terug als base64 —
   * handig voor zowel directe download als als e-mailbijlage.
   */
  async function buildFilledTemplate(cols, rows) {
    const baseBuffer = await loadBaseTemplate();
    const arr = patchTemplate(baseBuffer, cols, rows);
    // array -> base64 (dezelfde conversie als XLSX zelf intern gebruikt)
    let bin = '';
    const bytes = new Uint8Array(arr);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBlob(b64, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /** Downloadt de opgemaakte template direct als bestand. */
  async function downloadFilledTemplate(cols, rows, filename) {
    const b64 = await buildFilledTemplate(cols, rows);
    const blob = base64ToBlob(b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.TemplateXlsxWriter = { buildFilledTemplate, downloadFilledTemplate, TEMPLATE_MAX_ROW, DATA_START_ROW };
})();
