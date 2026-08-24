// llm.js — pluggable LLM backend.
// Primary: Anthropic API via the official SDK (needs a valid ANTHROPIC_API_KEY).
// Fallback: local `claude` CLI in headless mode (uses your Claude Code login).
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

// Load .env manually (zero-dep).
if (existsSync(new URL('./.env', import.meta.url))) {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const MODEL = process.env.WARROOM_MODEL || 'claude-opus-5';
let backend = null; // 'api' | 'cli'
let client = null;

async function detectBackend() {
  if (backend) return backend;
  if (process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic();
    try {
      await client.messages.create({ model: MODEL, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] });
      backend = 'api';
      console.log(`[llm] backend: Anthropic API (${MODEL})`);
      return backend;
    } catch (e) {
      console.warn(`[llm] API key check failed (${e.status || e.message}); falling back to claude CLI`);
    }
  }
  backend = 'cli';
  console.log('[llm] backend: claude CLI (headless)');
  return backend;
}

function cliComplete(system, userText) {
  const prompt = `${system}\n\n---\n\n${userText}`;
  return new Promise((resolve, reject) => {
    execFile('claude', ['-p', prompt, '--output-format', 'text', '--model', 'sonnet'],
      { maxBuffer: 10 * 1024 * 1024, timeout: 180000, env: { ...process.env, ANTHROPIC_API_KEY: '' } },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`claude CLI failed: ${err.message} ${stderr || ''}`));
        resolve(stdout.trim());
      });
  });
}

async function apiComplete(system, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
  });
  if (resp.stop_reason === 'refusal') {
    return JSON.stringify({ action: 'note', text: 'Model declined this step; continuing with available findings.' });
  }
  return resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

/**
 * complete(system, messages) -> assistant text.
 * messages: [{role:'user'|'assistant', content: string}]
 */
export async function complete(system, messages) {
  const b = await detectBackend();
  if (b === 'api') {
    return apiComplete(system, messages.map(m => ({ role: m.role, content: m.content })));
  }
  // CLI backend is single-shot: serialize the conversation into one prompt.
  const convo = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
  return cliComplete(system, convo);
}

export async function backendName() {
  return detectBackend();
}
