---
name: report
description: Use this skill to to view, build, or modify Kubit analytics reports — funnels, flows, retention, or queries.
---

# /kubit-report

## Overview

This skill finds, opens, creates, and modifies Kubit analytics reports for LLM
ops analysis — traces, sessions, intents, token cost, model performance, and user
behavior. Supported report types: Query, Funnel, Flow, and Retention.
Workspace and organization are managed by /kubit-connect. To drill into individual
records from a report, use /kubit-inspect.

## When to Use

- The user wants to open a specific report by id
- The user wants to search for an existing report by name or description
- The user wants to create a new report (e.g. "build a funnel for prompt → response → user retry")
- The user wants to modify an existing report (e.g. "add a filter for model=gpt-4", "change the date range to last 30 days", "add a step to this funnel")
- Do NOT use for inspecting individual records — use /kubit-inspect for that

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit-connect.
2. **Determine intent.** Before calling the MCP, identify what the user wants:
   - **Find/open** — user references a report by id, name, or description
   - **Create** — user uses explicit creation language: "create", "build","make", "new", "set up", "give me a..." — or a search returned zero matches and the user confirmed they want to create
   - **Modify** — user references an existing report id and describes a change
   - **Ambiguous** — always search first. 
2. **Pass the query through.** Send the user's wording directly to `create_report`. Do not pre-parse, resolve, or reshape parameters — the MCP handles report id lookup, search matching, type inference, creation, and modification.
3. **Route the response.** The MCP returns report data. For operations that produce viewable data (opening or viewing a report), the MCP's summary may be based on a limited sample. Route through the kubit-analyst when the full dataset is available.

   **Decision rule:**
   - **Create, search, modify operations** → Present MCP response directly (no kubit-analyst).
   - **Multiple search matches** → Compact list with id, name, type. Ask user to pick.
   - **Modified report** → Return new id and note the original is unchanged.
   - **Zero matches** → Offer to broaden search or create.
   - **Report data returned + export URL** → Spawn kubit-analyst on the full dataset (see below).
   - **Report data returned + no export URL** → Present MCP summary. Add a note: "This summary is based on the MCP's limited sample — CSV export was not available for full-dataset analysis."
   - Relay any MCP clarification questions verbatim.

   **Kubit-analyst spawn procedure** (for report data + export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then fall back to the report results. The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question about the report
      - **Export URL:** The export URL from the MCP response text
      - **MCP summary:** The MCP's text response — the analyst uses this as context, flags discrepancies with full-dataset findings
      - **Context:** The report type, any filters applied, and relevant column descriptions
   3. Present the kubit-analyst's findings conversationally.

4. **Offer next steps.** Ask if the user wants to refine or modify the report. If the report contains rows the user might want to investigate individually (traces, sessions, users, events), suggest `/kubit-inspect` as a drill-down. Do not suggest `/kubit-inspect` for aggregate reports like retention curves or funnel conversion rates where row-level drilling is not meaningful.

## Rules
- Always search before creating when intent is ambiguous
- Modifications always create a new report id — the original is always preserved
- Omit `limit` from the MCP call for create and modify operations
- Never create multiple reports in one turn without confirming first
- Relay MCP clarification questions verbatim rather than guessing

## Error Handling

- Switch org/workspace → "Run /kubit-connect to switch."
- No match → "No report matched. Want me to broaden the search or create a new one?"
- Ambiguous match → Show top results and ask the user to pick.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Find by id:**
Input: /kubit-report 10798
Output: Report opened — data returned as-is from MCP.

**Search by name:**
Input: /kubit-report daily failed traces
Output: One match → open directly, return data.
        Multiple matches → compact list, ask user to pick.
        No matches → "No report matched. Want me to create one?"

**Create a new funnel:**
Input: /kubit-report build a funnel for user query → intent classification → tool call → response
Output: Funnel created — report data returned. Offer to drill into results
        with /kubit-inspect.

**Create with inferred type:**
Input: /kubit-report create a weekly retention report for users whose first session had zero errors
Output: Retention report created — report data returned.

**Modify an existing report:**
Input: /kubit-report add a filter for model=gpt-4 to report 10798
Output: Modified report saved as new id. Original rpt_10798 unchanged.
        New report data returned.

**Zero results:**
Input: /kubit-report latency by provider
Output: "No report matched 'latency by provider.'
        Want me to create a new one, or try a broader search?"

## Gotchas

_To be added as we test._
