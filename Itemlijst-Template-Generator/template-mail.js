/**
 * template-mail.js  –  IHC Expedite 2.0 · Itemlijst Template Generator
 *
 * Zelfde beproefde patroon als val-export-mail.js (Itemlijst-Validator):
 * genereert een .eml met X-Unsent:1 (opent als bewerkbaar concept in
 * Outlook) met de itemlijst-template als .xlsx-bijlage. Verschil met
 * val-export-mail.js: dit stuurt de (grotendeels lege) template NAAR de
 * leverancier, niet de ingevulde lijst terug naar de Moederlijst — daarom
 * geen vast "Aan"-adres en geen Power Automate-triggerwoord nodig.
 */
(function () {
  if (window.__templateMailLoaded) return;
  window.__templateMailLoaded = true;

  const trim = v => String(v ?? '').trim();

  function css(el, s) { Object.assign(el.style, s); return el; }

  function rowsToXlsxBase64(cols, rows) {
    const wsData = [cols, ...rows.map(r => cols.map(h => r[h] ?? ''))];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = cols.map(h => ({ wch: Math.max(h.length + 2, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Itemlijst');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }

  function buildEml(to, subject, body, xlsxBase64, attachFilename) {
    const boundary = 'IHC_EXPEDITE_' + Date.now().toString(36).toUpperCase();
    const b64Lines = (xlsxBase64.match(/.{1,76}/g) || [xlsxBase64]).join('\r\n');
    return [
      `To: ${to}`,
      `Subject: ${subject}`,
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

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function defaultBody(po, rowCount) {
    return [
      `Geachte,`,
      ``,
      `Bijgaand de itemlijst-template voor PO ${po}.`,
      `Wilt u deze aanvullen met de ontbrekende gegevens (Mark/Label, Serial number,`,
      `Material, Country of origin, Hs-code, waarde, colli en afmetingen) en`,
      `retourneren vóór verzending?`,
      ``,
      `Aantal regels: ${rowCount}`,
      ``,
      `Met vriendelijke groet,`,
      `Royal IHC — Expediting`,
    ].join('\r\n');
  }

  function field(label, value, editable) {
    const wrap = css(document.createElement('div'), {
      borderBottom: '1px solid rgba(30,58,110,0.5)', padding: '8px 0',
      display: 'flex', gap: '10px', alignItems: 'flex-start',
    });
    const lbl = css(document.createElement('span'), {
      minWidth: '88px', color: 'var(--ihc-muted,#6b7a99)', fontSize: '0.8rem', paddingTop: '2px',
      flexShrink: '0', textTransform: 'uppercase', letterSpacing: '0.04em',
      fontFamily: 'Barlow Condensed, Barlow, sans-serif',
    });
    lbl.textContent = label;
    if (editable) {
      const inp = css(document.createElement(value.length > 80 ? 'textarea' : 'input'), {
        flex: '1', background: 'transparent', color: 'var(--text,#e8edf5)', border: 'none', outline: 'none',
        fontSize: '0.88rem', fontFamily: 'Barlow, sans-serif', resize: 'vertical', lineHeight: '1.5',
      });
      inp.value = value;
      if (inp.tagName === 'TEXTAREA') inp.rows = 6;
      wrap.append(lbl, inp);
      wrap._input = inp;
    } else {
      const val = css(document.createElement('span'), {
        flex: '1', color: 'var(--text,#e8edf5)', fontSize: '0.88rem', lineHeight: '1.5', wordBreak: 'break-word',
      });
      val.textContent = value;
      wrap.append(lbl, val);
    }
    return wrap;
  }

  function open(po, rows) {
    if (!rows?.length) { alert('Geen regels om te versturen.'); return; }
    if (typeof XLSX === 'undefined') { alert('SheetJS (XLSX) is niet geladen.'); return; }

    const cols = window.TemplateGenerator.IL_COLS;
    const filename = `${po}_Itemlijst_template.xlsx`;
    const subject = `${po} Itemlijst template — graag invullen en retourneren`;
    const body = defaultBody(po, rows.length);

    const overlay = css(document.createElement('div'), {
      position: 'fixed', inset: '0', background: 'rgba(10,22,40,0.90)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '9999', padding: '16px',
    });
    const win = css(document.createElement('div'), {
      background: 'var(--ihc-mid,#0F2040)', border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '10px', width: '100%', maxWidth: '580px', maxHeight: '92vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', fontFamily: 'Barlow, sans-serif',
      boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
    });

    const titlebar = css(document.createElement('div'), {
      background: 'var(--ihc-navy,#0A1628)', borderBottom: '1px solid var(--ihc-steel,#1e3a6e)',
      padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px',
    });
    titlebar.innerHTML = `
      <span style="font-size:1.05rem;color:var(--ihc-teal,#00B4D8);">📧</span>
      <span style="font-weight:700;color:var(--text,#e8edf5);font-size:0.95rem;">Template mailen naar leverancier</span>`;

    const body_el = css(document.createElement('div'), { padding: '0 18px', overflowY: 'auto', flex: '1' });

    const fTo = field('Aan', '', true);
    fTo._input.placeholder = 'leverancier@voorbeeld.com';
    const fSubj = field('Onderwerp', subject, true);

    const attachWrap = css(document.createElement('div'), {
      borderBottom: '1px solid rgba(30,58,110,0.5)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px',
    });
    const attachLbl = css(document.createElement('span'), {
      minWidth: '88px', color: 'var(--ihc-muted,#6b7a99)', fontSize: '0.8rem',
      textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Barlow Condensed, Barlow, sans-serif',
    });
    attachLbl.textContent = 'Bijlage';
    const attachBadge = css(document.createElement('span'), {
      background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)', borderRadius: '4px',
      padding: '3px 10px', color: 'var(--ihc-teal,#00B4D8)', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace',
    });
    attachBadge.textContent = `📎 ${filename}`;
    attachWrap.append(attachLbl, attachBadge);

    const fBody = field('Bericht', body, true);

    body_el.append(fTo, fSubj, attachWrap, fBody);

    const footer = css(document.createElement('div'), {
      padding: '14px 18px', borderTop: '1px solid var(--ihc-steel,#1e3a6e)',
      display: 'flex', gap: '10px', alignItems: 'center',
    });
    const sendBtn = css(document.createElement('button'), {
      background: 'var(--ihc-teal,#00B4D8)', color: 'var(--ihc-navy,#0A1628)', border: 'none', borderRadius: '6px',
      padding: '10px 22px', fontWeight: '700', fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'Barlow, sans-serif',
    });
    sendBtn.textContent = '📨 Mail klaarzetten';
    const cancelBtn = css(document.createElement('button'), {
      background: 'transparent', color: '#a0b0c8', border: '1px solid var(--ihc-steel,#1e3a6e)',
      borderRadius: '6px', padding: '10px 18px', fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'Barlow, sans-serif',
    });
    cancelBtn.textContent = 'Annuleren';
    const statusMsg = css(document.createElement('span'), { marginLeft: 'auto', fontSize: '0.8rem', color: '#a0b0c8' });
    footer.append(sendBtn, cancelBtn, statusMsg);

    win.append(titlebar, body_el, footer);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    const close = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    sendBtn.addEventListener('click', () => {
      const to = trim(fTo._input.value);
      if (!to) { statusMsg.style.color = '#f87171'; statusMsg.textContent = 'Vul het e-mailadres van de leverancier in.'; return; }

      sendBtn.disabled = true; cancelBtn.disabled = true; sendBtn.textContent = '⏳ Genereren…'; statusMsg.textContent = '';
      try {
        const finalSubject = trim(fSubj._input.value) || subject;
        const finalBody = trim(fBody._input.value) || body;
        const xlsxB64 = rowsToXlsxBase64(cols, rows);
        const emlText = buildEml(to, finalSubject, finalBody, xlsxB64, filename);
        const emlFile = filename.replace('.xlsx', '.eml');
        downloadBlob(emlText, emlFile, 'message/rfc822');

        sendBtn.textContent = '✓ Klaar'; sendBtn.style.background = '#22c55e';
        statusMsg.style.color = '#4ade80';
        statusMsg.innerHTML = `<b>${emlFile}</b> gedownload.<br>Open het bestand in Outlook en klik Verzenden.`;
        setTimeout(close, 3500);
      } catch (err) {
        sendBtn.disabled = false; cancelBtn.disabled = false; sendBtn.textContent = '📨 Mail klaarzetten';
        statusMsg.style.color = '#f87171'; statusMsg.textContent = `Fout: ${err.message}`;
      }
    });
  }

  window.TemplateMail = { open };
})();
