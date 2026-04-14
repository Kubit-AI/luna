---
name: report
description: Use this skill to to view, build, or modify Kubit analytics reports — funnels, flows, retention, or queries.
---

# /kubit:report

## Overview

This skill finds, opens, creates, and modifies Kubit analytics reports for LLM
ops analysis — traces, sessions, intents, token cost, model performance, and user
behavior. Supported report types: Query, Funnel, Flow, and Retention.
Workspace and organization are managed by /kubit:init. To drill into individual
records from a report, use /kubit:inspect.

## When to Use

- The user wants to open a specific report by id
- The user wants to search for an existing report by name or description
- The user wants to create a new report (e.g. "build a funnel for prompt → response → user retry")
- The user wants to modify an existing report (e.g. "add a filter for model=gpt-4", "change the date range to last 30 days", "add a step to this funnel")
- Do NOT use for inspecting individual records — use /kubit:inspect for that

## Inputs

- `query` (required) — natural language description of what the user wants. Can be a report id, a search phrase, a description of a new report to build, or a modification to an existing report.
- `limit` (optional) — max search results to return. Defaults to 5.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit:init.
2. **Determine intent.** Before calling the MCP, identify what the user wants:
   - **Find/open** — user references a report by id, name, or description
   - **Create** — user uses explicit creation language: "create", "build","make", "new", "set up", "give me a..." — or a search returned zero matches and the user confirmed they want to create
   - **Modify** — user references an existing report id and describes a change
   - **Ambiguous** — always search first. 
2. **Pass the query through.** Send the user's wording directly to `create_report`. Do not pre-parse, resolve, or reshape parameters — the MCP handles report id lookup, search matching, type inference, creation, and modification.
3. **Present results.**
   - Single match or created report → return id, URL (if provided), and report data as-is
   - Multiple matches → compact list with id, name, type. Ask user to pick.
   - Modified report → return new id and note the original is unchanged
   - Zero matches → offer to broaden search or create
   - Relay any MCP clarification questions verbatim
5. **Offer next steps.** Ask if the user wants to refine or modify the report. If the report contains rows the user might want to investigate individually (traces, sessions, users, events), suggest `/kubit:inspect` as a drill-down. Do not suggest `/kubit:inspect` for aggregate reports like retention curves or funnel conversion rates where row-level drilling is not meaningful.

## Rules
- Always search before creating when intent is ambiguous
- Modifications always create a new report id — the original is always preserved
- Omit `limit` from the MCP call for create and modify operations
- Never create multiple reports in one turn without confirming first
- Relay MCP clarification questions verbatim rather than guessing

## Error Handling

- Switch org/workspace → "Run /kubit:init to switch."
- No match → "No report matched. Want me to broaden the search or create a new one?"
- Ambiguous match → Show top results and ask the user to pick.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Find by id:**
Input: /kubit:report 10798
Output: Report opened — data returned as-is from MCP.

**Search by name:**
Input: /kubit:report daily failed traces
Output: One match → open directly, return data.
        Multiple matches → compact list, ask user to pick.
        No matches → "No report matched. Want me to create one?"

**Create a new funnel:**
Input: /kubit:report build a funnel for user query → intent classification → tool call → response
Output: Funnel created — report data returned. Offer to drill into results
        with /kubit:inspect.

**Create with inferred type:**
Input: /kubit:report create a weekly retention report for users whose first session had zero errors
Output: Retention report created — report data returned.

**Modify an existing report:**
Input: /kubit:report add a filter for model=gpt-4 to report 10798
Output: Modified report saved as new id. Original rpt_10798 unchanged.
        New report data returned.

**Zero results:**
Input: /kubit:report latency by provider
Output: "No report matched 'latency by provider.'
        Want me to create a new one, or try a broader search?"

## Gotchas

_To be added as we test._
