# 🎬 Video walkthrough — one-take Loom plan (~95 seconds)

## Setup before recording (2 min)
1. `cd ~/great-agent-hackathon && node server.js`
2. Open http://localhost:4141 — full screen the browser, hide bookmarks bar.
3. Decide: click **Replay** (uses the recorded run — fast, zero risk) or **Trigger incident** (live agents — pause/trim waits in Loom). **Recommended: Replay.**
4. Start Loom → screen + camera bubble → record.

## Script (speak naturally, don't read robotically)

**[0:00–0:12] — hook, on the idle dashboard**
> "This is WarRoom — an AI incident response team. Not a chatbot: a supervisor agent commanding four specialist agents that debug a production outage the way an SRE team does. Let me break production."

**[0:12–0:25] — click Trigger/Replay, point at the red banner + service map**
> "A PagerDuty alert just fired — payments is at 61% errors, checkout is down, 214 orders stuck. The supervisor takes command and dispatches a Log Analyst."

**[0:25–0:45] — the feed, as agents work (hover over tool calls)**
> "Watch what's actually happening: every agent runs a real observe-think-act loop. The Log Analyst is grepping logs across five services — it separates where the failure *originates* from where it merely *cascades*. Then a Root-Cause Investigator correlates the deploy history… and finds it: a deploy nine minutes ago dropped the payments DB pool from 50 connections to 5."

**[0:45–1:05] — approval card appears on the right**
> "Here's the important part. The Fix Engineer writes the patch — but agents don't touch production. It stops at a human approval gate. I review the diff… and approve."
>
> *(click **Approve & apply**, then gesture at the service map going green)*
>
> "Error rate collapses from 61% to zero-point-four. The agents verify recovery from telemetry — they don't just assume the fix worked."

**[1:05–1:20] — status page + postmortem panels**
> "Meanwhile the Comms Writer has already drafted the customer status page, and the supervisor closes the incident with a postmortem — impact, root cause, follow-ups."

**[1:20–1:35] — camera / closing**
> "The investigation is completely un-scripted — the agents reason from evidence through tools, and the same orchestration plugs into Datadog, ArgoCD or Statuspage via MCP. Built on Claude, solo, for Track 3. This is what AI-native operations looks like: agents do the 3 AM work, humans stay in command."

## Recording tips
- If a live run stalls between agents, Loom-trim the gap; or just use Replay (it paces itself).
- Keep the cursor moving toward what you're narrating — judges follow your mouse.
- Upload to Loom → paste the link into SUBMISSION.md and the hidevs form.

## Submission checklist (form: https://app.hidevs.xyz/go/hidevs_luma_approved)
- [ ] Accept the Luma invite (form answers already drafted — see chat)
- [ ] Push repo to GitHub public, add link to SUBMISSION.md
- [ ] Record Loom (script above), add link to SUBMISSION.md
- [ ] Submit: written submission = SUBMISSION.md content, video link, team details
