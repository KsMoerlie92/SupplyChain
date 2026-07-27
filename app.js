:root{
  --bg:#0A1628;--card:#0F2040;--card-hover:#162B52;--border:#1e3a6e;
  --text:#D4DEF0;--text-dim:#8FA3BF;
  --accent:#00B4C8;--red:#D91F2C;--orange:#FFB300;--green:#00C853;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Barlow',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.wrap{max-width:900px;margin:0 auto;padding:28px 20px 60px}

.header{margin-bottom:22px}
.title-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.header h1{font-size:1.4em;margin:0;font-weight:700}
.header .version{font-size:.6em;color:var(--green);font-weight:400;vertical-align:middle}
.header .sub{color:var(--text-dim);font-size:.85em;margin:8px 0 0;max-width:70ch}
.header-actions{display:flex;gap:8px}

.btn{padding:8px 14px;border-radius:8px;border:none;font-weight:700;font-size:.8em;cursor:pointer}
.btn-secondary{background:var(--card);color:var(--text);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--card-hover)}

.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:18px}
.card h3{margin:0 0 12px;font-size:1em}

.ident-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.ident-grid label{display:flex;flex-direction:column;gap:5px;font-size:.75em;color:var(--text-dim);font-weight:600}
.ident-grid input{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;
  color:var(--text);font-family:inherit;font-size:.95em}
.ident-grid input:focus{outline:none;border-color:var(--accent)}

.crit-row{border-top:1px solid var(--border);padding:14px 0;display:grid;
  grid-template-columns:1fr;gap:8px}
.crit-row:first-child{border-top:none;padding-top:0}
.crit-req{font-size:.9em}
.crit-measure{font-size:.8em;color:var(--text-dim);font-style:italic}
.crit-answer{display:flex;gap:18px}
.crit-answer label{display:flex;align-items:center;gap:6px;font-weight:700;font-size:.85em;cursor:pointer}
.radio-yes input:checked ~ *, .radio-yes{accent-color:var(--green)}
.radio-no{accent-color:var(--red)}
.crit-just{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;
  color:var(--text);font-family:inherit;font-size:.85em;min-height:44px;resize:vertical}
.crit-just:focus{outline:none;border-color:var(--accent)}

.result-card{border-left:4px solid var(--text-dim);transition:border-color .2s}
.result-card.result-pending{border-left-color:var(--orange)}
.result-card.result-ok{border-left-color:var(--green)}
.result-card.result-bad{border-left-color:var(--red)}
.result-text{font-size:.95em}

.saved-list{display:flex;flex-direction:column;gap:8px}
.saved-item{position:relative;background:var(--bg);border:1px solid var(--border);border-radius:8px;
  padding:10px 40px 10px 12px;cursor:pointer;font-size:.85em;transition:border-color .15s}
.saved-item:hover{border-color:var(--accent)}
.saved-item.active{border-color:var(--accent);background:var(--card-hover)}
.muted{color:var(--text-dim);font-size:.85em;margin-top:2px}
.badge{display:inline-block;font-size:.7em;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px}
.badge-pending{background:rgba(255,179,0,.15);color:var(--orange)}
.badge-ok{background:rgba(0,200,83,.15);color:var(--green)}
.badge-bad{background:rgba(217,31,44,.15);color:var(--red)}
.btn-del{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;
  color:var(--text-dim);cursor:pointer;font-size:1em;padding:4px}
.btn-del:hover{color:var(--red)}

.footer{text-align:center;color:var(--text-dim);font-size:.75em;margin-top:20px}

@media print{
  body{background:#fff;color:#000}
  .header-actions,.saved-list,.card:has(#saved-list){display:none !important}
  .card{background:#fff;border:1px solid #ccc;break-inside:avoid}
  .crit-measure,.muted,.header .sub{color:#555}
}
