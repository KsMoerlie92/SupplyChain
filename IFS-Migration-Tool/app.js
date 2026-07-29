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

    // Strip leading quote (quoted-text handling: ''text → 'text)
    // Maps to: If Left(Value, 1) = "'" Then Value = "'" + Value
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
          <p>Copy IFS data to clipboard, then click <strong>Import</strong>.</p>
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
    header.innerHTML = `
      <span class="block-label">Import #${blockIdx + 1}</span>
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

    // Row 1 — Friendly headers (Field_0, Field_1 ...)
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
