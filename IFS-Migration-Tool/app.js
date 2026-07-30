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

    // Protective leading quote — VERIFIED against the real VBA source
    // (DEMO_L-Parts.xlsm): "If Left(Value, 1) = "'" Then Value = "'" + Value".
    // On import, a value that already starts with a single quote gets a
    // SECOND quote prepended (doubled), not stripped. This mirrors IFS's
    // own escaping convention for values that must keep a literal leading
    // apostrophe. The real Export() sub does NOT reverse this — it passes
    // the (now doubled) value straight through unchanged, so the doubling
    // must happen here, once, on import — and never again on export
    // (see Exporter.build below, which intentionally does nothing here).
    if (cellValue.startsWith("'")) {
      cellValue = "'" + cellValue;
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
          // Skip computed/read-only fields — some IFS views (confirmed in
          // DEMO_L-Parts.xlsm, view C_PARTS_WITHOUT_PURCH_ORD) include
          // derived columns whose "technical name" is actually an API
          // function call, e.g.
          //   C_PARTS_WITHOUT_PURCH_ORD_API.GET_PO_LINE_NO(SEQ_NO,...)
          // These are computed by IFS on read and cannot be assigned a
          // value on paste-back — writing them out would corrupt the
          // import into IFS, so any technical header shaped like a
          // function call (contains both '(' and '.') is never exported.
          if (techCol.includes('(') && techCol.includes('.')) return;
          // Convert newlines back to '--' IFS multiline markers
          // Maps to: Replace(Value, Chr(10), Chr(10) + "--")
          const ifsValue = String(cellValue).replace(/\n/g, '\n--');
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
// BLOCK 7b — ITEMLIJST ⇄ IFS COLUMN MAP
// Best-effort match between the supplier Itemlijst template columns
// (Delivery ref., Project, IHC PO, Item, Item description, Quantity,
// Unit of measure, Supplier, Country of origin, Hs-code,
// Weight nett/gross (collo), ...) and the technical IFS column names
// found in pasted !IFS.COPYOBJECT data. Shown as a hint under each
// technical header so the two worlds are visually connected.
// Not exhaustive — many Itemlijst columns (packaging, DG, inspection
// level, serial number, etc.) have no IFS-side equivalent by design.
//
// ⚠ ORDER_NO, VENDOR_PART_NO, VENDOR_PART_DESC and BUY_UNIT_MEAS are
// VERIFIED against the real VBA source and DEMO_L-Parts.xlsm (view
// C_PARTS_WITHOUT_PURCH_ORD). The remaining alternatives in each regex
// (PURCHASE_ORDER_NO, CATALOG_NO, DESCRIPTION, PURCH_UOM, SUB_PROJECT,
// SUPPLIER_*, COUNTRY_OF_ORIGIN, *WEIGHT*, CUSTOMS_STAT_NO/HS_CODE) are
// UNVERIFIED guesses kept only in case a different IFS view/LU happens
// to use those names — that view carried no supplier/weight/HS data at
// all, so those specific labels have not been confirmed anywhere yet.
// ============================================================
const COLUMN_MAP = [
  { test: /SUB.?PROJECT/i,                              label: 'Project' },
  { test: /^ORDER_NO$|^PURCH(ASE)?_ORDER_NO$|^PO_NO$/i, label: 'IHC PO' },
  { test: /^VENDOR_PART_NO$|^(LINE_NO|CATALOG_NO|PART_NO)$/i, label: 'Item' },
  { test: /^VENDOR_PART_DESC$|DESCRIPTION/i,            label: 'Item description' },
  { test: /^QTY$|QUANTITY/i,                             label: 'Quantity' },
  { test: /WEIGHT_UOM/i,                                  label: null }, // exclude before generic UOM rule
  { test: /^BUY_UNIT_MEAS$|UOM$/i,                        label: 'Unit of measure' },
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
// BLOCK 7c — REVERSE MAP: ITEMLIJST COLUMN NAME → IFS TECHNICAL CODE
// Used by the "📥 Import Itemlijst (.xlsx)" button to translate a
// supplier Itemlijst-template column header into the canonical
// technical IFS column code, so the rows can be turned into
// $RECORD=!/-$n:COL=value tokens ready for IFS import.
//
// ⚠ Two mappings carry a known semantic caveat (see original analysis):
//   - "Weight gross (collo)" → TOTAL_NET_WEIGHT (naming differs)
//   - "Hs-code"              → CUSTOMS_STAT_NO   (HS-code vs. customs
//                              statistics no. — verify per destination)
// Columns with no `code` are Itemlijst-only (logistics/supplier data)
// and are intentionally NOT translated into IFS tokens.
// ============================================================
// ============================================================
// BLOCK 7c — REVERSE MAP: ITEMLIJST COLUMN NAME → IFS TECHNICAL CODE
// ⚠ REBUILT against VERIFIED data — DEMO_L-Parts.xlsm, sheet "List",
// row 6 (technical headers) for LU=CPartsWithoutPurchOrd /
// VIEW=C_PARTS_WITHOUT_PURCH_ORD:
//   LINE_SEQ, ORDER_NO, LINE_NO, RELEASE_NO, CONTRACT, VENDOR_PART_NO,
//   VENDOR_PART_DESC, QTY, BUY_UNIT_MEAS, CREATION, EXECUTED_DATE,
//   SEQ_NO, + 4 computed API-call fields (read-only, never exported —
//   see Exporter.build's '(' + '.' check).
//
// The PREVIOUS version of this table (PURCHASE_ORDER_NO, DESCRIPTION,
// PURCH_UOM, SUPPLIER_NAME, COUNTRY_OF_ORIGIN, CUSTOMS_STAT_NO,
// NET_WEIGHT, TOTAL_NET_WEIGHT, SUB_PROJECT_ID) was an unverified guess
// and did NOT match this view — only "QTY" happened to be correct.
// This view is specifically "Parts without Purchase Order" (loose
// vendor parts not yet tied to a PO line): it does not carry supplier,
// country-of-origin, HS-code, or weight data at all, so those Itemlijst
// columns have NO IFS-side equivalent here and are intentionally left
// unmapped (code: null) — same treatment as the other reference-only
// columns below. If a different IFS view/LU is used for those fields,
// this table will need its own, separately-verified mapping.
// ============================================================
const ITEMLIST_TO_IFS = [
  { test: /^ihc\s*po$/i,                          code: 'ORDER_NO' },
  { test: /^item$/i,                              code: 'VENDOR_PART_NO' },
  { test: /^item\s*description$/i,                code: 'VENDOR_PART_DESC' },
  { test: /^quantity$/i,                          code: 'QTY' },
  { test: /^unit\s*of\s*measure$/i,               code: 'BUY_UNIT_MEAS' },
  // "Project" has no confirmed equivalent in this view. CONTRACT exists
  // as a field but was empty in every sample row of the demo file, so
  // the match is unverified — left unmapped rather than guessed.
  { test: /^project$/i,                           code: null },
  // No IFS equivalent in THIS view — kept in the table for reference,
  // not exported (this view carries no supplier/customs/weight data):
  { test: /^supplier$/i,                          code: null },
  { test: /^country\s*of\s*origin$/i,             code: null },
  { test: /^hs-?\s*code$/i,                       code: null },
  { test: /^weight\s*nett\s*\(collo\)$/i,         code: null },
  { test: /^weight\s*gross\s*\(collo\)$/i,        code: null },
  { test: /^delivery\s*ref\.?$/i,                 code: null },
  { test: /^component\s*\(mark\/label\)$/i,       code: null },
  { test: /^code\s*supplier$/i,                   code: null },
  { test: /^serial\s*number$/i,                   code: null },
  { test: /^make$/i,                              code: null },
  { test: /^material$/i,                          code: null },
  { test: /^value\s*pc\s*\(eur\)$/i,              code: null },
  { test: /^value\s*total$/i,                     code: null },
  { test: /^collo$/i,                             code: null },
  { test: /^type\s*of\s*packaging$/i,             code: null },
  { test: /^length\s*cm$/i,                       code: null },
  { test: /^width\s*cm$/i,                        code: null },
  { test: /^height\s*cm$/i,                       code: null },
  { test: /^volume\s*m3$/i,                       code: null },
  { test: /^dangerous\s*goods\?$/i,               code: null },
  { test: /^inspection\s*level$/i,                code: null },
];

/**
 * Look up the canonical IFS technical column code for a given
 * Itemlijst-template header name.
 * @param {string} itemlistHeader
 * @returns {string|null} technical code, or null if there is no known
 *   IFS-side equivalent (or the header itself is unrecognized).
 */
function findIfsCodeForHeader(itemlistHeader) {
  const clean = String(itemlistHeader ?? '').trim();
  for (const rule of ITEMLIST_TO_IFS) {
    if (rule.test.test(clean)) return rule.code;
  }
  return undefined; // unrecognized header entirely (not in the template)
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
    const labelClass = block.source === 'xlsx' ? 'block-label block-label--xlsx'
                      : block.source === 'quickadd' ? 'block-label block-label--quickadd'
                      : 'block-label';
    const labelText = block.source === 'xlsx' ? `📥 Itemlijst #${blockIdx + 1}`
                     : block.source === 'quickadd' ? `➕ Nieuw (Validator) #${blockIdx + 1}`
                     : `Import #${blockIdx + 1}`;
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
    block.technicalHeaders.forEach(h => {
      const th = document.createElement('th');
      const hint = mapToItemlistColumn(h);
      th.innerHTML = escapeHtml(h) +
        (hint ? `<span class="tech-map-hint">${escapeHtml(hint)}</span>` : '');
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

    // ── Unmapped-column note (xlsx-sourced blocks only) ─────
    if (block.source === 'xlsx' && Array.isArray(block.unmappedHeaders) && block.unmappedHeaders.length) {
      const note = document.createElement('div');
      note.className = 'import-note';
      note.innerHTML = `⚠️ <strong>${block.unmappedHeaders.length} column(s)</strong> have no IFS equivalent and were kept for reference only (not included in the exported tokens): ${block.unmappedHeaders.map(escapeHtml).join(', ')}.`;
      wrapper.appendChild(note);
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
// BLOCK 11 — ITEMLIJST (.xlsx) IMPORTER  ★ NEW
// Reads a supplier Itemlijst-template workbook (SheetJS/XLSX in the
// browser), matches its column headers against ITEMLIST_TO_IFS, and
// builds an ImportBlock identical in shape to what Parser.parse()
// produces from a pasted !IFS.COPYOBJECT payload — so it can be
// stored, rendered, edited (add/remove row) and exported exactly the
// same way as any other import.
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

    // Build friendly/technical headers + track unmapped columns
    const friendlyHeaders = [];
    const technicalHeaders = [];
    const unmappedHeaders = [];
    const colIndexesToKeep = [];

    headerRow.forEach((h, idx) => {
      if (!h) return; // skip blank/spacer columns
      const code = findIfsCodeForHeader(h);
      if (code === undefined) return; // header not part of the known template at all — ignore column
      friendlyHeaders.push(h);
      technicalHeaders.push(code || ''); // '' = known Itemlijst-only column, no IFS code
      if (!code) unmappedHeaders.push(h);
      colIndexesToKeep.push(idx);
    });

    if (!friendlyHeaders.length) {
      StatusBar.show('❌ No recognizable Itemlijst columns found to import.', 'error');
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
      unmappedHeaders
    };

    Store.append(importBlock);
    TableManager.render();

    const mappedCount = technicalHeaders.filter(Boolean).length;
    StatusBar.show(
      `✅ Itemlijst imported: ${rows.length} row(s), ${friendlyHeaders.length} column(s) ` +
      `(${mappedCount} mapped to IFS, ${unmappedHeaders.length} reference-only).`,
      'success'
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
        if (val && findIfsCodeForHeader(val) !== undefined) score++;
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
// ============================================================
// BLOCK 11 — QUICK ADD QUEUE (handoff from Itemlijst-Validator)
// Reads items queued by val-manual-match.js (Itemlijst-Validator) via
// localStorage when a row couldn't be matched to any existing PO line
// and the user chose "Nieuw registreren". Consumed once on load, then
// cleared so the same items aren't re-added on a later visit.
// ============================================================
const QuickAddQueue = {
  KEY: 'ihcQuickAddQueue',

  consume() {
    let queue;
    try { queue = JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { queue = []; }
    if (!Array.isArray(queue) || !queue.length) return;

    const friendlyHeaders = ['IHC PO', 'Item', 'Item description', 'Quantity', 'Unit of measure', 'Supplier'];
    // Reuse the SAME verified Itemlijst -> IFS technical-code mapping as
    // the "Import Itemlijst (.xlsx)" feature (ITEMLIST_TO_IFS), so a
    // quick-added row is translated identically either way.
    const technicalHeaders = friendlyHeaders.map(h => findIfsCodeForHeader(h) || '');
    const rows = queue.map(q => [q.po || '', q.item || '', q.description || '', q.qty || '', q.uom || '', q.supplier || '']);

    const lu = window.prompt('IFS Logical Unit (LU) voor deze nieuwe regel(s) — bv. CPartsWithoutPurchOrd:', '') || '';
    const view = window.prompt('IFS View-naam voor deze nieuwe regel(s):', '') || '';

    Store.append({ lu, view, friendlyHeaders, technicalHeaders, rows, source: 'quickadd' });
    localStorage.removeItem(this.KEY);

    StatusBar.show(
      `✅ ${rows.length} nieuwe regel(s) overgenomen vanuit de Itemlijst-Validator — controleer en exporteer naar IFS.`,
      'success'
    );
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI components
  StatusBar.init();
  TableManager.init();
  TableManager.render(); // Show empty state on load
  QuickAddQueue.consume();
  if (Store.imports.length) TableManager.render();

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

  // ── IMPORT ITEMLIJST (.xlsx) ─────────────────────────────  ★ NEW
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
