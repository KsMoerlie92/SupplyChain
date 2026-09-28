/* ============================================================
   shared/site-gate.js  —  IHC Expedite 2.0
   Lichte toegangspoort voor de hele site (elke pagina laadt dit).

   LET OP — dit is GEEN echte beveiliging, en is dat ook nooit
   bedoeld: de site heeft geen server, en onderliggende bestanden
   (zoals shared/expediting-data.json) blijven ook zonder deze poort
   rechtstreeks opvraagbaar via hun eigen URL. Dit weerhoudt een
   toevallige bezoeker, niet iemand die het serieus probeert. Voor
   echte toegangsbeveiliging: zie het Technical Design-document
   (aanbeveling: Azure Static Web Apps + Entra ID, of een privé-repo).

   De gebruikerslijst staat BEWUST niet in dit bestand, maar in
   shared/access-list.json — een bestand dat nergens in de navigatie
   gelinkt wordt, dus niet vindbaar is door gewoon door de site te
   klikken. Wachtwoorden staan daar als SHA-256-hash, nooit als platte
   tekst. Dat is een hogere drempel, geen garantie: wie deze broncode
   leest, ziet ook welk bestand er wordt opgehaald.

   Gebruiker toevoegen/wijzigen: genereer de hash in de browserconsole met
     await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nieuwWachtwoord'))
       .then(b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))
   en zet gebruikersnaam + hash in shared/access-list.json.
   ============================================================ */
(function () {
  'use strict';

  // shared/access-list.json staat naast dit script — pad afleiden van de
  // eigen scriptlocatie (zelfde patroon als expediting-data.js), zodat het
  // altijd klopt ongeacht vanaf welke paginadiepte dit script geladen wordt.
  const _SELF = (document.currentScript && document.currentScript.src) || '';
  const _USERS_URL = _SELF ? _SELF.replace(/[^/]+$/, 'access-list.json') : 'shared/access-list.json';

  async function loadUsers() {
    try {
      const res = await fetch(_USERS_URL, { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j.users) ? j.users : [];
    } catch (e) { return []; }
  }

  const LS_KEY = 'ihc_gate_session';

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function isLoggedIn() {
    try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; }

  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ihc-gate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
        background:rgba(5,12,26,.94);backdrop-filter:blur(6px);
        font-family:'Barlow',Arial,sans-serif}
      #ihc-gate .card{width:min(360px,92vw);background:#0F2040;border:1px solid #1e3a6e;
        border-top:3px solid #D91F2C;border-radius:12px;padding:1.6rem;text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,.5)}
      #ihc-gate .card .ico{font-size:1.6rem}
      #ihc-gate .card h2{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;
        letter-spacing:.04em;margin:.3rem 0;color:#F0F4FA;font-size:1.15rem}
      #ihc-gate .card p{color:#6b7a99;font-size:.8rem;margin:0 0 1rem}
      #ihc-gate .card input{width:100%;box-sizing:border-box;font-family:'JetBrains Mono','Courier New',monospace;
        font-size:.92rem;padding:.6rem .7rem;border-radius:8px;border:1px solid #1e3a6e;
        background:#0A1628;color:#F0F4FA;outline:none;margin-bottom:.6rem}
      #ihc-gate .card input:focus{border-color:#D91F2C}
      #ihc-gate .card button{margin-top:.3rem;width:100%;padding:.65rem;border:none;border-radius:8px;
        cursor:pointer;background:#D91F2C;color:#fff;font-family:'JetBrains Mono','Courier New',monospace;
        font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:.78rem}
      #ihc-gate .card button:hover{filter:brightness(1.08)}
      #ihc-gate .err{color:#ef4444;font-size:.74rem;min-height:1.1em;margin-top:.6rem}
      #ihc-logout-btn{position:fixed;bottom:.6rem;right:.6rem;z-index:99998;
        background:rgba(15,32,64,.85);color:#6b7a99;border:1px solid #1e3a6e;border-radius:6px;
        padding:.3rem .6rem;font-size:.65rem;font-family:'JetBrains Mono',monospace;cursor:pointer}
      #ihc-logout-btn:hover{color:#F0F4FA;border-color:#D91F2C}
    `;
    document.head.appendChild(style);
  }

  function showGate(users) {
    injectStyles();
    const gate = document.createElement('div');
    gate.id = 'ihc-gate';
    gate.innerHTML = `
      <div class="card">
        <div class="ico">🔒</div>
        <h2>IHC Expedite 2.0</h2>
        <p>Log in om verder te gaan.</p>
        <input id="ihc-gate-user" placeholder="Gebruikersnaam" autocomplete="username">
        <input id="ihc-gate-pass" type="password" placeholder="Wachtwoord" autocomplete="current-password">
        <button id="ihc-gate-btn" type="button">Inloggen</button>
        <div class="err" id="ihc-gate-err"></div>
      </div>`;
    document.documentElement.appendChild(gate);

    const userInput = gate.querySelector('#ihc-gate-user');
    const passInput = gate.querySelector('#ihc-gate-pass');
    const errEl = gate.querySelector('#ihc-gate-err');

    if (!users.length) {
      errEl.textContent = 'Gebruikerslijst kon niet geladen worden (shared/access-list.json) — neem contact op met de beheerder.';
    }

    async function tryLogin() {
      const u = userInput.value.trim().toLowerCase();
      const p = passInput.value;
      const hash = await sha256(p);
      const match = users.find(x => x.user.toLowerCase() === u && x.passHash === hash);
      if (match) {
        try { localStorage.setItem(LS_KEY, match.user); } catch (e) {}
        gate.remove();
        addLogoutButton();
      } else {
        errEl.textContent = 'Onjuiste gebruikersnaam of wachtwoord.';
        passInput.value = '';
        passInput.focus();
      }
    }
    gate.querySelector('#ihc-gate-btn').addEventListener('click', tryLogin);
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });
    setTimeout(() => userInput.focus(), 50);
  }

  function addLogoutButton() {
    if (document.getElementById('ihc-logout-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ihc-logout-btn';
    btn.type = 'button';
    btn.textContent = '🔒 Uitloggen';
    btn.addEventListener('click', () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      location.reload();
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  async function init() {
    if (isLoggedIn()) { addLogoutButton(); return; }
    const users = await loadUsers();
    showGate(users);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
