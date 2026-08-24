// agents.js — the WarRoom multi-agent orchestration.
// A SUPERVISOR (incident commander) dispatches SPECIALIST agents.
// Specialists run an observe→think→act tool loop against the (simulated) prod env.
// Patches hit a human approval gate before anything is applied.
import { complete } from './llm.js';
import { toolDefs, runTool } from './sim.js';

const SPECIALISTS = {
  log_analyst: {
    title: 'Log Analyst',
    skill: 'You are an expert SRE log analyst. You dig through service logs and metrics to find WHAT is failing and WHERE the failure originates (vs. where it merely cascades).',
    tools: ['list_services', 'read_logs', 'grep_logs'],
  },
  root_cause: {
    title: 'Root-Cause Investigator',
    skill: 'You are a root-cause investigator. You correlate deploys, config changes, and failure timelines to determine WHY the system is failing. You name the exact change that caused it.',
    tools: ['get_recent_deploys', 'get_config', 'read_logs', 'grep_logs'],
  },
  fix_engineer: {
    title: 'Fix Engineer',
    skill: 'You are a senior production engineer. Given a root cause, you produce the smallest safe fix as a concrete config/code patch and submit it for human approval. Never invent a fix without evidence.',
    tools: ['get_config', 'get_recent_deploys', 'propose_patch'],
  },
  comms_writer: {
    title: 'Comms Writer',
    skill: 'You write calm, honest, customer-facing incident communications. No jargon, no blame, clear impact statement and next update time.',
    tools: ['list_services', 'draft_status_page'],
  },
};

function toolBlock(names) {
  return toolDefs.filter(t => names.includes(t.name))
    .map(t => `- ${t.name}(${Object.keys(t.args).join(', ')}): ${t.desc}`).join('\n');
}

function parseJSON(text) {
  // strip code fences, grab the first balanced JSON object
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  for (let end = cleaned.length; end > start; end--) {
    try { return JSON.parse(cleaned.slice(start, end)); } catch { /* shrink */ }
  }
  return null;
}

async function runSpecialist(key, objective, state, emit) {
  const spec = SPECIALISTS[key];
  const system = `${spec.skill}
You are agent "${spec.title}" inside WarRoom, an autonomous incident-response team, working incident ${state.incident.id}: ${state.incident.title}.

You operate in a strict observe-think-act loop. On EVERY turn reply with ONLY one JSON object, nothing else:
  {"thought": "<one concise sentence of reasoning>", "tool": "<tool name>", "args": { ... }}
or, when your objective is met:
  {"thought": "<one concise sentence>", "done": true, "findings": "<your complete findings/handoff, 3-8 sentences, concrete>"}

Available tools:
${toolBlock(spec.tools)}

Rules: base every claim on tool observations. Be fast — do not repeat tool calls you already made. Max 6 tool calls.`;

  const messages = [{ role: 'user', content: `OBJECTIVE from incident commander: ${objective}\nBegin.` }];
  emit('agent_start', { agent: key, title: spec.title, objective });

  for (let turn = 0; turn < 8; turn++) {
    const raw = await complete(system, messages);
    const act = parseJSON(raw);
    if (!act) {
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: 'Reply with ONLY the JSON object as specified.' });
      continue;
    }
    if (act.thought) emit('agent_thought', { agent: key, title: spec.title, thought: act.thought });
    if (act.done) {
      emit('agent_done', { agent: key, title: spec.title, findings: act.findings || '' });
      return act.findings || '(no findings)';
    }
    const obs = runTool(state, act.tool, act.args || {}, emit);
    emit('agent_tool', { agent: key, title: spec.title, tool: act.tool, args: act.args || {}, observation: obs.slice(0, 1200) });
    messages.push({ role: 'assistant', content: JSON.stringify(act) },
                  { role: 'user', content: `OBSERVATION from ${act.tool}:\n${obs}` });
  }
  emit('agent_done', { agent: key, title: spec.title, findings: '(turn limit reached)' });
  return '(turn limit reached)';
}

export async function runIncident(state, emit, waitForApproval) {
  const rosterDesc = Object.entries(SPECIALISTS)
    .map(([k, s]) => `- ${k}: ${s.title} — ${s.skill.split('.')[0]}.`).join('\n');

  const system = `You are the SUPERVISOR (incident commander) of WarRoom, an autonomous AI incident-response team at Kartify, an Indian e-commerce company.
Your specialist agents:
${rosterDesc}

You work by dispatching ONE specialist at a time with a crisp objective, reading their findings, and deciding the next move. Typical arc: understand symptoms -> find root cause -> get a fix proposed (it needs human approval) -> communicate to customers -> resolve.

On EVERY turn reply with ONLY one JSON object:
  {"thought": "<one sentence>", "action": "dispatch", "agent": "<specialist key>", "objective": "<specific objective incl. relevant context from prior findings>"}
or when the incident is fully handled (root cause found, fix applied & verified, customers informed):
  {"thought": "<one sentence>", "action": "resolve", "summary": "<postmortem-style summary: impact, root cause, fix, follow-ups>"}

Max 6 dispatches. Do not dispatch the same specialist twice unless their first pass failed.`;

  const messages = [{ role: 'user', content: `🚨 ALERT: ${state.incident.alert}\nIncident ${state.incident.id} opened at ${state.incident.startedAt}. Take command.` }];
  emit('incident_start', { incident: state.incident });

  for (let step = 0; step < 8; step++) {
    const raw = await complete(system, messages);
    const act = parseJSON(raw);
    if (!act) {
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: 'Reply with ONLY the JSON object as specified.' });
      continue;
    }
    if (act.thought) emit('supervisor_thought', { thought: act.thought });

    if (act.action === 'resolve') {
      emit('incident_resolved', { summary: act.summary || '', services: state.services });
      return;
    }
    if (act.action === 'dispatch' && SPECIALISTS[act.agent]) {
      emit('supervisor_dispatch', { agent: act.agent, title: SPECIALISTS[act.agent].title, objective: act.objective });
      const findings = await runSpecialist(act.agent, act.objective || 'Investigate.', state, emit);

      let extra = '';
      // If a patch is now awaiting approval, pause the room for the human gate.
      const pending = state.patches.find(p => p.status === 'awaiting_approval');
      if (pending) {
        emit('awaiting_approval', { patch: pending });
        const result = await waitForApproval(pending.id); // resolves on human click
        if (result?.recovered) {
          emit('recovery', { services: state.services, patch: result.patch });
          extra = `\n\nHUMAN GATE: patch ${pending.id} APPROVED and applied. Telemetry: payments error rate 61.7%->0.4%, orders and api-gateway recovered. Incident metrics green.`;
        } else {
          extra = `\n\nHUMAN GATE: patch ${pending.id} was applied but telemetry shows NO recovery. The root cause is likely elsewhere.`;
        }
      }
      messages.push({ role: 'assistant', content: JSON.stringify(act) },
                    { role: 'user', content: `FINDINGS from ${SPECIALISTS[act.agent].title}:\n${findings}${extra}` });
      continue;
    }
    messages.push({ role: 'assistant', content: raw },
                  { role: 'user', content: 'Invalid action. Use "dispatch" with a valid agent key, or "resolve".' });
  }
  emit('incident_resolved', { summary: 'Supervisor step limit reached.', services: state.services });
}
