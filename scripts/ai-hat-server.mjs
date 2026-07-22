#!/usr/bin/env node
/**
 * ai-hat-server.mjs — live, shared Image Hat production queue for the office LAN.
 *
 * Serves the dashboard at http://<this-mac>:4321 and stores each order's editing
 * status + note in a single JSON file on the shared server, so every team member
 * sees the same thing (unlike the static file, whose status was per-browser).
 *
 * Office-only by design: it binds to the LAN and nothing is hosted externally;
 * order data never leaves the network.
 *
 *   node scripts/ai-hat-server.mjs            # port 4321, last 60 days
 *   PORT=8080 DAYS=90 node scripts/ai-hat-server.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getJobs, esc, attachmentUrl, previewUrl, ROOT } from './ai-hat-core.mjs';

const PORT = Number(process.env.PORT || 4321);
const DAYS = Number(process.env.DAYS || 60);
const REFRESH_MS = 5 * 60 * 1000;              // re-pull orders from Shopify every 5 min

/* Shared status store lives on the server so everyone reads/writes the same file.
   Falls back to local disk if the share isn't mounted (then it's not shared). */
const SHARE_DIR = '/Volumes/CL Media Server/WEB/AI Hat Orders';
const STORE = fs.existsSync(SHARE_DIR)
  ? path.join(SHARE_DIR, 'status.json')
  : path.join(ROOT, 'scripts', 'out', 'status.json');

const STATES = ['todo', 'progress', 'done'];
const LABEL = { todo: 'To do', progress: 'In progress', done: 'Done' };

/* ---- status store ---- */
let status = {};
function loadStatus() { try { status = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { status = {}; } }
function saveStatus() {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    const tmp = STORE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
    fs.renameSync(tmp, STORE);                 // atomic — no half-written file
  } catch (e) { console.error('status save failed:', e.message); }
}

/* ---- orders cache ---- */
let cache = { jobs: [], store: '', at: 0, error: null };
async function refresh() {
  try {
    const { jobs, store } = await getJobs({ days: DAYS });
    cache = { jobs, store, at: Date.now(), error: null };
    console.log(`${new Date().toLocaleTimeString()}  refreshed — ${jobs.length} job(s)`);
  } catch (e) {
    cache.error = e.message;
    console.error(`${new Date().toLocaleTimeString()}  refresh failed — ${e.message}`);
  }
}

/* ---- page ---- */
function page() {
  const handle = (cache.store || '').replace('.myshopify.com', '');
  const rows = cache.jobs.map((j) => {
    const st = (status[j.order] || {});
    const state = STATES.includes(st.status) ? st.status : 'todo';
    const adminUrl = `https://admin.shopify.com/store/${handle}/orders/${j.orderId}`;
    const fa = (href, label, kind) => (href
      ? `<details class="fa"><summary>⬇ ${label}</summary><div class="fa__body">
           <img class="fa__img" src="${esc(previewUrl(href))}" alt="${esc(label)} preview" loading="lazy">
           <a class="fa__dl" href="${esc(attachmentUrl(href, kind, j))}" download>⬇ Download ${label.toLowerCase()}</a>
         </div></details>`
      : `<div class="fa fa--off">⬇ ${label}</div>`);
    return `<tr data-order="${esc(j.order)}" data-search="${esc((j.order + ' ' + j.shape + ' ' + j.variant + ' ' + (j.text || '')).toLowerCase())}">
      <td class="status">
        <button type="button" class="st" data-state="${state}">${LABEL[state]}</button>
        <textarea class="note" rows="2" placeholder="Add a note (e.g. why it's pending, image issue…)">${esc(st.note || '')}</textarea>
        <div class="by">${st.by || st.at ? esc((st.by ? st.by + ' · ' : '') + (st.at ? new Date(st.at).toLocaleString() : '')) : ''}</div>
      </td>
      <td class="thumb">${j.preview ? `<a href="${esc(j.preview)}" target="_blank" rel="noopener"><img src="${esc(j.preview)}" alt="preview" loading="lazy"></a>` : '<span class="none">—</span>'}</td>
      <td><a class="order" href="${esc(adminUrl)}" target="_blank" rel="noopener">${esc(j.order)}</a>
        <div class="meta">${esc(new Date(j.createdAt).toLocaleString())}</div>
        <div class="meta"><span class="pill pill--${esc(String(j.fulfillment).toLowerCase())}">${esc(j.fulfillment)}</span>${j.archived ? ' <span class="pill pill--archived">ARCHIVED</span>' : ''}</div></td>
      <td><div class="strong">${esc(j.shape || '—')}</div><div class="meta">${esc(j.variant)}</div><div class="meta">Qty ${esc(j.qty)}</div></td>
      <td class="txt">${j.text ? `<div class="strong">${esc(j.text)}</div><div class="meta"><span class="chip chip--${esc(String(j.textColor || '').toLowerCase())}"></span>${esc(j.textColor || '')}</div>` : '<span class="none">—</span>'}</td>
      <td class="meta">${esc(j.score || '—')}</td>
      <td class="links">${fa(j.original, 'Original', 'original')}${fa(j.print, 'Print 600dpi', 'print')}${fa(j.pdf, 'PDF', 'print')}${fa(j.preview, 'Preview', 'preview')}</td>
    </tr>`;
  }).join('\n');

  const stamp = cache.at ? new Date(cache.at).toLocaleString() : 'never';
  return `<!doctype html><meta charset="utf-8"><title>Image Hat production queue</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--blue:#00a0ea;--ink:#1a1f26;--muted:#6b7280;--line:#e5e7eb}
  *{box-sizing:border-box}
  body{margin:0;padding:24px;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#f7f9fb}
  h1{margin:0 0 4px;font-size:24px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:16px}
  .bar{display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
  input[type=search],#me{padding:10px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:15px}
  input[type=search]{flex:1;min-width:220px}
  #me{width:180px}
  .hidedone{display:flex;align-items:center;gap:6px;font-size:13px;color:#475569;white-space:nowrap;cursor:pointer}
  .count{color:var(--muted);font-size:13px;margin-left:auto}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{padding:11px 13px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
  th{background:#f2f6f9;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#475569}
  tr:last-child td{border-bottom:0}
  .status{width:230px}
  .st{width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:#fff;font-size:13px;font-weight:700;cursor:pointer;color:#475569}
  .st[data-state=progress]{background:#fef3d6;border-color:#f0d38a;color:#8a6100}
  .st[data-state=done]{background:#e3f6ea;border-color:#a6dcbb;color:#1a7f45}
  .note{width:100%;margin-top:7px;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;font:13px inherit;resize:vertical}
  .note:focus{outline:none;border-color:var(--blue)}
  .by{font-size:11px;color:var(--muted);margin-top:3px;min-height:12px}
  tr.row-done td:not(.status){opacity:.5}
  .thumb{width:120px}.thumb img{width:104px;height:104px;object-fit:contain;background:#fbfbfb;border:1px solid var(--line);border-radius:8px;display:block}
  .order{font-weight:700;color:var(--blue);text-decoration:none;font-size:16px}.order:hover{text-decoration:underline}
  .meta{color:var(--muted);font-size:12.5px}.strong{font-weight:700}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f6;font-size:11px;font-weight:700;color:#475569}
  .pill--fulfilled{background:#e6f6ec;color:#1a7f45}.pill--unfulfilled{background:#fdf3d7;color:#8a6100}.pill--archived{background:#e6e8eb;color:#586374}
  .chip{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid #c2c8d0;margin-right:6px;vertical-align:-1px}
  .chip--black{background:#000}.chip--white{background:#fff}
  .links{width:220px}
  .fa{margin-bottom:6px;border:1.5px solid var(--line);border-radius:8px;background:#fff;overflow:hidden}
  .fa>summary{padding:7px 11px;font-size:13px;font-weight:600;cursor:pointer;list-style:none}
  .fa>summary::-webkit-details-marker{display:none}.fa>summary:hover{color:var(--blue)}
  .fa[open]{border-color:var(--blue)}.fa__body{padding:10px}
  .fa__img{display:block;width:100%;border-radius:6px;background:conic-gradient(#eceff3 90deg,#fff 0 180deg,#eceff3 0 270deg,#fff 0) 0 0/18px 18px}
  .fa__dl{display:block;margin-top:9px;padding:9px;text-align:center;background:var(--blue);color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700}
  .fa--off{padding:7px 11px;font-size:13px;color:#c2c8d0;border-style:dashed}
  .none{color:#c2c8d0}
  .err{background:#fdecec;border:1px solid #f3b9b9;color:#a11;padding:10px 14px;border-radius:10px;margin-bottom:14px;font-size:13px}
</style>
<h1>Image Hat production queue</h1>
<div class="sub">${cache.jobs.length} order(s) · last ${DAYS} days · data refreshed ${esc(stamp)} · live shared status</div>
${cache.error ? `<div class="err">Couldn't refresh from Shopify: ${esc(cache.error)} — showing the last good data.</div>` : ''}
${cache.jobs.length ? `
<div class="bar">
  <input type="search" id="q" placeholder="Filter by order #, shape, colour…" autocomplete="off">
  <input id="me" placeholder="Your name (for notes)" autocomplete="off">
  <label class="hidedone"><input type="checkbox" id="hidedone"> Hide done</label>
  <span class="count" id="count"></span>
</div>
<table><thead><tr><th>Status &amp; notes</th><th>Preview</th><th>Order</th><th>Patch</th><th>Text</th><th>Quality</th><th>Files</th></tr></thead>
<tbody id="rows">${rows}</tbody></table>
<script>
  var CYCLE=['todo','progress','done'], LABEL=${JSON.stringify(LABEL)};
  var q=document.getElementById('q'), hd=document.getElementById('hidedone'), count=document.getElementById('count'),
      me=document.getElementById('me'), rows=[].slice.call(document.querySelectorAll('#rows tr'));
  me.value=localStorage.getItem('clImageHatMe')||'';
  me.addEventListener('input',function(){localStorage.setItem('clImageHatMe',me.value);});

  function post(order,patch){
    patch.by=me.value||'';
    return fetch('/api/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({order:order},patch))})
      .then(function(r){return r.json();});
  }
  function paintRow(tr,rec){
    var st=(rec&&rec.status)||'todo', btn=tr.querySelector('.st');
    btn.dataset.state=st; btn.textContent=LABEL[st];
    tr.classList.toggle('row-done',st==='done');
    var note=tr.querySelector('.note');
    if(document.activeElement!==note) note.value=(rec&&rec.note)||'';
    tr.querySelector('.by').textContent=(rec&&(rec.by||rec.at))?((rec.by?rec.by+' · ':'')+(rec.at?new Date(rec.at).toLocaleString():'')):'';
  }
  rows.forEach(function(tr){
    var order=tr.dataset.order;
    tr.querySelector('.st').addEventListener('click',function(){
      var cur=tr.querySelector('.st').dataset.state||'todo';
      var next=CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length];
      post(order,{status:next}).then(function(rec){paintRow(tr,rec);apply();});
    });
    var note=tr.querySelector('.note'), timer;
    note.addEventListener('input',function(){ clearTimeout(timer); timer=setTimeout(function(){ post(order,{note:note.value}).then(function(rec){paintRow(tr,rec);}); },600); });
    note.addEventListener('blur',function(){ clearTimeout(timer); post(order,{note:note.value}).then(function(rec){paintRow(tr,rec);}); });
  });

  function apply(){
    var t=q.value.trim().toLowerCase(), hide=hd.checked, n=0, done=0;
    rows.forEach(function(r){
      var isDone=r.querySelector('.st').dataset.state==='done'; if(isDone)done++;
      var hit=(!t||r.dataset.search.indexOf(t)>-1)&&!(hide&&isDone);
      r.style.display=hit?'':'none'; if(hit)n++;
    });
    count.textContent=n+' shown · '+done+'/'+rows.length+' done';
  }
  q.addEventListener('input',apply); hd.addEventListener('change',apply); apply();

  /* Poll shared status so everyone's marks/notes stay in sync (skips a note
     you're currently typing in). */
  setInterval(function(){
    fetch('/api/state').then(function(r){return r.json();}).then(function(state){
      rows.forEach(function(tr){ paintRow(tr,state[tr.dataset.order]); }); apply();
    }).catch(function(){});
  }, 15000);
</script>` : '<p style="color:#6b7280">No Image Hat orders in this window.</p>'}
`;
}

/* ---- http ---- */
function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type }); res.end(body); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') return send(res, 200, 'text/plain', 'ok');
  if (url.pathname === '/api/state') return send(res, 200, 'application/json', JSON.stringify(status));
  if (url.pathname === '/api/status' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let d; try { d = JSON.parse(body); } catch { return send(res, 400, 'application/json', '{"error":"bad json"}'); }
      if (!d.order) return send(res, 400, 'application/json', '{"error":"no order"}');
      const rec = status[d.order] || {};
      if (typeof d.status === 'string') rec.status = d.status;
      if (typeof d.note === 'string') rec.note = d.note;
      rec.by = d.by || rec.by || '';
      rec.at = new Date().toISOString();
      status[d.order] = rec; saveStatus();
      send(res, 200, 'application/json', JSON.stringify(rec));
    });
    return;
  }
  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', page());
  send(res, 404, 'text/plain', 'not found');
});

loadStatus();
await refresh();
setInterval(refresh, REFRESH_MS);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nImage Hat queue live on:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  http://${process.env.HOST_HINT || 'this-mac.local'}:${PORT}   (share this with the team)`);
  console.log(`Status store: ${STORE}\n`);
});
