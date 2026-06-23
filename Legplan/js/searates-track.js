/* ============================================================================
 *  IHC Expedite 2.0 — Track & Trace (SeaRates, view-only popup)
 *  ---------------------------------------------------------------------------
 *  Snelle variant zonder API/token: opent de SeaRates-trackingpagina view-only
 *  in een IHC-popup (iframe), zodat je het portaal niet hoeft te verlaten.
 *
 *  URL-opbouw (zoals het voorbeeld):
 *    https://www.searates.com/container/tracking/?shipment-type=sea
 *        &number=<BL/CONTAINER>&type=<BL|CT>&sealine=<SCAC>
 *  De sealine (rederijcode) wordt afgeleid uit de eerste 4 letters van het
 *  nummer (bv. HLCURTM... -> HLCU = Hapag-Lloyd).
 *
 *  Gebruik:  SeaRatesTrack.open('HLCURTM260639546','bl')
 *            SeaRatesTrack.open('TEMU1234567','container')
 *            SeaRatesTrack.open({ bl:'...', container:'...' })   // bl heeft voorrang
 *
 *  Let op: sommige sites blokkeren embedden via iframe. Mocht de pagina leeg
 *  blijven, dan staat er altijd een "Openen in nieuw tabblad"-link klaar.
 * ========================================================================== */
(function () {
  'use strict';

  var STYLE_ID = 'srt-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.srt-overlay{position:fixed;inset:0;background:rgba(4,9,20,.8);backdrop-filter:blur(2px);',
      'display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;font-family:var(--body,system-ui,sans-serif)}',
      '.srt-modal{background:var(--mid,#0F2040);border:1px solid var(--steel,#1E3A5F);border-radius:8px;',
      'width:min(1100px,96vw);height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.55)}',
      '.srt-head{display:flex;align-items:center;gap:.7rem;padding:.7rem 1rem;border-bottom:1px solid var(--steel,#1E3A5F);',
      'background:var(--mid,#0F2040);color:var(--text,#D4DEF0);flex:0 0 auto}',
      '.srt-head h3{margin:0;font-family:var(--condensed,var(--body));font-size:1.1rem;letter-spacing:.5px}',
      '.srt-sub{font-family:var(--mono,monospace);font-size:.72rem;color:var(--muted,#8FA3BF);flex:1}',
      '.srt-ext{font-family:var(--mono,monospace);font-size:.72rem;color:var(--teal,#00B4C8);text-decoration:none;',
      'border:1px solid var(--steel,#1E3A5F);border-radius:4px;padding:.3rem .6rem;white-space:nowrap}',
      '.srt-ext:hover{background:var(--navy,#0A1628)}',
      '.srt-x{background:none;border:0;color:var(--muted,#8FA3BF);font-size:1.5rem;line-height:1;cursor:pointer;padding:.1rem .3rem}',
      '.srt-x:hover{color:#fff}',
      '.srt-frame{flex:1 1 auto;width:100%;border:0;background:#fff}',
      '.srt-note{flex:0 0 auto;padding:.4rem 1rem;font-family:var(--mono,monospace);font-size:.62rem;',
      'color:var(--muted,#8FA3BF);border-top:1px solid var(--steel,#1E3A5F);background:var(--mid,#0F2040)}',
      '.srt-note a{color:var(--teal,#00B4C8);text-decoration:none}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function cleanNum(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // Embeddable tracking-widget: de officiële SeaRates iframe-host (sirius).
  // Toont direct het resultaat en auto-detecteert de rederij op basis van het nummer.
  function embedUrl(number) {
    return 'https://sirius.searates.com/tracking?number=' + encodeURIComponent(number);
  }
  // Volledige resultaatpagina op searates.com (voor "openen in nieuw tabblad").
  function pageUrl(number) {
    return 'https://www.searates.com/tracking-system/reverse/tracking' +
      '?route=true&last_successful=false&number=' + encodeURIComponent(number);
  }

  var overlay = null;
  function close() {
    if (overlay) { overlay.remove(); overlay = null; document.removeEventListener('keydown', onKey); }
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(input, typeArg) {
    var number, type;
    if (input && typeof input === 'object') {
      if (input.bl) { number = input.bl; type = 'bl'; }
      else { number = input.container; type = 'container'; }
    } else { number = input; type = typeArg || 'bl'; }
    number = cleanNum(number);
    if (!number) return;

    var ifrUrl = embedUrl(number);
    var pageU  = pageUrl(number);
    var label = (type === 'container' ? 'Container ' : 'BL ') + number;

    injectStyle();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'srt-overlay';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
    }
    overlay.innerHTML =
      '<div class="srt-modal">' +
        '<div class="srt-head">' +
          '<h3>Track &amp; Trace</h3>' +
          '<span class="srt-sub">' + esc(label) + '</span>' +
          '<a class="srt-ext" href="' + esc(pageU) + '" target="_blank" rel="noopener">Openen in nieuw tabblad \u2197</a>' +
          '<button class="srt-x" title="Sluiten">&times;</button>' +
        '</div>' +
        '<iframe class="srt-frame" src="' + esc(ifrUrl) + '" loading="lazy"></iframe>' +
        '<div class="srt-note">Bron: SeaRates (view-only). Laadt de tracker niet? ' +
          '<a href="' + esc(pageU) + '" target="_blank" rel="noopener">Openen in nieuw tabblad</a>.</div>' +
      '</div>';
    overlay.querySelector('.srt-x').addEventListener('click', close);
  }

  window.SeaRatesTrack = { open: open, close: close, embedUrl: embedUrl, pageUrl: pageUrl };
})();
