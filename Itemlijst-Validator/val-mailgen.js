/* ──────────────────────────────────────────────────────────────────────────
   IHC Itemlijst-Validator — Mailcomposer (deel 1)
   Eén knop bovenaan → paneel met twee templates:
     • Leverancier  — ontbrekende/afwijkende gegevens (welke regel + kolom)
     • AFS          — voormelding o.b.v. afwijkende afmeting en/of gewicht
   De opgemerkte regels staan aangevinkt; je kunt ze uit-/aanvinken én de
   tekst vrij aanvullen. Optioneel: AI-verbetering met de Anthropic API-sleutel.
   Zelfstandig: leest globals uit validator.js (_valRows, COL, _valHeaders, esc).
   Raakt de bestaande Expediting Mailer niet aan.
   ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';
  const AFS_EMAIL = 'Mark.Kruisbeek@afsfreightsolutions.com';

  /* ---------- veilige toegang tot validator-globals ---------- */
  function _esc(s) { try { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); } catch (e) { return String(s == null ? '' : s); } }
  function _rows() { try { return (typeof _valRows !== 'undefined' && Array.isArray(_valRows)) ? _valRows : []; } catch (e) { return []; } }
  function _colIdx(letter) { try { return (typeof COL !== 'undefined') ? COL[letter] : null; } catch (e) { return null; } }
  function _colLabel(letter) { const i = _colIdx(letter); try { return (typeof _valHeaders !== 'undefined' && _valHeaders[i]) ? String(_valHeaders[i]) : letter; } catch (e) { return letter; } }
  function _cell(c, letter) { const i = _colIdx(letter); try { const v = (c && i != null) ? c[i] : ''; return v == null ? '' : String(v).trim(); } catch (e) { return ''; } }
  function _colloLetter() {
    try {
      if (typeof COL === 'undefined' || typeof _valHeaders === 'undefined') return null;
      const hdr = L => String(_valHeaders[COL[L]] || '').toLowerCase();
      const letters = Object.keys(COL);
      const isCollo = h => /coll[io]/.test(h) || /(package|pakket|pkg)/.test(h);
      const isCount = h => /(aantal|qty|pcs|stuks|count)/.test(h);
      const hasNr   = h => /(nr|no|nummer|number|#)/.test(h);
      let L = letters.find(l => { const h = hdr(l); return isCollo(h) && hasNr(h) && !isCount(h); });
      if (L) return L;
      L = letters.find(l => { const h = hdr(l); return isCollo(h) && !isCount(h); });
      return L || null;
    } catch (e) { return null; }
  }
  function _consignee() { return (document.getElementById('val-consignee')?.value || '').trim(); }
  function _filename() { return (document.getElementById('val-filename')?.textContent || '').trim(); }

  /* ---------- regels per template ---------- */
  function supplierItems() {
    return _rows().map((r, idx) => {
      const errs = r.errors || {}, wrns = r.warnings || {};
      const issues = [];
      Object.keys(errs).forEach(k => issues.push({ type: 'fout',   col: k, label: _colLabel(k), msg: errs[k] }));
      Object.keys(wrns).forEach(k => issues.push({ type: 'let op', col: k, label: _colLabel(k), msg: wrns[k] }));
      if (!issues.length) return null;
      const c = r.cells || [];
      return { idx, ref: _cell(c, 'A') || '(geen ref)', item: _cell(c, 'D'), desc: _cell(c, 'E'), issues };
    }).filter(Boolean);
  }
  function afsItems() {
    return _rows().map((r, idx) => {
      if (!(r.computed && r.computed._afs)) return null;
      const c = r.cells || [];
      return {
        idx, ref: _cell(c, 'A') || '(geen ref)', desc: _cell(c, 'E'),
        L: _cell(c, 'T'), W: _cell(c, 'U'), H: _cell(c, 'V'), G: _cell(c, 'X'), reason: r.computed._afs
      };
    }).filter(Boolean);
  }

  /* ---------- body-generatie ---------- */
  function supplierBody(items) {
    const fn = _filename(), cons = _consignee();
    const blocks = items.map(it => {
      const head = `- Regel ${it.ref}${it.item ? ' (item ' + it.item + ')' : ''}${it.desc ? ' \u2014 ' + it.desc : ''}:`;
      const subs = it.issues.map(is => `    \u2022 ${is.label} [kol ${is.col}]: ${is.msg}`).join('\n');
      return head + '\n' + subs;
    }).join('\n');
    return `Geachte leverancier,

Bij de controle van de door u aangeleverde itemlijst${fn ? ' (' + fn + ')' : ''}${cons ? ' voor ' + cons : ''} ontbreken of wijken onderstaande gegevens af van onze vereisten. Wij verzoeken u deze aan te vullen of te corrigeren en de itemlijst vervolgens opnieuw aan te leveren:

${blocks}

Een volledig en correct ingevulde itemlijst is noodzakelijk voor een correcte douane-afhandeling en verzending. Mocht iets onduidelijk zijn over een specifieke regel of kolom, dan horen wij dat graag.

Met vriendelijke groet,
Royal IHC`;
  }
  function afsBody(items) {
    const cons = _consignee(), fn = _filename();
    const lines = items.map(it =>
      `- ${it.ref}${it.desc ? ' | ' + it.desc : ''} | L\u00d7B\u00d7H: ${it.L || '?'}\u00d7${it.W || '?'}\u00d7${it.H || '?'} cm | bruto: ${it.G || '?'} kg [${it.reason}]`
    ).join('\n');
    return `Beste Mark,

In onderstaande zending${cons ? ' voor ' + cons : ''} zitten ${items.length} regel(s) die een voormelding vereisen vanwege afwijkende afmeting en/of gewicht (\u22652 maten > 3 m of bruto > 10.000 kg). Graag hiermee rekening houden in een laad- en losplan.
${fn ? '\nBestand: ' + fn + '\n' : ''}
${lines}

Met vriendelijke groet,
Royal IHC`;
  }

  // Groepeert per uniek collonummer; alleen relevant bij méér dan 20 colli.
  function palletItems() {
    const cL = _colloLetter();
    if (!cL) return [];
    const map = new Map();
    _rows().forEach(r => {
      const c = r.cells || [];
      const collo = _cell(c, cL);
      if (!collo) return;
      if (!map.has(collo)) map.set(collo, { collo: collo, L: _cell(c, 'T'), W: _cell(c, 'U'), H: _cell(c, 'V'), G: _cell(c, 'X'), rows: 0 });
      map.get(collo).rows++;
    });
    const list = [...map.values()].sort((a, b) => String(a.collo).localeCompare(String(b.collo), 'nl', { numeric: true }));
    return list.length > 20 ? list : [];
  }
  function palletBody(items) {
    const cons = _consignee(), fn = _filename();
    const lines = items.map(it =>
      `- Collo ${it.collo} | L×B×H: ${it.L || '?'}×${it.W || '?'}×${it.H || '?'} cm | bruto: ${it.G || '?'} kg | ${it.rows} regel(s)`
    ).join('\n');
    return `Beste Mark,

Ter voormelding: de komende zending${cons ? ' voor ' + cons : ''} omvat ${items.length} unieke collo's/pallets. Vanwege deze omvang melden wij dit vooraf, zodat er tijdig capaciteit gereserveerd kan worden (transport, laad- en losplan, eventueel meerdere trailers).
${fn ? '\nBestand: ' + fn + '\n' : ''}
Overzicht van de colli:
${lines}

Graag ontvangen wij een bevestiging dat dit aantal ingepland kan worden. Zijn er beperkingen qua afmeting of gewicht per collo, dan horen wij dat graag.

Met vriendelijke groet,
Royal IHC`;
  }

  const TEMPLATES = {
    leverancier: {
      naam: 'Leverancier \u2014 ontbrekende/afwijkende info',
      to: '',
      subject: () => { const c = _consignee(); return 'Itemlijst \u2014 aan te vullen / te corrigeren gegevens' + (c ? ' \u2014 ' + c : ''); },
      itemsFn: supplierItems, bodyFn: supplierBody,
      label: it => `Regel ${it.ref}${it.item ? ' (item ' + it.item + ')' : ''}${it.desc ? ' \u2014 ' + it.desc : ''} \u00b7 ${it.issues.length} punt(en): ${it.issues.map(i => i.label).join(', ')}`,
      empty: 'Geen ontbrekende of afwijkende gegevens gevonden \u2014 niets te melden aan de leverancier.'
    },
    afs: {
      naam: 'AFS \u2014 voormelding (afmeting/gewicht)',
      to: AFS_EMAIL,
      subject: () => { const c = _consignee(); return 'Voormelding AFS \u2014 oversized/zware items' + (c ? ' \u2014 ' + c : ''); },
      itemsFn: afsItems, bodyFn: afsBody,
      label: it => `${it.ref}${it.desc ? ' \u2014 ' + it.desc : ''} \u00b7 ${it.L || '?'}\u00d7${it.W || '?'}\u00d7${it.H || '?'} cm \u00b7 ${it.G || '?'} kg [${it.reason}]`,
      empty: 'Geen oversized/zware regels gevonden \u2014 geen voormelding bij AFS nodig.'
    },
    omvang: {
      naam: 'AFS — voormelding omvang (>20 colli)',
      to: AFS_EMAIL,
      subject: () => { const c = _consignee(); return 'Voormelding AFS — grote zending (>20 colli)' + (c ? ' — ' + c : ''); },
      itemsFn: palletItems, bodyFn: palletBody,
      label: it => `Collo ${it.collo} · ${it.L || '?'}×${it.W || '?'}×${it.H || '?'} cm · ${it.rows} regel(s)`,
      empty: '20 of minder unieke collonummers (of geen collonummer-kolom gevonden) — geen voormelding vanwege omvang nodig.'
    }
  };

  /* ---------- state ---------- */
  let dom = null;
  let _tplKey = 'leverancier';
  let _items = [];
  let _sel = new Set();   // geselecteerde item-indexen (positie in _items)

  /* ---------- styling (eenmalig geïnjecteerd) ---------- */
  function injectCss() {
    if (document.getElementById('valmail-css')) return;
    const s = document.createElement('style'); s.id = 'valmail-css';
    s.textContent = `
.valmail-overlay{position:fixed;inset:0;background:rgba(5,10,20,.66);display:none;align-items:flex-start;justify-content:center;z-index:9999;padding:4vh 1rem;overflow:auto}
.valmail-overlay.on{display:flex}
.valmail-panel{width:min(760px,100%);background:var(--navy-mid,#0F2040);border:1px solid var(--steel,#1E3A5F);border-radius:6px;box-shadow:0 18px 60px rgba(0,0,0,.5);font-family:var(--body,system-ui,sans-serif);color:var(--text,#D4DEF0)}
.valmail-head{display:flex;align-items:center;gap:.6rem;padding:.7rem 1rem;border-bottom:1px solid var(--steel,#1E3A5F)}
.valmail-head h3{margin:0;font-family:var(--condensed,var(--body));font-size:1.05rem;letter-spacing:.02em}
.valmail-x{margin-left:auto;background:none;border:none;color:var(--muted,#8FA3BF);font-size:1.3rem;cursor:pointer;line-height:1}
.valmail-body{padding:.9rem 1rem;display:flex;flex-direction:column;gap:.7rem}
.valmail-tpls{display:flex;flex-wrap:wrap;gap:.5rem}
.valmail-tpl{display:flex;align-items:center;gap:.4rem;font-size:.78rem;padding:.4rem .7rem;border:1px solid var(--steel,#1E3A5F);border-radius:4px;cursor:pointer;background:var(--navy,#0A1628)}
.valmail-tpl.on{border-color:var(--teal,#00B4C8);box-shadow:inset 0 0 0 1px var(--teal,#00B4C8)}
.valmail-tpl input{accent-color:var(--teal,#00B4C8)}
.valmail-sub{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.valmail-lab{font-family:var(--mono,monospace);font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--teal,#00B4C8)}
.valmail-allbtn{font-family:var(--mono,monospace);font-size:.66rem;background:none;border:1px solid var(--steel,#1E3A5F);color:var(--muted,#8FA3BF);border-radius:3px;padding:.2rem .5rem;cursor:pointer}
.valmail-list{max-height:190px;overflow:auto;border:1px solid var(--steel,#1E3A5F);border-radius:4px;background:var(--navy,#0A1628)}
.valmail-item{display:flex;align-items:flex-start;gap:.5rem;padding:.4rem .6rem;border-bottom:1px solid rgba(255,255,255,.05);font-size:.74rem;cursor:pointer}
.valmail-item:last-child{border-bottom:none}
.valmail-item input{margin-top:.15rem;accent-color:var(--teal,#00B4C8)}
.valmail-empty{padding:.8rem;color:var(--amber,#FFB300);font-size:.78rem}
.valmail-field{display:flex;flex-direction:column;gap:.25rem}
.valmail-field input,.valmail-field textarea{width:100%;background:var(--navy,#0A1628);border:1px solid var(--steel,#1E3A5F);color:var(--text,#D4DEF0);border-radius:3px;padding:.45rem .6rem;font-family:var(--body,system-ui);font-size:.8rem;outline:none}
.valmail-field textarea{min-height:230px;font-family:var(--mono,monospace);font-size:.74rem;line-height:1.45;resize:vertical;white-space:pre-wrap}
.valmail-ai{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.valmail-ai input{flex:1;min-width:170px;background:var(--navy,#0A1628);border:1px solid var(--steel,#1E3A5F);color:var(--text,#D4DEF0);border-radius:3px;padding:.35rem .6rem;font-family:var(--mono,monospace);font-size:.7rem}
.valmail-foot{display:flex;flex-wrap:wrap;gap:.5rem;padding:.8rem 1rem;border-top:1px solid var(--steel,#1E3A5F)}
.valmail-btn{font-family:var(--mono,monospace);font-size:.74rem;font-weight:700;padding:.45rem .8rem;border:none;border-radius:3px;cursor:pointer}
.valmail-btn.primary{background:var(--ihc-red,#D91F2C);color:#fff}
.valmail-btn.ghost{background:none;border:1px solid var(--steel,#1E3A5F);color:var(--text,#D4DEF0)}
.valmail-btn.ai{background:var(--teal,#00B4C8);color:#04222b}
.valmail-btn:disabled{opacity:.5;cursor:default}
.valmail-note{font-size:.68rem;color:var(--muted,#8FA3BF);align-self:center;margin-right:auto}`;
    document.head.appendChild(s);
  }

  /* ---------- modal opbouwen (eenmalig) ---------- */
  function build() {
    injectCss();
    const root = document.createElement('div');
    root.className = 'valmail-overlay'; root.id = 'valmail-overlay';
    root.innerHTML = `
      <div class="valmail-panel" role="dialog" aria-modal="true">
        <div class="valmail-head">
          <h3>\u2709 Mail opstellen \u2014 itemlijst</h3>
          <button class="valmail-x" data-x title="Sluiten">\u00d7</button>
        </div>
        <div class="valmail-body">
          <div class="valmail-tpls" id="valmail-tpls"></div>
          <div class="valmail-sub">
            <span class="valmail-lab">Opgemerkte regels (aanvinken)</span>
            <button class="valmail-allbtn" id="valmail-all">alles aan/uit</button>
          </div>
          <div class="valmail-list" id="valmail-list"></div>
          <div class="valmail-field"><span class="valmail-lab">Aan</span><input id="valmail-to" type="text" placeholder="ontvanger@voorbeeld.nl"></div>
          <div class="valmail-field"><span class="valmail-lab">Onderwerp</span><input id="valmail-subj" type="text"></div>
          <div class="valmail-field"><span class="valmail-lab">Bericht (vrij te bewerken)</span><textarea id="valmail-text"></textarea></div>
          <div class="valmail-ai">
            <input id="valmail-key" type="password" placeholder="Anthropic API-sleutel (optioneel, voor AI-verbetering)">
            <button class="valmail-btn ai" id="valmail-aibtn">\uD83E\uDD16 AI: verbeter tekst</button>
          </div>
        </div>
        <div class="valmail-foot">
          <span class="valmail-note" id="valmail-note"></span>
          <button class="valmail-btn ghost" id="valmail-regen">\uD83D\uDD04 Opnieuw genereren</button>
          <button class="valmail-btn ghost" id="valmail-copy">\uD83D\uDCCB Kopieer tekst</button>
          <button class="valmail-btn primary" id="valmail-send">\u2709 Open in mail</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    dom = {
      root, tpls: root.querySelector('#valmail-tpls'), list: root.querySelector('#valmail-list'),
      all: root.querySelector('#valmail-all'), to: root.querySelector('#valmail-to'),
      subj: root.querySelector('#valmail-subj'), text: root.querySelector('#valmail-text'),
      key: root.querySelector('#valmail-key'), aibtn: root.querySelector('#valmail-aibtn'),
      note: root.querySelector('#valmail-note'), regen: root.querySelector('#valmail-regen'),
      copy: root.querySelector('#valmail-copy'), send: root.querySelector('#valmail-send')
    };

    // template-keuze
    dom.tpls.innerHTML = Object.keys(TEMPLATES).map(k =>
      `<label class="valmail-tpl${k === _tplKey ? ' on' : ''}" data-tpl="${k}"><input type="radio" name="valmail-tpl" value="${k}" ${k === _tplKey ? 'checked' : ''}>${_esc(TEMPLATES[k].naam)}</label>`
    ).join('');
    dom.tpls.querySelectorAll('input[name=valmail-tpl]').forEach(r => r.onchange = () => { _tplKey = r.value; selectTemplate(); });

    root.querySelector('[data-x]').onclick = close;
    root.addEventListener('click', e => { if (e.target === root) close(); });
    dom.all.onclick = () => { const allOn = _items.length && _sel.size === _items.length; _sel = allOn ? new Set() : new Set(_items.map((_, i) => i)); renderList(); regen(); };
    dom.regen.onclick = regen;
    dom.copy.onclick = doCopy;
    dom.send.onclick = doSend;
    dom.aibtn.onclick = doAI;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dom.root.classList.contains('on')) close(); });
  }

  /* ---------- render ---------- */
  function selectTemplate() {
    const t = TEMPLATES[_tplKey];
    dom.tpls.querySelectorAll('.valmail-tpl').forEach(l => l.classList.toggle('on', l.dataset.tpl === _tplKey));
    _items = t.itemsFn();
    _sel = new Set(_items.map((_, i) => i));   // standaard: alle opgemerkte regels aan
    dom.to.value = t.to || '';
    dom.subj.value = t.subject();
    renderList(); regen();
  }
  function renderList() {
    const t = TEMPLATES[_tplKey];
    if (!_items.length) { dom.list.innerHTML = `<div class="valmail-empty">${_esc(t.empty)}</div>`; return; }
    dom.list.innerHTML = _items.map((it, i) =>
      `<label class="valmail-item"><input type="checkbox" data-i="${i}" ${_sel.has(i) ? 'checked' : ''}><span>${_esc(t.label(it))}</span></label>`
    ).join('');
    dom.list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
      const i = +cb.dataset.i; if (cb.checked) _sel.add(i); else _sel.delete(i); regen();
    });
  }
  function selectedItems() { return _items.filter((_, i) => _sel.has(i)); }
  function regen() {
    const t = TEMPLATES[_tplKey];
    const sel = selectedItems();
    dom.text.value = sel.length ? t.bodyFn(sel) : t.empty;
    dom.note.textContent = `${sel.length} van ${_items.length} regel(s) geselecteerd`;
    dom.send.disabled = !sel.length;
  }

  /* ---------- acties ---------- */
  function doCopy() {
    const txt = dom.text.value;
    const done = () => { dom.copy.textContent = '\u2713 Gekopieerd'; setTimeout(() => dom.copy.innerHTML = '\uD83D\uDCCB Kopieer tekst', 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done && done(); }

  function doSend() {
    const to = encodeURIComponent(dom.to.value.trim());
    const url = 'mailto:' + dom.to.value.trim()
      + '?subject=' + encodeURIComponent(dom.subj.value)
      + '&body=' + encodeURIComponent(dom.text.value);
    window.location.href = url;
  }

  async function doAI() {
    const key = (dom.key.value || '').trim();
    if (!key) { dom.note.textContent = 'Vul een Anthropic API-sleutel in voor AI-verbetering.'; return; }
    if (!dom.text.value.trim()) { dom.note.textContent = 'Er is nog geen tekst om te verbeteren.'; return; }
    const old = dom.aibtn.textContent; dom.aibtn.disabled = true; dom.aibtn.textContent = '\u23F3 Bezig\u2026';
    const prompt =
      'Herschrijf onderstaande zakelijke e-mail in correct, beleefd en professioneel Nederlands. ' +
      'Behoud ALLE feiten exact: regelnummers/referenties, kolomnamen, afmetingen, gewichten en e-mailadressen. ' +
      'Verzin niets bij en laat geen regels weg. Geef UITSLUITEND de definitieve e-mailtekst terug, zonder inleiding of toelichting.\n\n' +
      '--- E-MAIL ---\n' + dom.text.value;
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      });
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (txt) { dom.text.value = txt; dom.note.textContent = '\u2713 Tekst verbeterd met AI'; }
      else dom.note.textContent = 'Geen tekst ontvangen van de API.';
    } catch (e) {
      dom.note.textContent = 'AI-verbetering mislukt: ' + e.message;
    } finally { dom.aibtn.disabled = false; dom.aibtn.textContent = old; }
  }

  /* ---------- open/close ---------- */
  function open(opts) {
    if (!dom) build();
    if (opts && opts.template && TEMPLATES[opts.template]) _tplKey = opts.template;
    dom.tpls.querySelectorAll('input[name=valmail-tpl]').forEach(r => { r.checked = (r.value === _tplKey); });
    selectTemplate();
    dom.root.classList.add('on');
  }
  function close() { if (dom) dom.root.classList.remove('on'); }

  global.ValMailer = { open, close,
    _supplierItems: supplierItems, _afsItems: afsItems,
    _supplierBody: supplierBody, _afsBody: afsBody };

  /* ---------- open-knop automatisch in de toolbar plaatsen ---------- */
  function _mountLaunch() {
    const bar = document.querySelector('.val-toolbar');
    if (!bar || document.getElementById('valmail-launch')) return;
    const btn = document.createElement('button');
    btn.id = 'valmail-launch';
    btn.className = 'btn-val btn-val-mail';
    btn.type = 'button';
    btn.textContent = '\u2709 Mail opstellen';
    btn.onclick = function () { open(); };
    bar.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mountLaunch);
  else _mountLaunch();
})(window);
