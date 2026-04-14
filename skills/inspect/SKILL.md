---
name: inspect
description: Use this skill when the user wants to find or drill into raw Kubit data — traces, sessions, users, or events.
---

# /kubit:inspect

## Overview

This skill finds and investigates Kubit entities — users, sessions, traces, and
events. Entities are hierarchical: a user has sessions, a session has traces, a
trace has events. Start at any level and navigate down. When multiple results are
returned, summarize the pattern across them — do not dump raw fields. For
aggregate analytics and trends, use /kubit:report.

## When to Use

- The user wants to find or inspect specific traces, sessions, users, or events
- The user is debugging a failure, error, or unexpected behavior
- The user wants to navigate from one entity into related ones (e.g. "show me the traces for that session" or "what sessions does this user have?")
- The user wants to filter data by cost, intent, status, or time range for specific users, sessions, traces or events
- The user wants to drill into a segment of an existing report (from prior conversation or a pasted URL)

## Inputs

- `query` (required) — natural language description of what to find. Can be a direct request, an id/filter set, or a reference to an existing report (prior conversation or pasted URL).
- `limit` (optional) — number of results to return. Defaults to 5.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit:init — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `inspect`. Do not pre-parse, resolve, or reshape parameters — the MCP handles entity type, filters, schema, and date range. If the user references a prior report or pastes a report URL, include that context in the query string. If the MCP asks which entity type to query (users, sessions, traces, events), present the options to the user rather than guessing.
3. **Present results.**

   Single entity — summarize the key fields and what they mean:

       User: alex@acme.com
       Sessions: 14 total · 3 failed (21%)
       Avg cost: $4.20 · Avg latency: 1,840ms · Avg tokens: 3,200
       Top errors: context_length_exceeded (x4), timeout (x2)
       Top intent: Checkout · Last seen: 2024-01-15 14:32

       Session: sess_8472
       Traces: 6 · Status: failed
       Total cost: $6.20 · Total tokens: 4,100 · Latency: 2,340ms
       Error: Failed to generate content at Step 4
       Intent: Checkout · Started: 2024-01-15 14:28

       Trace: trace_9103
       Status: failed · Cost: $1.80 · Tokens: 2,400 · Latency: 3,100ms
       TTFT: 420ms · Error: context_length_exceeded
       Model: gpt-4.1 · Intent: Checkout · Prompt: prompt_v3

   Multiple entities — summarize the performance pattern first, then list.
   Lead with what is broken, expensive, or slow:

       5 failed traces in the last 2 hours. All from the same user.
       Avg cost: $5.90 · Avg latency: 2,800ms · Avg tokens: 3,900
       Common error: context_length_exceeded · All on model gpt-4.1

       [1] trace_8472 — failed — $6.20 — 3,100ms — Checkout — 2024-01-15 14:32
       [2] trace_8490 — failed — $5.80 — 2,640ms — Checkout — 2024-01-15 13:58
       ...

       Showing 5 of 47. Ask for more or refine your filters.

4. **Offer next steps based on entity type.**
   - User → "Want to see their sessions or traces?"
   - Session → "Want to see the traces in this session?"
   - Trace → "Want to see its events, or blame the responsible agent?"
   - Multiple traces → suggest /kubit:blame to attribute failures, or
     /kubit:report if the user wants to see the trend over time.

## Rules
- Summarize when returning multiple results - never list raw fields without context
- Always show total match count alongside displayed results
- Never exceed the user's confirmed limit (default: 5)
- Carry entity ids from context into follow-up queries automatically

## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- No results → "No results matched. Try broadening your query or adjusting the date range."
- Broad request that would return excessive results → Confirm the scope with the user before proceeding, or suggest narrowing the query.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Inspect a user:**
Input: /kubit:inspect user alex@acme.com
Output: User summary — cost, latency, tokens, top errors, session count, top intent.
        Offer to drill into sessions or traces.

**Navigate from user into sessions:**
Input: show me their sessions [following /kubit:inspect user alex@acme.com]
Output: Pattern summary — failure rate, avg cost, avg latency, common errors.

**Failed traces with filters:**
Input: /kubit:inspect failed traces with intent Checkout since yesterday
Output: Pattern summary — avg cost, avg latency, avg tokens, common error, common model.
        List with cost, latency, intent, and timestamp per trace. Total count shown.
        Offer to blame the responsible agent or report the trend over time.

**Override the default limit:**
Input: show me 20 failed traces from today
Output: Pattern summary across all 20 results — cost, latency, tokens, error breakdown.
        Full list with key signals per trace. Total count shown.

**Drill into a report segment:**
Input: inspect the users who dropped off at payment in that funnel
Output: User summary with cost and error signals for the dropped-off segment.
        Offer to inspect their sessions or traces for deeper investigation.

**Zero results:**
Input: /kubit:inspect traces with intent "ResetPassword" in the last hour
Output: "No results matched. Try broadening the time range or checking the intent name."

## Gotchas

_To be added as we test._
