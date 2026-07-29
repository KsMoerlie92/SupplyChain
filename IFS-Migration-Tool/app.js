// =============================================
// IFS Migration Tool — JavaScript Port
// Based on VBA by M. Peters & W. van Leeuwen
// Damen Shipyards Gorinchem
// Web port: Royal IHC
// =============================================
'use strict';

// ============================================================
// BLOCK 1 — CLIPBOARD INTERFACE
// Maps to: Dim Obj As DataObject / Obj.GetFromClipboard / Obj.PutInClipboard
// ============================================================
const ClipboardHandler = {
  async read() {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch {
      StatusBar.show(
        '⚠️ Clipboard read failed. Check browser permissions.',
        'error'
      );
      return null;
    }
  },

  async write(text) {
    try {
      await navigator.clipboard.writeText(text);
      StatusBar.show('✅ Exported to clipboard. Paste into IFS.', 'success');
    } catch {
      StatusBar.show('⚠️ Clipboard write failed.', 'error');
    }
  }
};

// ============================================================
// BLOCK 2 — LINE SANITIZER (#NAME? fix)
// Maps to: If Left(s, 2) = "--" Then Lines(i) = "--|" + Mid(Lines(i), 3)
// ============================================================
const Sanitizer = {
  /**
   * Split raw clipboard text into lines and
   * prefix any line starting with '--' with '--|'
   * to prevent formula-parsing errors (Excel/#NAME?-style corruption).
   *
   * @param {string} rawText
   * @returns {string[]} sanitized lines
   */
  fix(rawText) {
    return rawText.split('\n').map(line => {
      if (line.startsWith('--')) {
        return '--|' + line.slice(2); // break '--NAME' formula syntax
      }
      return line;
    });
  }
};

// ============================================================
// BLOCK 3 — STAGING BUFFER (replaces hidden Sheet2)
// Maps to: Worksheets(2).Cells(5 + i, 1).Value = Lines(i)
// ============================================================
const StagingBuffer = {

  _lines: [],

  /** Load sanitized lines into the buffer */
  load(lines) {
    this._lines = lines;
  },

  /** Read a single line by 0-based index (maps to Cells(5+i, 1)) */
  get(index) {
    const val = this._lines[index];
    return (val === undefined || val === '') ? null : val;
  },

  /** Maps to: If Worksheets(2).Cells(5,1).Value <> "!IFS.COPYOBJECT" Then Exit Sub */
  isValid() {
    return this._lines[0] === '!IFS.COPYOBJECT';
  },

  clear() {
    this._lines = [];
  }
};

// ============================================================
// BLOCK 4 — VALIDATOR + IFS HEADER READER
// Maps to: LU = Worksheets(2).Cells(6,1) / View = Worksheets(2).Cells(7,1)
// ============================================================
const IFSValidator = {

  validate() {
    if (!StagingBuffer.isValid()) {
      StatusBar.show(
        '❌ Invalid clipboard content — not an IFS object.',
        'error'
      );
      return false;
    }
    return true;
  },

  readHeader() {
    return {
      lu: StagingBuffer.get(1) ?? '',   // Cells(6,1)
      view: StagingBuffer.get(2) ?? '' // Cells(7,1)
    };
  }
};

// ============================================================
// BLOCK 5 — TOKEN PARSER (the core While loop)
// Maps to: While Not IsEmpty(Value) ... Wend in Import()
// ============================================================
const Parser = {

  /**
   * Walk all staged lines and build a structured ImportBlock.
   * Token types handled:
   *   $RECORD=!        → new row
   *   -$n:TECH_COL=val → new column field
   *   --|text          → multiline continuation (newline)
   *   -                → end-of-record marker (skip)
   *   other            → plain continuation text
   *
   * @returns {{lu:string, view:string, friendlyHeaders:string[], technicalHeaders:string[], rows:string[][]}}
   */
  parse() {
    const { lu, view } = IFSValidator.readHeader();
    const friendlyHeaders = [];
    const technicalHeaders = [];
    const rows = [];
    let currentRow = null;

    // Data tokens start at index 3 (after !IFS.COPYOBJECT, LU, View)
    // Maps to: Worksheets(2).Cells(8 + i, 1) with i starting at 0
    let i = 3;
    let value = StagingBuffer.get(i);

    while (value !== null) {
      if (value === '$RECORD=!') {
        // ── New record ──────────────────────────────────────
        if (currentRow !== null) {
          rows.push(currentRow);
        }
        currentRow = [];

      } else if (value.startsWith('-$')) {
        // ── Field token: -$n:TECH_COL=cellValue ─────────────
        const { colIndex, techHeader, cellValue } =
          this._parseFieldToken(value);

        // Fill header arrays, padding gaps for non-contiguous columns
        while (friendlyHeaders.length <= colIndex) {
          const idx = friendlyHeaders.length;
          friendlyHeaders.push(`Field_${idx}`);
          technicalHeaders.push('');
        }
        friendlyHeaders[colIndex] = `Field_${colIndex}`;
        technicalHeaders[colIndex] = techHeader;

        // Pad current row for any skipped columns
        if (currentRow !== null) {
          while (currentRow.length <= colIndex) {
            currentRow.push('');
          }
          currentRow[colIndex] = cellValue;
        }

      } else if (value === '-') {
        // ── End-of-record marker (skip) ──────────────────────

      } else {
        // ── Multiline continuation ───────────────────────────
        if (currentRow !== null && currentRow.length > 0) {
          const lastCol = currentRow.length - 1;
          if (value.startsWith('--|')) {
            // Maps to: Chr(10) newline insertion
            currentRow[lastCol] += '\n' + value.slice(3);
          } else {
            currentRow[lastCol] += value;
          }
        }
      }

      i++;
      value = StagingBuffer.get(i);
    }

    // Push the last open row
    if (currentRow !== null && currentRow.length > 0) {
      rows.push(currentRow);
    }

    return { lu, view, friendlyHeaders, technicalHeaders, rows };
  },

  /**
   * Parse a single field token.
   * Format:  -$n:TECHNICAL_COLUMN_NAME=value
   * Example: -$1:CATALOG_NO=1011050
   *
   * Maps to: Pos1/Pos2/Pos3 parsing block in Import()
   */
  _parseFieldToken(token) {
    const dollarPos = token.indexOf('$');
    const colonPos = token.indexOf(':');
    const equalsPos = token.indexOf('=');
    const colIndex = parseInt(token.slice(dollarPos + 1, colonPos), 10);
    const techHeader = token.slice(colonPos + 1, equalsPos);
    let cellValue = token.slice(equalsPos + 1);

    // Strip a protective leading quote (Excel/IFS convention: a leading
    // apostrophe forces text interpretation, e.g. to preserve a leading
    // zero like '01234 or to stop a formula-looking value from being
    // evaluated). It is not part of the real data, so it is removed here.
    // The Exporter re-applies it symmetrically for values that need it
    // (see Exporter._needsProtectiveQuote) so a round trip doesn't
    // silently corrupt the value.
    if (cellValue.startsWith("'")) {
      cellValue = cellValue.slice(1);
    }

    return { colIndex, techHeader, cellValue };
  }
};

// ============================================================
// BLOCK 6 — EXPORT BUFFER BUILDER
// Maps to: Sub Export() buffer assembly loop
// ============================================================
const Exporter = {

  /**
   * Decide whether a value needs a protective leading quote when written
   * back into IFS/Excel — mirrors the same convention the Parser strips
   * on import (Block 5, _parseFieldToken). Without this, values that
   * originally arrived as e.g. '01234 (leading zero) or '=SOMETHING
   * (formula-looking text) would round-trip back as a plain number or
   * a live formula, silently corrupting the data on re-import into IFS.
   *
   * @param {string} value
   * @returns {boolean}
   */
  _needsProtectiveQuote(value) {
    if (value === '' || value == null) return false;
    // Purely numeric text with a leading zero (length > 1) would lose
    // that leading zero if pasted back in as a real number.
    if (/^0\d+$/.test(value)) return true;
    // Values starting with a formula-trigger character would be
    // executed as a formula instead of read as plain text.
    if (/^[=+\-@]/.test(value)) return true;
    return false;
  },

  /**
   * Reconstruct the IFS clipboard string from an ImportBlock.
   * Converts in-cell \n back to '--' IFS multiline markers.
   *
   * @param {{lu:string, view:string, technicalHeaders:string[], rows:string[][]}} importBlock
   * @returns {string}
   */
  build(importBlock) {
    const { lu, view, technicalHeaders, rows } = importBlock;

    // IFS header (maps to: Buffer = "!IFS.COPYOBJECT" + Chr$(10) + LU + Chr$(10) + View)
    let buffer = `!IFS.COPYOBJECT\n${lu}\n${view}`;

    for (const row of rows) {
      buffer += '\n$RECORD=!'; // Start new record

      row.forEach((cellValue, colIdx) => {
        if (cellValue !== '' && cellValue != null) {
          const techCol = technicalHeaders[colIdx] ?? '';
          // Skip columns with no technical IFS mapping (e.g. Itemlijst-only
          // fields such as Collo, Packaging, DG?, Inspection Level — these
          // have no IFS-side column and would corrupt the paste if written
          // with an empty ':' segment).
          if (!techCol) return;
          // Convert newlines back to '--' IFS multiline markers
          // Maps to: Replace(Value, Chr(10), Chr(10) + "--")
          let ifsValue = String(cellValue).replace(/\n/g, '\n--');
          // Re-apply the protective leading quote symmetrically with
          // the strip performed on import (see Parser._parseFieldToken).
          if (this._needsProtectiveQuote(ifsValue)) {
            ifsValue = "'" + ifsValue;
          }
          buffer += `\n-$${colIdx}:${techCol}=${ifsValue}`;
        }
      });

      buffer += '\n-'; // End-of-record marker
    }

    buffer += '\n\n'; // End-of-data (double newline)
    return buffer;
  }
};

// ============================================================
// BLOCK 7 — DATA STORE (in-memory Sheet1 equivalent)
// Supports multiple appended imports + row add/remove
// ============================================================
const Store = {
  imports: [],

  append(importBlock) {
    this.imports.push(importBlock);
  },

  removeAt(index) {
    this.imports.splice(index, 1);
  },

  /** Append a blank row (all cells empty) to the given import block. */
  addRow(blockIdx) {
    const block = this.imports[blockIdx];
    if (!block) return;
    const width = block.friendlyHeaders.length;
    block.rows.push(new Array(width).fill(''));
  },

  /** Remove a single row from the given import block. */
  removeRow(blockIdx, rowIdx) {
    const block = this.imports[blockIdx];
    if (!block) return;
    block.rows.splice(rowIdx, 1);
  },

  clear() {
    this.imports = [];
  }
};

// ============================================================
// BLOCK 7b — ITEMLIJST ⇄ IFS COLUMN MAP (for pasted !IFS.COPYOBJECT data)
// Best-effort match between a technical IFS column name (as pasted from
// IFS) and the corresponding Itemlijst-template column, shown as a hint
// under each technical header. Not exhaustive — many Itemlijst columns
// (packaging, DG, inspection level, serial number, etc.) have no
// IFS-side equivalent by design.
// ============================================================
const COLUMN_MAP = [
  { test: /SUB.?PROJECT/i,                              label: 'Project' },
  { test: /^PURCH(ASE)?_ORDER_NO$|^PO_NO$/i,            label: 'IHC PO' },
  { test: /^(LINE_NO|CATALOG_NO|PART_NO)$/i,            label: 'Item' },
  { test: /DESCRIPTION/i,                                label: 'Item description' },
  { test: /^QTY$|QUANTITY/i,                             label: 'Quantity' },
  { test: /WEIGHT_UOM/i,                                  label: null }, // exclude before generic UOM rule
  { test: /UOM$/i,                                        label: 'Unit of measure' },
  { test: /SUPPLIER_(NAME|NO)/i,                          label: 'Supplier' },
  { test: /COUNTRY_OF_ORIGIN/i,                           label: 'Country of origin' },
  { test: /^NET_WEIGHT$/i,                                label: 'Weight nett (collo)' },
  { test: /TOTAL_NET_WEIGHT|GROSS_WEIGHT/i,               label: 'Weight gross (collo)' },
  { test: /CUSTOMS_STAT_NO|HS_CODE|HTS/i,                 label: 'Hs-code' },
  { test: /TOTAL.*CURRENCY|TOTAL_VALUE/i,                 label: 'Value total' },
];

/**
 * Return the best-matching Itemlijst column label for a technical IFS
 * column name, or null if no known equivalent exists.
 * @param {string} techHeader
 * @returns {string|null}
 */
function mapToItemlistColumn(techHeader) {
  if (!techHeader) return null;
  for (const rule of COLUMN_MAP) {
    if (rule.test.test(techHeader)) return rule.label; // may be null (explicit exclusion)
  }
  return null;
}

// ============================================================
// BLOCK 7c — ITEMLIJST HEADER MATCHER (supplier-variation tolerant)
// Translates a supplier Itemlijst-template column header — which may
// be renamed, abbreviated, reordered, or partly translated to Dutch by
// the supplier — into the canonical technical IFS column code.
//
// Matching strategy (in order, most confident first):
//   1. Exact match against a normalized alias list per field
//      (handles known synonyms: "Qty"/"Aantal"/"Quantity", "PO"/
//      "Purchase Order"/"Inkooporder", "HS code"/"Tariff code", ...).
//   2. Fuzzy keyword match: header must contain at least one word from
//      EVERY required keyword-group for a field (order-independent,
//      handles "Net Wt (kg)", "Origin Country", "Weight - Nett", ...),
//      while excluding fields with a conflicting keyword (e.g. a
//      "gross" header must never match the "nett" field).
//   3. No match → header is kept in the table for visibility, but
//      flagged as "unrecognized" and excluded from the IFS export
//      (never silently dropped).
//
// ⚠ Two mappings carry a known semantic caveat (see original analysis):
//   - "Weight gross (collo)" → TOTAL_NET_WEIGHT (naming differs)
//   - "Hs-code"              → CUSTOMS_STAT_NO   (HS-code vs. customs
//                              statistics no. — verify per destination)
// ============================================================

/**
 * Normalize a header string for robust comparison:
 * lowercase, strip accents, unify separators/punctuation to spaces,
 * collapse whitespace.
 * @param {string} h
 * @returns {string}
 */
function normalizeHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents (é, ë, ...)
    .replace(/[?():.,;]/g, ' ')
    .replace(/[_/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FIELD_DEFINITIONS = [
  {
    label: 'Delivery ref.', code: null,
    aliases: ['delivery ref', 'delivery reference', 'delivery no', 'delivery nr', 'delivery number', 'levering ref', 'leverreferentie', 'referentie'],
    anyWords: [['delivery', 'levering'], ['ref', 'reference', 'referentie', 'no', 'nr', 'number']],
  },
  {
    label: 'Project', code: 'SUB_PROJECT_ID',
    aliases: ['project', 'project no', 'project nr', 'project number', 'projectnummer', 'yard no', 'yard nr', 'yardno', 'yard number', 'yn', 'newbuilding no', 'newbuilding number', 'hull no', 'hull nr', 'hull number'],
    anyWords: [['project', 'yard', 'yn', 'newbuilding', 'hull']],
  },
  {
    label: 'IHC PO', code: 'PURCHASE_ORDER_NO',
    aliases: ['ihc po', 'po', 'po no', 'po nr', 'po number', 'purchase order', 'purchase order no', 'purchase order number', 'purchaseorderno', 'order no', 'order nr', 'order number', 'inkooporder', 'inkoopordernummer', 'bestelnummer', 'bestelnr'],
    anyWords: [['po', 'purchase', 'order', 'inkooporder', 'bestelnummer', 'bestelnr'], ['no', 'nr', 'number', 'order', 'po']],
    excludeWords: ['line', 'item', 'regel'],
  },
  {
    label: 'Item', code: 'LINE_NO',
    aliases: ['item', 'item no', 'item nr', 'item number', 'itemno', 'line', 'line no', 'line nr', 'line number', 'lineno', 'part no', 'part number', 'partno', 'catalog no', 'positie', 'regel', 'regelnummer', 'positienummer'],
    anyWords: [['item', 'line', 'part', 'catalog', 'positie', 'regel']],
    excludeWords: ['description', 'omschrijving', 'desc'],
  },
  {
    label: 'Item description', code: 'DESCRIPTION',
    aliases: ['item description', 'description', 'desc', 'omschrijving', 'item omschrijving', 'productomschrijving', 'artikelomschrijving'],
    anyWords: [['description', 'desc', 'omschrijving']],
  },
  {
    label: 'Quantity', code: 'QTY',
    aliases: ['quantity', 'qty', 'aantal', 'hoeveelheid', 'aantal stuks'],
    anyWords: [['quantity', 'qty', 'aantal', 'hoeveelheid']],
  },
  {
    label: 'Unit of measure', code: 'PURCH_UOM',
    aliases: ['unit of measure', 'uom', 'unit', 'units', 'eenheid', 'meeteenheid', 'unit measure'],
    anyWords: [['unit', 'uom', 'eenheid', 'meeteenheid']],
    excludeWords: ['weight', 'gewicht'], // avoid clashing with a "weight unit" style header
  },
  {
    label: 'Component (Mark/Label)', code: null,
    aliases: ['component mark label', 'component', 'mark', 'label', 'markering', 'merkteken'],
    anyWords: [['component', 'mark', 'label', 'markering', 'merkteken']],
  },
  {
    label: 'Code supplier', code: null,
    aliases: ['code supplier', 'supplier code', 'leverancierscode', 'artikelcode leverancier', 'vendor code'],
    anyWords: [['code'], ['supplier', 'vendor', 'leverancier']],
  },
  {
    label: 'Serial number', code: null,
    aliases: ['serial number', 'serial no', 'serial nr', 'serienummer', 'serienr'],
    anyWords: [['serial', 'serie']],
  },
  {
    label: 'Supplier', code: 'SUPPLIER_NAME',
    aliases: ['supplier', 'vendor', 'leverancier', 'supplier name', 'vendor name'],
    anyWords: [['supplier', 'vendor', 'leverancier']],
    excludeWords: ['code'], // "supplier code" must go to Code supplier, not here
  },
  {
    label: 'Make', code: null,
    aliases: ['make', 'brand', 'merk', 'fabrikant', 'manufacturer'],
    anyWords: [['make', 'brand', 'merk', 'fabrikant', 'manufacturer']],
  },
  {
    label: 'Material', code: null,
    aliases: ['material', 'materiaal'],
    anyWords: [['material', 'materiaal']],
  },
  {
    label: 'Country of origin', code: 'COUNTRY_OF_ORIGIN',
    aliases: ['country of origin', 'origin', 'origin country', 'coo', 'land van herkomst', 'herkomstland', 'oorsprongsland', 'land herkomst'],
    anyWords: [['country', 'land', 'coo'], ['origin', 'herkomst', 'oorsprong', 'coo']],
  },
  {
    label: 'Hs-code', code: 'CUSTOMS_STAT_NO',
    aliases: ['hs code', 'hscode', 'hs', 'hs-code', 'tariff code', 'customs code', 'harmonized code', 'harmonised code', 'harmonized system code', 'commodity code', 'goederencode', 'tariefcode'],
    anyWords: [['hs', 'tariff', 'tarief', 'customs', 'harmonized', 'harmonised', 'commodity', 'goederencode']],
  },
  {
    label: 'Value pc (EUR)', code: null,
    aliases: ['value pc', 'value pc eur', 'unit value', 'price pc', 'price per piece', 'prijs per stuk', 'value per piece', 'unit price'],
    anyWords: [['value', 'price', 'prijs'], ['pc', 'piece', 'unit', 'per', 'stuk']],
  },
  {
    label: 'Value total', code: null,
    aliases: ['value total', 'total value', 'totale waarde', 'totaalwaarde', 'total price'],
    anyWords: [['value', 'price', 'waarde'], ['total', 'totaal', 'totale']],
  },
  {
    label: 'Collo', code: null,
    aliases: ['collo', 'colli', 'package no', 'package nr', 'pallet no', 'pallet nr', 'pallet number', 'colli nummer'],
    anyWords: [['collo', 'colli', 'pallet', 'package']],
  },
  {
    label: 'Type of packaging', code: null,
    aliases: ['type of packaging', 'packaging type', 'packaging', 'verpakking', 'verpakkingstype', 'type verpakking'],
    anyWords: [['packaging', 'verpakking']],
  },
  {
    label: 'Length cm', code: null,
    aliases: ['length cm', 'length', 'lengte', 'lengte cm', 'l cm'],
    anyWords: [['length', 'lengte']],
  },
  {
    label: 'Width cm', code: null,
    aliases: ['width cm', 'width', 'breedte', 'breedte cm', 'w cm'],
    anyWords: [['width', 'breedte']],
  },
  {
    label: 'Height cm', code: null,
    aliases: ['height cm', 'height', 'hoogte', 'hoogte cm', 'h cm'],
    anyWords: [['height', 'hoogte']],
  },
  {
    label: 'Volume m3', code: null,
    aliases: ['volume m3', 'volume', 'inhoud', 'volume m³', 'cbm'],
    anyWords: [['volume', 'inhoud', 'cbm']],
  },
  {
    label: 'Weight gross (collo)', code: 'TOTAL_NET_WEIGHT',
    aliases: ['weight gross collo', 'weight gross', 'gross weight', 'bruto gewicht', 'brutogewicht', 'gross wt', 'weight bruto'],
    anyWords: [['weight', 'wt', 'gewicht'], ['gross', 'bruto']],
  },
  {
    label: 'Weight nett (collo)', code: 'NET_WEIGHT',
    aliases: ['weight nett collo', 'weight nett', 'weight net', 'net weight', 'nett weight', 'netto gewicht', 'nettogewicht', 'net wt', 'weight netto'],
    anyWords: [['weight', 'wt', 'gewicht'], ['net', 'nett', 'netto']],
    excludeWords: ['gross', 'bruto'],
  },
  {
    label: 'Dangerous Goods?', code: null,
    aliases: ['dangerous goods', 'dg', 'gevaarlijke stoffen', 'gevaarlijke goederen', 'dangerous good'],
    anyWords: [['dangerous', 'gevaarlijke', 'dg']],
  },
  {
    label: 'Inspection Level', code: null,
    aliases: ['inspection level', 'inspectieniveau', 'keuringsniveau', 'inspection', 'keuring'],
    anyWords: [['inspection', 'inspectie', 'keuring']],
  },
];

/**
 * Match a raw (possibly supplier-modified) Itemlijst header against the
 * known field definitions.
 * @param {string} headerRaw
 * @returns {{label:string, code:string|null}|null} the matched field
 *   definition, or null if nothing matches at all.
 */
function matchItemlistField(headerRaw) {
  const norm = normalizeHeader(headerRaw);
  if (!norm) return null;

  // 1. Exact alias match (normalized) — highest confidence
  for (const def of FIELD_DEFINITIONS) {
    if (def.aliases.some(a => normalizeHeader(a) === norm)) return def;
  }

  // 2. Fuzzy keyword match — every required word-group must have a hit,
  //    unless an excluded word is present.
  const words = norm.split(' ').filter(Boolean);
  const wordSet = new Set(words);
  for (const def of FIELD_DEFINITIONS) {
    if (!def.anyWords) continue;
    if (def.excludeWords && def.excludeWords.some(w => wordSet.has(w))) continue;
    const allGroupsMatch = def.anyWords.every(group => group.some(w => wordSet.has(w)));
    if (allGroupsMatch) return def;
  }

  // 3. Nothing matched
  return null;
}

/**
 * Look up the canonical IFS technical column code for a given
 * Itemlijst-template header name.
 * @param {string} itemlistHeader
 * @returns {string|null|undefined} technical code (string), null if the
 *   column is a recognized Itemlijst-only field with no IFS equivalent
 *   by design, or undefined if the header could not be recognized at all.
 */
function findIfsCodeForHeader(itemlistHeader) {
  const def = matchItemlistField(itemlistHeader);
  if (!def) return undefined;
  return def.code;
}

// ============================================================
// BLOCK 8 — TABLE MANAGER (renders Store → DOM)
// Maps to: Worksheets(1).Cells(Row, Col).Value writes in Import()
// ============================================================
const TableManager = {
  _container: null,

  init() {
    this._container = document.getElementById('table-container');
  },

  render() {
    this._container.innerHTML = '';

    if (Store.imports.length === 0) {
      this._container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📂</div>
          <p>No data imported yet.</p>
          <p>Copy IFS data to clipboard, then click <strong>Import</strong> — or use <strong>📥 Import Itemlijst (.xlsx)</strong> to load a supplier Itemlijst directly.</p>
        </div>`;
      return;
    }

    Store.imports.forEach((block, blockIdx) => {
      this._container.appendChild(
        this._buildImportBlock(block, blockIdx)
      );
    });
  },

  _buildImportBlock(block, blockIdx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'import-block';

    // ── Block metadata header ──────────────────────────────
    const header = document.createElement('div');
    header.className = 'block-header';
    const labelClass = block.source === 'xlsx' ? 'block-label block-label--xlsx' : 'block-label';
    const labelText = block.source === 'xlsx' ? `📥 Itemlijst #${blockIdx + 1}` : `Import #${blockIdx + 1}`;
    header.innerHTML = `
      <span class="${labelClass}">${labelText}</span>
      <span>LU: <strong>${escapeHtml(block.lu)}</strong></span>
      <span>&nbsp;|&nbsp;</span>
      <span>View: <strong>${escapeHtml(block.view)}</strong></span>
      <span>&nbsp;|&nbsp;</span>
      <span>${block.rows.length} row(s), ${block.friendlyHeaders.length} column(s)</span>
      <div class="block-actions">
        <button type="button" class="action-danger" data-action="remove-block" data-block="${blockIdx}">🗑️ Remove Block</button>
      </div>`;
    wrapper.appendChild(header);

    header.querySelector('[data-action="remove-block"]').addEventListener('click', () => {
      Store.removeAt(blockIdx);
      TableManager.render();
      StatusBar.show('🗑️ Import block removed.', 'info');
    });

    // ── Table ──────────────────────────────────────────────
    const table = document.createElement('table');

    // THEAD
    const thead = document.createElement('thead');

    // Row 1 — Friendly headers (Field_0, Field_1 ... or original Itemlijst column names)
    const trFriendly = document.createElement('tr');
    trFriendly.className = 'row-friendly';
    const thCorner1 = document.createElement('th');
    thCorner1.textContent = '#';
    trFriendly.appendChild(thCorner1);
    block.friendlyHeaders.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trFriendly.appendChild(th);
    });
    thead.appendChild(trFriendly);

    // Row 2 — Technical IFS column names (+ Itemlijst mapping hint)
    const trTechnical = document.createElement('tr');
    trTechnical.className = 'row-technical';
    const thCorner2 = document.createElement('th');
    thCorner2.textContent = '';
    trTechnical.appendChild(thCorner2);
    block.technicalHeaders.forEach((h, idx) => {
      const th = document.createElement('th');
      if (block.source === 'xlsx' && Array.isArray(block.unrecognizedHeaders) &&
          block.unrecognizedHeaders.includes(block.friendlyHeaders[idx]) && !h) {
        // Column came from an xlsx import but the matcher didn't recognize it at all
        th.innerHTML = '<span class="tech-map-hint" style="color:var(--color-danger)">⚠ unrecognized</span>';
      } else {
        const hint = mapToItemlistColumn(h);
        th.innerHTML = escapeHtml(h) +
          (hint ? `<span class="tech-map-hint">${escapeHtml(hint)}</span>` : '');
      }
      trTechnical.appendChild(th);
    });
    thead.appendChild(trTechnical);
    table.appendChild(thead);

    // TBODY — editable data cells
    const tbody = document.createElement('tbody');
    block.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'row-num';
      tdNum.innerHTML = `
        <span class="row-num-inner">
          <span>${rowIdx + 1}</span>
          <button type="button" class="row-del-btn" title="Delete this row" data-row="${rowIdx}">✕</button>
        </span>`;
      tdNum.querySelector('.row-del-btn').addEventListener('click', () => {
        Store.removeRow(blockIdx, rowIdx);
        TableManager.render();
        StatusBar.show('✕ Row removed.', 'info');
      });
      tr.appendChild(tdNum);

      block.friendlyHeaders.forEach((_, colIdx) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = row[colIdx] ?? '';

        // Live-sync edits back to the Store
        td.addEventListener('blur', e => {
          Store.imports[blockIdx].rows[rowIdx][colIdx] = e.target.textContent;
        });

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // TFOOT — "Add row" action, spans the full table width
    const tfoot = document.createElement('tfoot');
    const trFoot = document.createElement('tr');
    const tdFoot = document.createElement('td');
    tdFoot.colSpan = block.friendlyHeaders.length + 1;
    tdFoot.innerHTML = `<button type="button" class="row-add-btn" data-action="add-row">➕ Add Row</button>`;
    tdFoot.querySelector('[data-action="add-row"]').addEventListener('click', () => {
      Store.addRow(blockIdx);
      TableManager.render();
      TableManager._focusLastRow(blockIdx);
      StatusBar.show('➕ Row added — start typing to fill it in.', 'info');
    });
    trFoot.appendChild(tdFoot);
    tfoot.appendChild(trFoot);
    table.appendChild(tfoot);

    wrapper.appendChild(table);

    // ── Reference-only note (known Itemlijst columns, no IFS code by design) ──
    if (block.source === 'xlsx' && Array.isArray(block.unmappedHeaders) && block.unmappedHeaders.length) {
      const note = document.createElement('div');
      note.className = 'import-note';
      note.innerHTML = `ℹ️ <strong>${block.unmappedHeaders.length} column(s)</strong> have no IFS equivalent by design and were kept for reference only (not included in the exported tokens): ${block.unmappedHeaders.map(escapeHtml).join(', ')}.`;
      wrapper.appendChild(note);
    }

    // ── Unrecognized-column warning (supplier renamed a column we don't know) ──
    if (block.source === 'xlsx' && Array.isArray(block.unrecognizedHeaders) && block.unrecognizedHeaders.length) {
      const warn = document.createElement('div');
      warn.className = 'import-note import-note--warning';
      warn.innerHTML = `⚠️ <strong>${block.unrecognizedHeaders.length} column(s)</strong> could not be automatically recognized (likely a supplier-specific column name) and were imported as-is, but are <strong>excluded from the IFS export</strong> — please check manually: ${block.unrecognizedHeaders.map(escapeHtml).join(', ')}.`;
      wrapper.appendChild(warn);
    }

    return wrapper;
  },

  /** After adding a row, focus its first editable cell for immediate typing. */
  _focusLastRow(blockIdx) {
    const blocks = this._container.querySelectorAll('.import-block');
    const wrapper = blocks[blockIdx];
    if (!wrapper) return;
    const rows = wrapper.querySelectorAll('tbody tr');
    const lastRow = rows[rows.length - 1];
    if (!lastRow) return;
    const firstEditable = lastRow.querySelector('td[contenteditable="true"]');
    if (firstEditable) firstEditable.focus();
  }
};

/** Small helper: escape HTML special chars for safe innerHTML injection. */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

// ============================================================
// BLOCK 9 — STATUS BAR
// ============================================================
const StatusBar = {
  _el: null,
  _timer: null,

  init() {
    this._el = document.getElementById('status-bar');
  },

  show(message, type = 'info') {
    this._el.textContent = message;
    this._el.className = `status-bar ${type}`;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._el.textContent = '';
      this._el.className = 'status-bar';
    }, 5000);
  }
};

// ============================================================
// BLOCK 10 — CLEAR / RESET
// Maps to: Sub ClearWorksheet() + Sub ClearClipboard()
// ============================================================
const Reset = {
  all() {
    Store.clear();
    StagingBuffer.clear();
    TableManager.render();
    StatusBar.show('🗑️ Workspace cleared.', 'info');
  }
};

// ============================================================
// BLOCK 11 — ITEMLIJST (.xlsx) IMPORTER
// Reads a supplier Itemlijst-template workbook (SheetJS/XLSX in the
// browser), matches its column headers against FIELD_DEFINITIONS
// (tolerant of supplier-introduced naming variations), and builds an
// ImportBlock identical in shape to what Parser.parse() produces from a
// pasted !IFS.COPYOBJECT payload — so it can be stored, rendered,
// edited (add/remove row) and exported exactly the same way as any
// other import (including the protective-quote round trip from Block 6).
// ============================================================
const ItemlistImporter = {

  /** Row-scan window used to auto-detect the real header row, since the
   *  Itemlijst template has a category-grouping row ("IHC"/"Supplier")
   *  above the actual column-name row. */
  _MAX_HEADER_SCAN_ROWS: 6,
  _MIN_HEADER_MATCHES: 3,

  /**
   * @param {File} file
   * @returns {Promise<void>}
   */
  async handleFile(file) {
    if (typeof XLSX === 'undefined') {
      StatusBar.show('❌ XLSX library not loaded — cannot read the file.', 'error');
      return;
    }

    let workbook;
    try {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array' });
    } catch (err) {
      StatusBar.show('❌ Could not read the Excel file. Is it a valid .xlsx?', 'error');
      return;
    }

    // Prefer a sheet that isn't the country/UOM "Master" reference tab
    const sheetName =
      workbook.SheetNames.find(n => !/^master$/i.test(n.trim())) ||
      workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      StatusBar.show('❌ No readable sheet found in the workbook.', 'error');
      return;
    }

    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (!rows2d.length) {
      StatusBar.show('❌ The sheet appears to be empty.', 'error');
      return;
    }

    const headerRowIdx = this._detectHeaderRow(rows2d);
    if (headerRowIdx === -1) {
      StatusBar.show(
        '❌ Could not recognize Itemlijst column headers in this file. Expected columns like "Project", "IHC PO", "Item description"...',
        'error'
      );
      return;
    }

    const headerRow = rows2d[headerRowIdx].map(h => String(h ?? '').trim());
    const dataRows = rows2d.slice(headerRowIdx + 1)
      .filter(r => r.some(cell => String(cell ?? '').trim() !== ''));

    // Build friendly/technical headers + track reference-only vs. unrecognized columns
    const friendlyHeaders = [];
    const technicalHeaders = [];
    const unmappedHeaders = [];       // known Itemlijst-only field, no IFS code by design
    const unrecognizedHeaders = [];   // header didn't match anything at all
    const colIndexesToKeep = [];

    headerRow.forEach((h, idx) => {
      if (!h) return; // skip blank/spacer columns
      const def = matchItemlistField(h);

      friendlyHeaders.push(h);
      colIndexesToKeep.push(idx);

      if (!def) {
        // Completely unrecognized — keep the column (never silently drop
        // supplier data), but flag it and exclude it from export.
        technicalHeaders.push('');
        unrecognizedHeaders.push(h);
      } else {
        technicalHeaders.push(def.code || '');
        if (!def.code) unmappedHeaders.push(h); // known, but no IFS equivalent by design
      }
    });

    if (!friendlyHeaders.length) {
      StatusBar.show('❌ No columns found to import.', 'error');
      return;
    }

    const rows = dataRows.map(r => colIndexesToKeep.map(i => String(r[i] ?? '').trim()));

    // LU / View: not present in an Itemlijst workbook — ask once so the
    // exported buffer carries a valid IFS header line.
    const lu = window.prompt('IFS Logical Unit (LU) for this import — e.g. PURCHASE_ORDER_LINE:', '') || '';
    const view = window.prompt('IFS View name for this import:', '') || '';

    const importBlock = {
      lu,
      view,
      friendlyHeaders,
      technicalHeaders,
      rows,
      source: 'xlsx',
      unmappedHeaders,
      unrecognizedHeaders
    };

    Store.append(importBlock);
    TableManager.render();

    const mappedCount = technicalHeaders.filter(Boolean).length;
    StatusBar.show(
      `✅ Itemlijst imported: ${rows.length} row(s), ${friendlyHeaders.length} column(s) — ` +
      `${mappedCount} mapped to IFS, ${unmappedHeaders.length} reference-only, ` +
      `${unrecognizedHeaders.length} unrecognized (check manually).`,
      unrecognizedHeaders.length ? 'warning' : 'success'
    );
  },

  /**
   * Scan the first few rows to find the one that best matches known
   * Itemlijst column names (handles the extra "IHC/Supplier" category
   * row sitting above the real header row in the template).
   * @param {Array<Array<string>>} rows2d
   * @returns {number} header row index, or -1 if none found
   */
  _detectHeaderRow(rows2d) {
    let bestIdx = -1;
    let bestScore = 0;
    const scanLimit = Math.min(this._MAX_HEADER_SCAN_ROWS, rows2d.length);

    for (let r = 0; r < scanLimit; r++) {
      const row = rows2d[r];
      let score = 0;
      row.forEach(cell => {
        const val = String(cell ?? '').trim();
        if (val && matchItemlistField(val) !== null) score++;
      });
      if (score > bestScore) {
        bestScore = score;
        bestIdx = r;
      }
    }

    return bestScore >= this._MIN_HEADER_MATCHES ? bestIdx : -1;
  }
};

// ============================================================
// MAIN CONTROLLER — Wire all blocks together
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI components
  StatusBar.init();
  TableManager.init();
  TableManager.render(); // Show empty state on load

  // ── IMPORT ──────────────────────────────────────────────
  document.getElementById('btn-import')
    .addEventListener('click', async () => {
      // Block 1: Read clipboard
      const rawText = await ClipboardHandler.read();
      if (!rawText) return;

      // Block 2: Sanitize lines
      const lines = Sanitizer.fix(rawText);

      // Block 3: Stage lines
      StagingBuffer.load(lines);

      // Block 4: Validate
      if (!IFSValidator.validate()) return;

      // Block 5: Parse tokens
      const importBlock = Parser.parse();

      // Block 7: Store + render
      Store.append(importBlock);
      TableManager.render();

      StatusBar.show(
        `✅ Imported: ${importBlock.lu} / ${importBlock.view} — ` +
        `${importBlock.rows.length} row(s), ` +
        `${importBlock.friendlyHeaders.length} column(s).`,
        'success'
      );
    });

  // ── IMPORT ITEMLIJST (.xlsx) ─────────────────────────────
  const itemlistInput = document.getElementById('itemlist-file-input');
  const itemlistBtn = document.getElementById('btn-import-itemlist');
  if (itemlistBtn && itemlistInput) {
    itemlistBtn.addEventListener('click', () => itemlistInput.click());
    itemlistInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // allow re-selecting the same file later
      if (!file) return;
      StatusBar.show('⏳ Reading Itemlijst file…', 'info');
      await ItemlistImporter.handleFile(file);
    });
  }

  // ── EXPORT ──────────────────────────────────────────────
  document.getElementById('btn-export')
    .addEventListener('click', async () => {
      if (Store.imports.length === 0) {
        StatusBar.show('⚠️ Nothing to export.', 'warning');
        return;
      }

      // Block 6: Build IFS buffer (first block, matching VBA behavior)
      const buffer = Exporter.build(Store.imports[0]);

      // Block 1: Write to clipboard
      await ClipboardHandler.write(buffer);
    });

  // ── CLEAR ───────────────────────────────────────────────
  document.getElementById('btn-clear')
    .addEventListener('click', () => Reset.all());
});
