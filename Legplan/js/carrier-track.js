/* ============================================================================
 *  IHC Expedite 2.0 — Track & Trace (carrier-router, view-only popup)
 *  ---------------------------------------------------------------------------
 *  Gratis, puur front-end: geen API, token, proxy of deployment nodig.
 *  Herkent de rederij aan het 4-letter-voorvoegsel van het container-/B/L-
 *  nummer en opent de juiste rederij-trackingpagina in een popup.
 *
 *  Let op: rederijsites blokkeren doorgaans embedden in een iframe
 *  (X-Frame-Options/CSP). Daarom toont de popup de herkende rederij + een
 *  knop die de tracking in een nieuw tabblad opent. Voor de grote rederijen
 *  wordt het nummer direct in de URL meegegeven; voor de rest open je hun
 *  trackingpagina waar je het nummer plakt.
 *
 *  Gebruik:  CarrierTrack.open('HLBU8191850','container')
 *            CarrierTrack.open('HLCURTM260620198','bl')
 *            CarrierTrack.open({ bl:'...', container:'...' })   // bl voorrang
 * ========================================================================== */
(function () {
  'use strict';

  /* ── rederijen + URL-opbouw ─────────────────────────────────────────────
   *  deep:true  = nummer gaat direct in de URL (toont meteen resultaat)
   *  deep:false = opent de trackingpagina; nummer daar zelf plakken
   * ──────────────────────────────────────────────────────────────────── */
  var CARRIERS = {
    maersk:   { name: 'Maersk', deep: true, url: function (n) {
      return 'https://www.maersk.com/tracking/' + encodeURIComponent(n); } },
    hapag:    { name: 'Hapag-Lloyd', deep: true, url: function (n, t) {
      var base = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
      return base + '?' + (t === 'container' ? 'container=' : 'blno=') + encodeURIComponent(n); } },
    msc:      { name: 'MSC', deep: true, url: function (n) {
      return 'https://www.msc.com/en/track-a-shipment?trackingNumber=' + encodeURIComponent(n) + '&trackingMode=01'; } },
    cmacgm:   { name: 'CMA CGM', deep: true, url: function (n, t) {
      return 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=' +
        (t === 'container' ? 'Container' : 'BL') + '&Reference=' + encodeURIComponent(n); } },
    zim:      { name: 'ZIM', deep: true, url: function (n) {
      return 'https://www.zim.com/tools/track-a-shipment?consnumber=' + encodeURIComponent(n); } },
    cosco:    { name: 'COSCO', deep: false, url: function () {
      return 'https://elines.coscoshipping.com/ebusiness/cargoTracking'; } },
    oocl:     { name: 'OOCL', deep: false, url: function () {
      return 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx'; } },
    one:      { name: 'ONE (Ocean Network Express)', deep: false, url: function () {
      return 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking'; } },
    evergreen:{ name: 'Evergreen', deep: false, url: function () {
      return 'https://www.evergreen-line.com/'; } },
    yangming: { name: 'Yang Ming', deep: false, url: function () {
      return 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx'; } },
    hmm:      { name: 'HMM', deep: false, url: function () {
      return 'https://www.hmm21.com/'; } },
    wanhai:   { name: 'Wan Hai', deep: false, url: function () {
      return 'https://www.wanhai.com/'; } }
  };

  // Voorvoegsel (eerste 4 letters) -> rederij. Container-owner-codes én B/L-SCAC.
  var PREFIX = {
    MAEU:'maersk', MRKU:'maersk', MSKU:'maersk', MRSU:'maersk', MSWU:'maersk', MNBU:'maersk',
    MWCU:'maersk', MIEU:'maersk', MCAU:'maersk', MHHU:'maersk', SEAU:'maersk', SEKU:'maersk',
    SUDU:'maersk', HASU:'maersk', PONU:'maersk', SAFM:'maersk',
    MSCU:'msc', MEDU:'msc', MSDU:'msc', MSMU:'msc', MSBU:'msc', MSNU:'msc',
    HLCU:'hapag', HLXU:'hapag', HLBU:'hapag', HPLU:'hapag', UACU:'hapag', UASU:'hapag',
    CMAU:'cmacgm', CGMU:'cmacgm', CMNU:'cmacgm', ECMU:'cmacgm', APMU:'cmacgm', DELU:'cmacgm',
    MAGU:'cmacgm', LIVU:'cmacgm', APLU:'cmacgm', APRU:'cmacgm', APHU:'cmacgm', APZU:'cmacgm', CNCU:'cmacgm',
    COSU:'cosco', CBHU:'cosco', CCLU:'cosco', CSNU:'cosco', CSLU:'cosco', CXDU:'cosco', CBXU:'cosco',
    OOLU:'oocl', OOCU:'oocl', OOSU:'oocl',
    ONEU:'one', ONEY:'one', NYKU:'one', MOLU:'one', MOAU:'one', KKLU:'one', KLFU:'one',
    EGLV:'evergreen', EGHU:'evergreen', EISU:'evergreen', EITU:'evergreen', EMCU:'evergreen',
    YMLU:'yangming', YMMU:'yangming', YMUU:'yangming',
    HDMU:'hmm', HMMU:'hmm',
    ZIMU:'zim', ZCSU:'zim', ZCLU:'zim',
    WHLU:'wanhai', WHSU:'wanhai'
  };

  function cleanNum(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function detect(number) { return PREFIX[number.slice(0, 4)] || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var STYLE_ID = 'crt-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.crt-overlay{position:fixed;inset:0;background:rgba(4,9,20,.8);backdrop-filter:blur(2px);',
      'display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;font-family:var(--body,system-ui,sans-serif)}',
      '.crt-modal{background:var(--mid,#0F2040);border:1px solid var(--steel,#1E3A5F);border-radius:8px;',
      'width:min(560px,96vw);max-height:90vh;overflow:auto;box-shadow:0 18px 60px rgba(0,0,0,.55);color:var(--text,#D4DEF0)}',
      '.crt-head{display:flex;align-items:center;gap:.6rem;padding:.85rem 1.1rem;border-bottom:1px solid var(--steel,#1E3A5F)}',
      '.crt-head h3{margin:0;font-family:var(--condensed,var(--body));font-size:1.15rem;letter-spacing:.5px;flex:1}',
      '.crt-sub{font-family:var(--mono,monospace);font-size:.72rem;color:var(--muted,#8FA3BF)}',
      '.crt-x{background:none;border:0;color:var(--muted,#8FA3BF);font-size:1.4rem;line-height:1;cursor:pointer;padding:.1rem .3rem}',
      '.crt-x:hover{color:#fff}',
      '.crt-body{padding:1.2rem 1.1rem}',
      '.crt-card{background:var(--navy,#0A1628);border:1px solid var(--steel,#1E3A5F);border-radius:6px;padding:1rem;text-align:center}',
      '.crt-l{font-family:var(--mono,monospace);font-size:.6rem;color:var(--muted,#8FA3BF);text-transform:uppercase;letter-spacing:.8px}',
      '.crt-carrier{font-family:var(--condensed,var(--body));font-size:1.5rem;margin:.2rem 0 .1rem;color:var(--teal,#00B4C8)}',
      '.crt-pref{font-family:var(--mono,monospace);font-size:.68rem;color:var(--muted,#8FA3BF);margin-bottom:1rem}',
      '.crt-btn{display:inline-block;background:var(--teal,#00B4C8);color:#04121a;text-decoration:none;font-family:var(--condensed,var(--body));',
      'font-size:1.05rem;font-weight:600;letter-spacing:.4px;padding:.6rem 1.4rem;border-radius:5px}',
      '.crt-btn:hover{filter:brightness(1.08)}',
      '.crt-note{margin-top:1rem;font-family:var(--mono,monospace);font-size:.68rem;line-height:1.5;color:var(--muted,#8FA3BF)}',
      '.crt-note b{color:var(--text,#D4DEF0);font-weight:600}'
    ].join('');
    document.head.appendChild(s);
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

    var prefix = number.slice(0, 4);
    var key = detect(number);
    var carrier = key ? CARRIERS[key] : null;
    var name = carrier ? carrier.name : 'Onbekende rederij';
    var url = carrier ? carrier.url(number, type)
      : 'https://www.track-trace.com/container'; // universele multi-carrier zoeker
    var deep = carrier ? carrier.deep : false;
    var label = (type === 'container' ? 'Container ' : 'BL ') + number;

    var note = !key
      ? 'Voorvoegsel <b>' + esc(prefix) + '</b> niet herkend. Deze knop opent een ' +
        'gratis multi-carrier zoeker; plak daar het nummer.'
      : (deep
        ? 'Opent het trackingresultaat direct in een nieuw tabblad. ' +
          'Klopt de rederij niet? Het voorvoegsel kan afwijken — laat het weten.'
        : 'Opent de trackingpagina van <b>' + esc(name) + '</b>. Plak daar het nummer ' +
          '(automatisch invullen kan niet vanwege beveiliging tussen websites).');

    injectStyle();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'crt-overlay';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
    }
    overlay.innerHTML =
      '<div class="crt-modal">' +
        '<div class="crt-head"><h3>Track &amp; Trace</h3>' +
          '<span class="crt-sub">' + esc(label) + '</span>' +
          '<button class="crt-x" title="Sluiten">&times;</button></div>' +
        '<div class="crt-body"><div class="crt-card">' +
          '<div class="crt-l">Herkende rederij</div>' +
          '<div class="crt-carrier">' + esc(name) + '</div>' +
          '<div class="crt-pref">voorvoegsel ' + esc(prefix) + '</div>' +
          '<a class="crt-btn" href="' + esc(url) + '" target="_blank" rel="noopener">' +
            'Open tracking ' + (key ? 'bij ' + esc(name) : '') + ' \u2197</a>' +
          '<div class="crt-note">' + note + '</div>' +
        '</div></div>' +
      '</div>';
    overlay.querySelector('.crt-x').addEventListener('click', close);
  }

  window.CarrierTrack = { open: open, close: close, detect: detect, carriers: CARRIERS };
})();
