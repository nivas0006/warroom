const $ = (s) => document.querySelector(s);
const feed = $('#feed'), grid = $('#service-grid'), timeline = $('#timeline');

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function push(el) { feed.appendChild(el); feed.scrollTop = feed.scrollHeight; el.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
function msg(cls, who, html) {
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  d.innerHTML = `<div class="who">${esc(who)}</div>${html}`;
  push(d); return d;
}
function tl(text) {
  const d = document.createElement('div'); d.className = 'tl';
  d.innerHTML = `<b>${new Date().toLocaleTimeString()}</b> ${esc(text)}`;
  timeline.appendChild(d);
}

async function renderServices(services) {
  if (!services) services = (await (await fetch('/state')).json()).services;
  grid.innerHTML = Object.entries(services).map(([n, s]) => `
    <div class="svc ${s.status}">
      <div class="name">${esc(n)}</div>
      <div class="metrics"><span>err <b>${s.errorRate}%</b></span><span>p99 <b>${s.p99ms}ms</b></span><span>${esc(s.status)}</span></div>
    </div>`).join('');
}

function showPatch(patch, applied = false) {
  $('#patch-area').innerHTML = `
    <div class="card ${applied ? 'applied' : 'pending'}">
      <h3>${applied ? '✅ Applied' : '⏳ Awaiting your approval'} — ${esc(patch.id)} · ${esc(patch.service)}</h3>
      <div>${esc(patch.description)}</div>
      <pre>${esc(patch.diff)}</pre>
      ${applied ? '' : `<button class="approve" onclick="approve('${patch.id}')">Approve & apply</button>
      <button class="ghost" onclick="this.textContent='(rejection noted)'">Reject</button>`}
    </div>`;
}
window.approve = async (patchId) => {
  $('#patch-area button.approve').disabled = true;
  await fetch('/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patchId }) });
};

const handlers = {
  backend: (d) => { $('#backend-badge').textContent = `backend: ${d.backend === 'api' ? 'Anthropic API' : 'claude CLI'}`; },
  incident_start: (d) => {
    feed.innerHTML = ''; timeline.innerHTML = '';
    $('#incident-banner').className = 'banner active';
    $('#incident-banner').textContent = `${d.incident.id} · ${d.incident.title}`;
    $('#live-dot').className = 'dot live';
    msg('system', 'PagerDuty', `<div class="thought">${esc(d.incident.alert)}</div>`);
    tl('Incident opened — agents taking command');
    renderServices();
  },
  supervisor_thought: (d) => msg('supervisor', '👑 Supervisor', `<div class="thought">${esc(d.thought)}</div>`),
  supervisor_dispatch: (d) => { msg('supervisor dispatch', '👑 Supervisor → ' + d.title, `<div class="thought">${esc(d.objective)}</div>`); tl(`Dispatched ${d.title}`); },
  agent_start: () => {},
  agent_thought: (d) => msg(d.agent, d.title, `<div class="thought">${esc(d.thought)}</div>`),
  agent_tool: (d) => msg(d.agent, d.title, `<div class="tool">ran <code>${esc(d.tool)}(${esc(JSON.stringify(d.args))})</code></div><pre>${esc(d.observation)}</pre>`),
  agent_done: (d) => { msg(d.agent, d.title + ' — findings', `<div class="thought">${esc(d.findings)}</div>`); tl(`${d.title} reported findings`); },
  approval_request: (d) => {},
  awaiting_approval: (d) => { showPatch(d.patch); tl('Patch awaiting human approval'); msg('system', '🖐 Human gate', `<div class="thought">Patch ${esc(d.patch.id)} needs your approval — see the right panel.</div>`); },
  recovery: (d) => { showPatch(d.patch, true); renderServices(d.services); tl('Patch applied — services recovering'); msg('system', '📈 Telemetry', `<div class="thought">Error rates collapsing. payments 61.7% → 0.4%. Services green.</div>`); },
  status_page: (d) => { $('#status-area').innerHTML = `<div class="statuspage">${esc(d.text)}</div>`; tl('Customer status page drafted'); },
  incident_resolved: (d) => {
    $('#incident-banner').className = 'banner resolved';
    $('#incident-banner').textContent = '✅ Incident resolved';
    $('#live-dot').className = 'dot';
    if (d.services) renderServices(d.services);
    $('#postmortem-area').innerHTML = `<div class="pm">${esc(d.summary)}</div>`;
    tl('Incident resolved — postmortem generated');
  },
  error: (d) => msg('system', '⚠️ Error', `<div class="thought">${esc(d.message)}</div>`),
};

new EventSource('/events').onmessage = (e) => {
  const evt = JSON.parse(e.data);
  handlers[evt.type]?.(evt.data);
};

$('#btn-start').onclick = async () => { $('#btn-start').disabled = true; await fetch('/incident/start', { method: 'POST' }); setTimeout(() => $('#btn-start').disabled = false, 4000); };
$('#btn-replay').onclick = async () => { await fetch('/incident/replay', { method: 'POST' }); };
renderServices();
