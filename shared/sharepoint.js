/* ── Royal IHC — SharePoint MSAL + Graph API Helper ──────── */
(function(){
  "use strict";

  let msalApp = null;

  /* ── Configuration (stored in localStorage) ──────────── */
  function getConfig(){
    try{ return JSON.parse(localStorage.getItem('ihc-sp-config')||'{}'); }
    catch(e){ return {}; }
  }
  function saveConfig(cfg){
    localStorage.setItem('ihc-sp-config', JSON.stringify(cfg));
  }

  /* ── MSAL init ───────────────────────────────────────── */
  function spInit(clientId){
    if(!clientId) throw new Error('Client ID is vereist — maak een Azure App Registration aan.');
    if(typeof msal==='undefined') throw new Error('MSAL library niet geladen. Voeg de CDN script tag toe.');

    msalApp = new msal.PublicClientApplication({
      auth:{
        clientId: clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache:{
        cacheLocation:'localStorage',
        storeAuthStateInCookie:false,
      }
    });
    return msalApp;
  }

  /* ── Get token (silent → popup fallback) ─────────────── */
  async function spGetToken(){
    if(!msalApp) throw new Error('Roep eerst spInit(clientId) aan.');
    const scopes = ['https://graph.microsoft.com/Files.Read.All'];

    const accounts = msalApp.getAllAccounts();
    if(accounts.length > 0){
      try{
        const resp = await msalApp.acquireTokenSilent({scopes, account:accounts[0]});
        return resp.accessToken;
      }catch(e){
        /* silent failed — try popup */
      }
    }
    const resp = await msalApp.loginPopup({scopes});
    return resp.accessToken;
  }

  /* ── Login (explicit popup) ──────────────────────────── */
  async function spLogin(){
    if(!msalApp){
      const cfg = getConfig();
      if(!cfg.clientId) throw new Error('Stel eerst een Client ID in via de configuratie.');
      spInit(cfg.clientId);
    }
    return await spGetToken();
  }

  /* ── Convert SharePoint URL → Graph download URL ─────── */
  function spUrlToGraph(spUrl){
    // Input:  https://ihcmerwede.sharepoint.com/sites/TeamsitesExternal/ihclogistics/Shared Documents/01 - AFS .../file.xlsx
    // Output: https://graph.microsoft.com/v1.0/sites/ihcmerwede.sharepoint.com:/sites/TeamsitesExternal/ihclogistics:/drive/root:/Shared Documents/01 - AFS .../file.xlsx:/content

    const u = new URL(spUrl);
    const host = u.hostname; // ihcmerwede.sharepoint.com
    const pathParts = u.pathname.split('/');

    // Find "Shared Documents" or "Shared%20Documents" position
    let sdIdx = -1;
    for(let i=0;i<pathParts.length;i++){
      if(decodeURIComponent(pathParts[i]).toLowerCase()==='shared documents'){
        sdIdx = i; break;
      }
    }

    // Site path = everything between first segment and "Shared Documents"
    // e.g. /sites/TeamsitesExternal/ihclogistics
    let sitePath = '';
    for(let i=1;i<sdIdx;i++){
      sitePath += '/' + pathParts[i];
    }

    // File path within the drive (from "Shared Documents" onward)
    let filePath = '';
    for(let i=sdIdx;i<pathParts.length;i++){
      filePath += '/' + decodeURIComponent(pathParts[i]);
    }
    filePath = filePath.substring(1); // remove leading /

    const graphUrl = `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}:/drive/root:/${filePath}:/content`;
    return graphUrl;
  }

  /* ── Fetch file from SharePoint ──────────────────────── */
  async function spFetchFile(sharePointUrl, accessToken){
    const graphUrl = spUrlToGraph(sharePointUrl);
    const resp = await fetch(graphUrl, {
      headers:{ 'Authorization': 'Bearer ' + accessToken }
    });
    if(!resp.ok){
      const txt = await resp.text();
      throw new Error(`Graph API ${resp.status}: ${txt.substring(0,200)}`);
    }
    const buf = await resp.arrayBuffer();
    const name = decodeURIComponent(sharePointUrl.split('/').pop().split('?')[0]);
    return { data: buf, name: name };
  }

  /* ── Load file from SharePoint → IndexedDB ──────────── */
  async function spLoadToIDB(sharePointUrl, dbKey){
    const token = await spGetToken();
    const file = await spFetchFile(sharePointUrl, token);
    if(window.IHC_DB && window.IHC_DB.put){
      await window.IHC_DB.put(dbKey, file.data, file.name);
    }
    window.dispatchEvent(new CustomEvent('ihc-file-loaded',{detail:{key:dbKey, name:file.name, source:'sharepoint'}}));
    return file;
  }

  /* ── Expose globally ─────────────────────────────────── */
  window.IHC_SP = {
    init: spInit,
    login: spLogin,
    getToken: spGetToken,
    fetchFile: spFetchFile,
    loadToIDB: spLoadToIDB,
    urlToGraph: spUrlToGraph,
    getConfig: getConfig,
    saveConfig: saveConfig,
  };
})();
