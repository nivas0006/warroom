// server.js — WarRoom: zero-framework Node server.
// Serves the dashboard, streams agent activity over SSE, runs the agent swarm,
// and implements the human approval gate.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim, applyPatch } from './sim.js';
import { runIncident } from './agents.js';
import { backendName } from './llm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4141;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

let state = createSim();
let running = false;
let clients = [];             // SSE connections
let eventLog = [];            // for replay + late joiners
let approvalResolvers = {};   // patchId -> resolve fn

function emit(type, data) {
  const evt = { type, data, t: Date.now() };
  eventLog.push(evt);
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  clients = clients.filter(res => { try { res.write(payload); return true; } catch { return false; } });
}

function waitForApproval(patchId) {
  return new Promise(resolve => { approvalResolvers[patchId] = resolve; });
}

async function startRun() {
  if (running) return false;
  running = true;
  state = createSim();
  eventLog = [];
  emit('backend', { backend: await backendName() });
  runIncident(state, emit, waitForApproval)
    .catch(e => emit('error', { message: String(e.message || e) }))
    .finally(() => {
      running = false;
      try {
        mkdirSync(join(__dirname, 'recordings'), { recursive: true });
        writeFileSync(join(__dirname, 'recordings', 'last-run.json'), JSON.stringify(eventLog, null, 1));
      } catch {}
    });
  return true;
}

async function replayRun() {
  const file = join(__dirname, 'recordings', 'last-run.json');
  if (running || !existsSync(file)) return false;
  running = true;
  state = createSim();
  const recorded = JSON.parse(readFileSync(file, 'utf8'));
  eventLog = [];
  (async () => {
    let prev = recorded[0]?.t || 0;
    for (const evt of recorded) {
      const gap = Math.min(Math.max(evt.t - prev, 200), 3500); // compress long LLM waits
      prev = evt.t;
      await new Promise(r => setTimeout(r, gap));
      if (evt.type === 'awaiting_approval') {
        emit(evt.type, evt.data);
        // in replay the human still clicks approve; recovery event follows in the recording,
        // so just wait for the click to keep the demo interactive
        await waitForApproval(evt.data.patch.id).catch?.(() => {});
        continue;
      }
      emit(evt.type, evt.data);
    }
    running = false;
  })();
  return true;
}

function body(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://x`);
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(obj)); };

  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    for (const evt of eventLog) res.write(`data: ${JSON.stringify(evt)}\n\n`);
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/incident/start') {
    return json(await startRun() ? 200 : 409, { running });
  }
  if (req.method === 'POST' && url.pathname === '/incident/replay') {
    return json(await replayRun() ? 200 : 409, { running });
  }
  if (req.method === 'POST' && url.pathname === '/approve') {
    const { patchId } = await body(req);
    const result = applyPatch(state, patchId);
    const resolve = approvalResolvers[patchId];
    if (resolve) { delete approvalResolvers[patchId]; resolve(result || { recovered: state.incident.resolved }); }
    if (result?.recovered || state.incident.resolved) emit('recovery', { services: state.services, patch: result?.patch || { id: patchId } });
    return json(200, { ok: true, recovered: !!(result?.recovered || state.incident.resolved) });
  }
  if (url.pathname === '/state') return json(200, { services: state.services, incident: state.incident, patches: state.patches, statusPage: state.statusPage, running });

  // static
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = join(__dirname, 'public', p);
  if (existsSync(file) && file.startsWith(join(__dirname, 'public'))) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' }).end(readFileSync(file));
    return;
  }
  res.writeHead(404).end('not found');
});

server.listen(PORT, () => console.log(`\n  🚨 WarRoom dashboard → http://localhost:${PORT}\n`));
