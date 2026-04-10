---
name: kubit-report
description: Use this skill to find, open, create, or modify Kubit reports for LLM ops analysis. Use for: report, grid, query, funnel, flow, retention, find report, search report, open report, create report, build report, modify report, edit report, add filter, change date range, traces, sessions, token cost, intent, model latency, prompt errors. Use this skill whenever the user mentions any Kubit report type, asks about analytics data, or wants to visualize LLM performance — even if they don't explicitly say "report." Do NOT use this skill for inspecting raw records by id or filter — use /kubit-inspect instead.
user_invocable: true
---

# kubit-report

## Overview

This skill finds existing Kubit reports, creates new ones, or modifies existing ones for LLM ops analysis — traces, sessions, intents, token cost, model performance, and user behavior. Supported report types: Grid, Query, Funnel, Flow, and Retention. The active workspace and organization are managed by `/kubit-init`. For inspecting raw records inside a report, use `/kubit-inspect`.

## When to Use

- The user wants to open a specific report by id
- The user wants to search for an existing report by name or description
- The user wants to create a new report (e.g. "build a funnel for prompt → response → user retry")
- The user wants to modify an existing report (e.g. "add a filter for model=gpt-4", "change the date range to last 30 days", "add a step to this funnel")

## Inputs

- `query` (required) — natural language description of what the user wants. Can be a report id, a search phrase, a description of a new report to build, or a modification to an existing report.
- `limit` (optional) — maximum number of search results to return when multiple reports match. Defaults to 5. Only include `limit` in the MCP payload when the operation is a search. Omit for create and modify operations.

Report type (`grid`, `query`, `funnel`, `flow`, `retention`) is inferred by the MCP from the user's wording. Do not set it explicitly.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit-init — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `kubit_report`. Do not pre-parse, resolve, or reshape parameters — the MCP handles report id lookup, search matching, type inference, creation, and modification.
3. **Always search first when intent is ambiguous.** If the user's wording could mean either "find an existing report" or "create a new one," always search first. Only create when:
   - The user uses a clear creation intent (e.g. "create", "build", "make", "new", "set up", "I need a new...", "give me a..."), OR
   - A search returns zero matches and the user confirms they want to create one.
4. **Present the report or search results.**
   - **Single match or created report:** Return the report id, link URL, and raw data. Present the data in whatever shape the MCP returns — do not reformat across report types. You may add a 1–2 line contextual note after the raw data if it adds value.
   - **Modified report:** The MCP returns a new report id. Present the new id, link URL, and updated data. Note that the original report is unchanged and reference its id for context.
   - **Multiple search matches:** Return up to `limit` results as a compact list with id, name, and type. Show the total match count. Ask the user to pick one.
   - **Zero matches:** Say so and ask whether to broaden the search or create a new report from the description.
   - If the MCP returns suggestions or clarification questions, relay them verbatim.
5. **Offer next steps.** Ask if the user wants to refine or modify the report. If the report contains rows the user might want to investigate individually (traces, sessions, users, events), suggest `/kubit-inspect` as a drill-down. Do not suggest `/kubit-inspect` for aggregate reports like retention curves or funnel conversion rates where row-level drilling is not meaningful.

Example output format:

    Report: <n> (<type>)
    ID: <report_id>
    URL: <report_url>

    <raw data — table, list, or structure as returned by the MCP>

    <optional 1–2 line contextual note>

## Error Handling

- User wants to switch org/workspace → "Run /kubit-init to switch."
- No matching report found → "No report matched. Want me to broaden the search, or create a new report from your description?"
- Ambiguous match among results → Relay the MCP's clarification question verbatim, or show the top matches and let the user pick.
- Bulk creation request (multiple reports in one turn) → Confirm with the user before proceeding, as report creation may be expensive.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Find by id:**
Input: /kubit-report 10798
MCP: `{ "query": "10798" }`

**Search by name (ambiguous — search first):**
Input: /kubit-report daily failed traces
MCP: `{ "query": "daily failed traces", "limit": 5 }`
Behavior: Search first. If a match exists, return it. If not, ask the user whether to create a new report.

**Search returns zero matches:**
Input: /kubit-report latency by provider
MCP: `{ "query": "latency by provider", "limit": 5 }`
Behavior: No results. Respond: "No report matched 'latency by provider.' Want me to create a new one, or try a broader search?"

**Create a new funnel (explicit build verb):**
Input: /kubit-report build a funnel for user query → intent classification → tool call → response
MCP: `{ "query": "build a funnel for user query → intent classification → tool call → response" }`

**Create with inferred type:**
Input: /kubit-report create a weekly retention report for users whose first session had zero errors
MCP: `{ "query": "create a weekly retention report for users whose first session had zero errors" }`

**Modify an existing report:**
Input: /kubit-report add a filter for model=gpt-4 to report 10798
MCP: `{ "query": "add a filter for model=gpt-4 to report 10798" }`

## Gotchas

_To be added as we test._