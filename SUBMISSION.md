# Stage 1 Submission — The Great Agent Hackathon

**Project:** WarRoom — an AI-native incident response team
**Track:** Track 3 — AI-native Enterprise (Open)
**Team:** Solo — Lakshmi Nivas Reddy Rachapalli (lakshminivas0006@gmail.com)

---

## The problem we're addressing

Every software company runs incidents the same way it did fifteen years ago: a pager fires at 3 AM, one bleary engineer greps logs across a dozen services, guesses at a root cause under pressure, pushes a fix, and forgets to tell customers anything until Twitter notices. Mean-time-to-resolution is dominated not by the fix itself but by the *investigation* — correlating logs, deploys, configs, and metrics across services. It's high-stakes, evidence-driven, repetitive cognitive work. Exactly what agents should do, and exactly where enterprises are most afraid to let them act unsupervised.

## Our solution and how it works

WarRoom is an autonomous incident-response *team*, not a chatbot:

- A **Supervisor agent** (incident commander) receives the alert, forms a plan, and dispatches specialists one objective at a time.
- **Specialist agents** — Log Analyst, Root-Cause Investigator, Fix Engineer, Comms Writer — each run a genuine observe→think→act tool loop with a deliberately narrow tool scope (the comms writer cannot touch configs; the fix engineer cannot skip evidence).
- Tools operate on the production environment: `read_logs`, `grep_logs`, `get_config`, `get_recent_deploys`, `propose_patch`, `draft_status_page`.
- **Nothing mutates production without a human.** Proposed patches stop at an approval gate; an engineer reviews the diff and clicks approve. The agents then verify recovery from telemetry before resolving.
- **Everything is observable.** Every agent thought, tool call, and observation streams live to an ops-room dashboard — the antidote to "why did the agent do that?"
- The demo runs against a simulated e-commerce production environment (5 microservices, realistic logs/deploys/configs, an injected pool-exhaustion outage). The investigation itself is entirely un-scripted — the agents reason their way to the root cause from evidence. The same orchestration layer plugs into real systems (Datadog/CloudWatch, ArgoCD, Statuspage) via MCP.

Built on Claude (Anthropic SDK, `claude-opus-5`), zero-framework Node.js, SSE-streamed dashboard. The full multi-agent orchestration is ~200 lines and readable — agentic design as the product, not a wrapper.

## Why we're the right team to build this

I build agentic systems end-to-end, hands-on: a production voice agent for clinic appointment booking (Bolna platform + Cal.com), computer-vision detection pipelines for SAE AeroTHON (national drone competition, Team R2D2), and multiple shipped hackathon agent projects. Solo means fast decisions and one person who understands every line — orchestration, tooling, and UI — well enough to rebuild any of it live on stage in 24 hours.

## Links

- **Demo video:** *(Loom link — to be added)*
- **Code:** *(GitHub link — to be added after push)*
- **Run locally:** `npm install && node server.js` → http://localhost:4141
