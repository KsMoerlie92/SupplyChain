// ── Utilities: esc(), setStatus() ─────────────────────────────────────────
// ── Utility ────────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;');

function setStatus(msg, isErr) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = 'status-msg' + (isErr ? ' err' : '');
}

