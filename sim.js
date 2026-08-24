// sim.js — Simulated production environment for WarRoom.
// A small e-commerce company ("Kartify") with five microservices.
// An incident is injected: a bad deploy to `payments` set DB_POOL_SIZE 50 -> 5,
// exhausting the connection pool and cascading timeouts upstream.

const now = Date.now();
const min = (m) => new Date(now - m * 60000).toISOString().replace('T', ' ').slice(0, 19);

export function createSim() {
  const state = {
    services: {
      'api-gateway': { status: 'degraded', errorRate: 14.2, p99ms: 4800, owner: 'platform' },
      'payments': { status: 'critical', errorRate: 61.7, p99ms: 9900, owner: 'payments-team' },
      'orders': { status: 'degraded', errorRate: 22.4, p99ms: 6100, owner: 'commerce' },
      'inventory': { status: 'healthy', errorRate: 0.3, p99ms: 88, owner: 'commerce' },
      'notifications': { status: 'healthy', errorRate: 0.1, p99ms: 45, owner: 'platform' },
    },
    configs: {
      'payments': { DB_POOL_SIZE: '5', DB_HOST: 'pg-payments-prod.internal', PAYMENT_GATEWAY: 'razorpay', TIMEOUT_MS: '5000', RETRIES: '2' },
      'orders': { DB_POOL_SIZE: '40', UPSTREAM_PAYMENTS: 'payments.svc:8443', TIMEOUT_MS: '5000' },
      'api-gateway': { RATE_LIMIT_RPS: '2000', UPSTREAMS: 'orders,payments,inventory,notifications' },
      'inventory': { DB_POOL_SIZE: '30', CACHE_TTL_S: '60' },
      'notifications': { QUEUE: 'sqs-notifs-prod', BATCH: '100' },
    },
    deploys: [
      { id: 'dep-4821', service: 'payments', when: min(9), author: 'priya.k', change: 'perf: tune DB pool + bump pg driver 8.11->8.12', configDiff: '- DB_POOL_SIZE: "50"\n+ DB_POOL_SIZE: "5"\n- PG_DRIVER: "8.11"\n+ PG_DRIVER: "8.12"' },
      { id: 'dep-4820', service: 'notifications', when: min(140), author: 'arjun.m', change: 'chore: bump batch size 50->100', configDiff: '- BATCH: "50"\n+ BATCH: "100"' },
      { id: 'dep-4819', service: 'api-gateway', when: min(310), author: 'sara.t', change: 'feat: add /v2/checkout route', configDiff: '(no config changes)' },
    ],
    logs: {
      'payments': [
        `${min(45)} INFO  pool: acquired conn in 2ms (pool 12/50)`,
        `${min(30)} INFO  charge ok order=ord-88121 amt=₹2,499 gw=razorpay 210ms`,
        `${min(9)} INFO  deploy dep-4821 rolling out (3/3 pods)`,
        `${min(8)} WARN  pool: acquire slow 1810ms (pool 5/5)`,
        `${min(8)} ERROR pool: timeout acquiring connection after 5000ms (pool 5/5, waiting=41)`,
        `${min(7)} ERROR charge failed order=ord-88159 err=PoolTimeoutError: could not acquire connection within 5000ms`,
        `${min(6)} ERROR pool: timeout acquiring connection after 5000ms (pool 5/5, waiting=97)`,
        `${min(5)} ERROR charge failed order=ord-88171 err=PoolTimeoutError: could not acquire connection within 5000ms`,
        `${min(4)} ERROR pool: timeout acquiring connection after 5000ms (pool 5/5, waiting=163)`,
        `${min(2)} ERROR charge failed order=ord-88204 err=PoolTimeoutError: could not acquire connection within 5000ms`,
        `${min(1)} ERROR healthcheck degraded: db pool saturation 100%`,
      ],
      'orders': [
        `${min(40)} INFO  order created ord-88121 items=2 total=₹2,499`,
        `${min(7)} ERROR call payments.svc:8443 timeout after 5000ms order=ord-88159`,
        `${min(6)} WARN  retry 1/2 payments.svc order=ord-88159`,
        `${min(5)} ERROR call payments.svc:8443 timeout after 5000ms order=ord-88171 (retries exhausted)`,
        `${min(3)} ERROR order stuck in PENDING_PAYMENT ord-88189`,
        `${min(1)} ERROR 214 orders stuck in PENDING_PAYMENT in last 10m`,
      ],
      'api-gateway': [
        `${min(50)} INFO  200 POST /v2/checkout 180ms`,
        `${min(6)} ERROR 504 POST /v2/checkout upstream=orders 8000ms`,
        `${min(4)} ERROR 504 POST /v2/checkout upstream=orders 8000ms`,
        `${min(2)} WARN  error rate 14.2% over 5m window (threshold 5%)`,
      ],
      'inventory': [
        `${min(20)} INFO  cache hit ratio 0.97`,
        `${min(2)} INFO  healthy`,
      ],
      'notifications': [
        `${min(15)} INFO  batch sent 100 msgs 320ms`,
        `${min(2)} INFO  healthy`,
      ],
    },
    incident: {
      id: 'INC-2041',
      title: 'Checkout failures spiking — payment errors > 60%',
      alert: 'PagerDuty: [P1] payments error-rate 61.7% (threshold 5%). Checkout conversion collapsed. 214 orders stuck in PENDING_PAYMENT.',
      startedAt: min(8),
      resolved: false,
    },
    patches: [],       // proposed patches awaiting/after approval
    statusPage: null,  // drafted customer comms
  };
  return state;
}

// ---- Tools exposed to agents. Each returns a string observation. ----
export const toolDefs = [
  { name: 'list_services', desc: 'List all services with live status, error rate, p99 latency.', args: {} },
  { name: 'read_logs', desc: 'Read recent log lines for a service.', args: { service: 'service name' } },
  { name: 'grep_logs', desc: 'Search all services\' logs for a pattern (case-insensitive substring).', args: { pattern: 'text to search' } },
  { name: 'get_config', desc: 'Get the live runtime config of a service.', args: { service: 'service name' } },
  { name: 'get_recent_deploys', desc: 'List recent deploys across all services with config diffs.', args: {} },
  { name: 'propose_patch', desc: 'Propose a config/code patch. It goes to a HUMAN APPROVAL gate before apply.', args: { service: 'service name', description: 'what and why', diff: 'unified diff of the change' } },
  { name: 'draft_status_page', desc: 'Draft the public status-page update for customers.', args: { text: 'the status page text' } },
];

export function runTool(state, name, args = {}, emit) {
  const svc = (args.service || '').trim();
  switch (name) {
    case 'list_services':
      return Object.entries(state.services)
        .map(([n, s]) => `${n}: status=${s.status} errorRate=${s.errorRate}% p99=${s.p99ms}ms owner=${s.owner}`)
        .join('\n');
    case 'read_logs':
      if (!state.logs[svc]) return `ERROR: unknown service "${svc}". Known: ${Object.keys(state.logs).join(', ')}`;
      return state.logs[svc].join('\n');
    case 'grep_logs': {
      const pat = String(args.pattern || '').toLowerCase();
      if (!pat) return 'ERROR: pattern required';
      const hits = [];
      for (const [s, lines] of Object.entries(state.logs))
        for (const l of lines) if (l.toLowerCase().includes(pat)) hits.push(`[${s}] ${l}`);
      return hits.length ? hits.join('\n') : `(no matches for "${args.pattern}")`;
    }
    case 'get_config':
      if (!state.configs[svc]) return `ERROR: unknown service "${svc}"`;
      return Object.entries(state.configs[svc]).map(([k, v]) => `${k}=${v}`).join('\n');
    case 'get_recent_deploys':
      return state.deploys
        .map(d => `${d.id} service=${d.service} at=${d.when} by=${d.author}\n  change: ${d.change}\n  config diff:\n${d.configDiff.split('\n').map(l => '    ' + l).join('\n')}`)
        .join('\n');
    case 'propose_patch': {
      const patch = { id: 'patch-' + (state.patches.length + 1), service: svc, description: args.description || '', diff: args.diff || '', status: 'awaiting_approval' };
      state.patches.push(patch);
      emit?.('approval_request', patch);
      return `Patch ${patch.id} submitted to the human approval gate. Status: awaiting_approval. Do NOT assume it is applied.`;
    }
    case 'draft_status_page':
      state.statusPage = args.text || '';
      emit?.('status_page', { text: state.statusPage });
      return 'Status page draft saved and shown to the incident commander.';
    default:
      return `ERROR: unknown tool "${name}"`;
  }
}

// Called by the server when a human clicks Approve.
export function applyPatch(state, patchId) {
  const patch = state.patches.find(p => p.id === patchId);
  if (!patch || patch.status !== 'awaiting_approval') return null;
  patch.status = 'applied';
  // Simulate recovery if the patch targets the real root cause.
  const fixesPool = /DB_POOL_SIZE/.test(patch.diff) && patch.service === 'payments';
  if (fixesPool) {
    state.configs['payments'].DB_POOL_SIZE = '50';
    state.services['payments'] = { ...state.services['payments'], status: 'healthy', errorRate: 0.4, p99ms: 240 };
    state.services['orders'] = { ...state.services['orders'], status: 'healthy', errorRate: 0.5, p99ms: 310 };
    state.services['api-gateway'] = { ...state.services['api-gateway'], status: 'healthy', errorRate: 0.6, p99ms: 350 };
    state.logs['payments'].push(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} INFO  config reloaded: DB_POOL_SIZE=50. Pool 9/50. Error rate recovering.`);
    state.incident.resolved = true;
  }
  return { patch, recovered: fixesPool };
}
