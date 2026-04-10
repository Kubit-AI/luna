---
name: kubit-inspect
description: Use this skill to inspect and retrieve raw Kubit data. Use for: inspect, show me, find, look up, list, traces, sessions, users, events, spans, failed traces, token cost, debug, search data.
user_invocable: true
---

# kubit-inspect

## Overview

This skill retrieves raw data from Kubit — users, sessions, traces, and events — for debugging and investigation. The active workspace and organization are managed by `/kubit-init`.

## When to Use

- The user wants to find or inspect specific traces, sessions, users, or events
- The user is debugging a failure, error, or unexpected behavior
- The user wants to filter data by cost, intent, status, or time range
- The user asks "what happened", "show me", "find", or "look up" anything in Kubit
- The user wants to drill into a segment of an existing report (from prior conversation or a pasted URL)

## Inputs

- `query` (required) — natural language description of what to find. Can be a direct request, an id/filter set, or a reference to an existing report (prior conversation or pasted URL).
- `limit` (optional) — number of results to return. Defaults to 5.

## Workflow

1. **Confirm workspace context.** Call `kubit_init` and confirm the current org/workspace with the user. If the user wants to switch, redirect to `/kubit-init` — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `kubit_inspect` as `{ "query": "...", "limit": 5 }`. Do not pre-parse, resolve, or reshape parameters — the MCP handles entity type, filters, schema, and date range. If the user references a prior report or pastes a report URL, include that context in the query string.
3. **Present raw results.** Return a structured list, one record per result, with the total match count. Do not interpret the data unless asked. After the list, you may add a 1–2 line contextual summary if it adds value (e.g., "All 5 results are from the same user" or "Results span the last 6 hours"). If the MCP returns suggestions or clarification questions, relay them verbatim. If 0 results, say so and suggest a broader query.
4. **Offer next steps.** Ask if the user wants to refine, expand, or take action.

Example output:

    Found 47 results matching your query:

    [1] Session ID: sess_8472
        User: alex@acme.com
        Intent: Checkout
        Token Cost: $6.20
        Status: failed
        Timestamp: 2024-01-15 14:32:01

    Showing 5 of 47 results. All 5 are from the same user in the last 2 hours.

## Error Handling

- User wants to switch org/workspace → "Run /kubit-init to switch."
- No results → "No results matched. Try broadening your query or adjusting the date range."
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Direct query with filters:**
Input: /kubit-inspect failed traces with intent Checkout since yesterday
MCP: `{ "query": "failed traces with intent Checkout since yesterday", "limit": 5 }`

**Override the default limit:**
Input: Show me 20 failed traces from today
MCP: `{ "query": "failed traces from today", "limit": 20 }`

**Drill into an existing report (conversation context):**
Input: From the checkout funnel report we just looked at, inspect the users who dropped off at payment
MCP: `{ "query": "from the checkout funnel report, users who dropped off at the payment step", "limit": 5 }`

**Drill into a pasted report URL:**
Input: /kubit-inspect failed sessions from this report https://app.kubit.ai/reports/abc123
MCP: `{ "query": "failed sessions from report https://app.kubit.ai/reports/abc123", "limit": 5 }`

## Gotchas

_To be added as we test._