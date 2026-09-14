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
  const DATA_MAX_ROW = 99;    // laatste voorbereide rij in template-base.xlsx

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

  /**
   * @param {ArrayBuffer} baseBuffer   ruwe bytes van template-base.xlsx
   * @param {string[]} cols            kolomvolgorde (A t/m AA), 27 namen
   * @param {Object[]} rows            itemlijst-rijen, {kolomnaam: waarde}
   * @returns {Uint8Array} de kant-en-klare xlsx, met opmaak behouden
   */
  function patchTemplate(baseBuffer, cols, rows) {
    const maxRows = DATA_MAX_ROW - DATA_START_ROW + 1;
    if (rows.length > maxRows) {
      throw new Error(`Te veel regels (${rows.length}) voor de template — deze biedt ruimte voor maximaal ${maxRows} regels.`);
    }

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
    const notFound = [];

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

  window.TemplateXlsxWriter = { buildFilledTemplate, downloadFilledTemplate, DATA_MAX_ROW, DATA_START_ROW };
})();
