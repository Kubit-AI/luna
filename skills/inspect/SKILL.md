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

- `query` (required) — natural language description of what to find. Can be a direct request, an id/filter set, or a reference to an existing report (prior conversation or pasted URL). If the user requests a specific number of results, include that in the query string — the MCP handles row limits internally.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit:init — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `inspect`. Do not pre-parse, resolve, or reshape parameters — the MCP handles entity type, filters, schema, and date range. If the user references a prior report or pastes a report URL, include that context in the query string. If the MCP asks which entity type to query (users, sessions, traces, events), present the options to the user rather than guessing.
3. **Present results.** The MCP returns a text response containing a summary and selected rows. Use it as the basis for your response but reshape it conversationally — don't paste it verbatim.

   Formatting rules:
   - Lead with the key finding or answer sentence from the MCP.
   - Single entity: summarize the key fields conversationally. Include cost, latency, tokens, error info, and status. Don't just list fields — explain what they mean for this entity.
   - Multiple entities: summarize the pattern first (what's broken, expensive, or slow), then list individual results as a compact numbered list with one line per entity showing id, status, cost, latency, and timestamp.
   - Always state the total match count vs. displayed count (e.g. "Showing 5 of 47").
   - If the user asked for a specific number of results, the MCP will have honored that in its row selection — just present what comes back.

4. **Offer next steps based on entity type.**
   - User → "Want to see their sessions or traces?"
   - Session → "Want to see the traces in this session?"
   - Trace → "Want to see its events, or blame the responsible agent?"
   - Multiple traces → suggest /kubit:blame to attribute failures, or /kubit:report if the user wants to see the trend over time.

## Rules
- Summarize when returning multiple results - never list raw fields without context
- Always show total match count alongside displayed results
- Trust the MCP's row selection — don't truncate or pad results client-side.
- Reference prior entity ids naturally in follow-up queries — the MCP maintains session context.
- Do not restructure the MCP's stats into tables, bullet lists, or other rigid formats unless the user asks for a specific format. Use conversational prose with inline numbers.

## Error Handling

- No results (MCP returns zero rows) → Tell the user nothing matched and suggest broadening the time range or checking filter values. Use your own wording.
- Execution failure (MCP returns isError: true) → Surface the failure message from the MCP. Don't invent details about what went wrong.
- No export URL (MCP succeeded but returned no data) → Tell the user the report ran but produced no downloadable data.
- MCP unreachable → Tell the user the connection to the MCP failed and suggest checking their network.
- Entity type ambiguous (MCP asks for clarification) → Present the options (users, sessions, traces, events) to the user. Don't guess.

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

**Drill into a report segment:**
Input: inspect the users who dropped off at payment in that funnel
Output: User summary with cost and error signals for the dropped-off segment.
        Offer to inspect their sessions or traces for deeper investigation.

**Zero results:**
Input: /kubit:inspect traces with intent "ResetPassword" in the last hour
Output: No matching results. Suggest broadening time range or checking the intent name.

## Gotchas

_To be added as we test._
