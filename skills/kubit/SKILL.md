---
name: kubit
description: Use this skill when the user explicitly invokes /kubit or phrases a request as "ask Kubit …", or when a Kubit question is ambiguous, spans multiple skills, or is an investigation that moves from a metric change to the traces behind it to the responsible commit. If the request clearly matches one specific skill — workspace setup or switching (/kubit-connect), wiring tracing in (/kubit-integrate), analytics reports (/kubit-report), raw traces/sessions/users/events (/kubit-inspect), finding the commit behind a regression (/kubit-blame), plugin updates (/kubit-update), or what Kubit can do (/kubit-help) — use that skill directly instead of this one.
---

# /kubit

## Overview

This skill is the natural-language front door for Kubit questions. It
classifies the ask and hands off to exactly one /kubit-* skill, or drives the
investigation chain /kubit-report → /kubit-inspect → /kubit-blame. It calls no
Kubit MCP tools and spawns no subagents — every hop is governed by the routed
skill's own body; this skill only decides hop transitions and what context
carries forward. For a passive catalog of skills, /kubit-help remains the
discovery index.

## When to Use

- The user invokes /kubit or says "ask Kubit …"
- The question is ambiguous between skills, or investigation-shaped ("why did
  errors spike Tuesday?", "what regressed after Friday's deploy?")
- Do NOT use when the request clearly matches one skill — invoke that skill
  directly; this skill adds nothing for single-skill asks

## Routing table

| The user wants…                                                 | Route                       |
| :-------------------------------------------------------------- | :-------------------------- |
| sign in, switch org/workspace, "no workspace context"            | /kubit-connect              |
| start shipping traces into Kubit, wire the SDK, mint a key       | /kubit-integrate            |
| trends, aggregates, funnels/flows/retention, a metric over time  | /kubit-report               |
| specific traces, sessions, users, events; debug a failure        | /kubit-inspect              |
| the code change or commit behind a regression                    | /kubit-blame                |
| check for or install a plugin update                             | /kubit-update               |
| what Kubit can do, which skill to use, file a support request    | /kubit-help                 |
| why did a metric change / what regressed after an event          | Investigation chain (below) |

## Workflow

1. **Classify.** Match the question against the routing table. A single row →
   single-skill hand-off (step 2). A "why/what changed" regression question →
   investigation chain (step 3). Neither → ask the user one short clarifying
   question; if still unclear, invoke /kubit-help and stop.
2. **Single-skill hand-off.** Invoke the matched /kubit-* skill with the
   user's wording and resume here once it completes. That skill's body governs
   everything inside the hop — its wsctx handling, prompts, confirmation
   gates, and output. Add nothing after it finishes.
3. **Investigation chain.** Hop order is /kubit-report → /kubit-inspect →
   /kubit-blame. Enter at the deepest hop the user's context already
   satisfies:
   - Metric or trend question with no trace identifiers in hand → enter at
     /kubit-report.
   - Specific trace/session ids or an export URL already in hand → enter at
     /kubit-inspect.
   - Failing traces already identified and the ask is "what changed" → enter
     at /kubit-blame directly (confirm first — see the gate below).

   For each hop, invoke the skill and resume here once it completes. Between
   hops, restate in the hand-off wording — never re-fetch:
   - the wsctx already in the conversation (established by the first hop's
     own `init`; this skill never calls `init`),
   - export URLs and report URLs from report or inspect responses,
   - trace/session identifiers and agent/tool names,
   - the metric name + direction and the time window [since, until].

   **Gate before blame.** Always confirm in one line before the /kubit-blame
   hop — e.g. "Want me to find the code change behind this? Runs
   /kubit-blame." Report and inspect never invoke blame automatically, and
   neither does this skill. Blame's own gates (detection confirm, mapping
   confirmation, window question) apply unchanged inside the hop.

   **Stop conditions.** Stop the chain when the question is answered at the
   current hop, the user declines the next hop, or a hop exits without the
   context the next hop needs (e.g. zero results) — surface that skill's
   message and offer to widen the window or adjust filters instead of
   hopping on.

## Rules

- Never re-implement a routed skill's flow — the routed SKILL.md governs
  every step inside a hop, including its confirmation gates and error
  handling.
- Never call Kubit MCP tools from this skill — routed skills obtain their own
  wsctx (report and inspect call `init`; integrate delegates to
  /kubit-connect).
- Never fetch metrics or traces yourself, and never spawn subagents —
  kubit-analyst and the blame subagents belong to the routed skills.
- Never hop into /kubit-blame without an explicit user yes.
- Hops are sequential — at most one skill runs at a time.
- When classification is clear, hand off immediately — do not narrate the
  routing table at the user.

## Examples

**Single-skill ask:**
Input: ask kubit to show failed checkout traces since yesterday
Output: Routes to /kubit-inspect with the user's wording; inspect governs the
        rest. Nothing added after it finishes.

**Investigation:**
Input: /kubit why did errors spike on Tuesday?
Output: /kubit-report charts the error trend and pins the window to Tuesday →
        /kubit-inspect pulls the failing traces in that window → one-line
        confirm → /kubit-blame with the export URL and window carried
        forward.

**Unclear ask:**
Input: ask kubit about my data
Output: One short clarifying question ("Aggregate trends, or specific
        traces/sessions?"), then routes by the answer.
