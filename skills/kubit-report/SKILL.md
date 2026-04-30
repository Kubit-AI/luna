---
name: kubit-report
description: Use this skill to view, build, or search Kubit analytics reports — funnels, flows, retention, or queries.
---

# /kubit-report

## Overview

This skill finds, opens, and creates Kubit analytics reports for LLM
ops analysis — traces, sessions, intents, token cost, model performance, and user
behavior. Supported report types: Query, Funnel, Flow, and Retention.
Workspace and organization are managed by /kubit-connect. To drill into individual
records from a report, use /kubit-inspect.

## When to Use

- The user wants to open a specific report by id
- The user wants to search for an existing report by name or description
- The user wants to create a new report (e.g. "build a funnel for prompt → response → user retry")
- Do NOT use for inspecting individual records — use /kubit-inspect for that

## Workflow

1. **Confirm workspace context.** Call the `init` MCP tool to load the current org/workspace and obtain a WSCTX (workspace context) token if one isn't already available in this conversation. `init` is the only MCP tool that returns workspace context and a wsctx token — do not substitute any other tool (e.g. `help`) for this step. If the user wants to switch, redirect to /kubit-connect.
2. **Check for a cached dataset (wsctx-scoped).** Compute the cache key from the current MCP WSCTX token so concurrent conversations don't collide:

   ```bash
   WSCTX_KEY=$(printf %s "$WSCTX" | shasum -a 256 | cut -c1-12)
   CACHE_DIR="/tmp/kubit-dataset/$WSCTX_KEY"
   ```

   If `$CACHE_DIR/current.json` exists, read it. If the user's message is a follow-up analysis or narrowing question about that same dataset (e.g. references "those", "the ones", "that set", or asks for a different cut of the data just shown), **skip the MCP call** and spawn `kubit-analyst` with `Dataset path: $CACHE_DIR/current.csv` plus the cached manifest's question and columns as Context. Otherwise proceed below — a new MCP call will replace this workspace's cached dataset. When unsure, prefer a fresh fetch.
3. **Determine intent.** Before calling the MCP, identify what the user wants:
   - **Find/open** — user references a report by numeric id
   - **Search** — user references a report by name or description
   - **List recent** — user asks for "recent reports", "what reports do I have", or similar without naming one
   - **Create** — user uses explicit creation language: "create", "build", "make", "new", "set up", "give me a..." — or a search returned zero matches and the user confirmed they want to create
   - **Refresh** — user explicitly asks to re-run or bypass cache for a known report id
   - **Ambiguous** — always search first.
4. **Call the MCP based on intent.** Pass the user's wording through directly — do not pre-parse or reshape parameters.
   - **Find/open (by id)** → `get_report(reportId=<id>)` returns the report's summary (status, urls, failure message).
   - **Search (by name)** → `get_report(searchTerm="<query>")` returns up to 10 name matches. One match → render. Multiple → compact list, ask the user to pick.
   - **List recent** → `get_report()` with neither `reportId` nor `searchTerm` returns the 10 most recent reports.
   - **Refresh** → `get_report(reportId=<id>, refresh=true)` forces re-execution, bypassing cached data. Only on explicit user request — it may be slow.
   - **Create** → `create_report(query="<user wording>")`. The MCP classifies the query into the right type (query, funnel, flow, retention, cohort sample) and builds it.

   `reportId` and `searchTerm` are mutually exclusive — never pass both.

   **Reports are immutable — modifications create a new report.** Existing reports cannot be edited in place; there is no MCP tool that mutates a report. Handle "change", "update", "add a filter", "rebuild with", "but for X" requests as follows:
   - **Modification of a report just created in this session** — the original query wording is in conversation context. Call `create_report(query="<original wording> + <user's modification>")` directly so the new report encodes the combined intent. Do not call `get_report` to "look up" the original — its response does not include the report's query. After the call, briefly note that this produced a new report (reports are immutable) so the user knows the original is still around.
   - **Modification of a report referenced only by id (no in-session context)** — the original query is unavailable (`get_report` does not return it), so a faithful merge is impossible. Decline, explain reports are immutable, and ask the user to restate the full report they want; then proceed via the normal **Create** path.
5. **Route the response.** The MCP returns report data. For operations that produce viewable data (opening or viewing a report), full-dataset analysis via the kubit-analyst is required whenever an export URL is available.

   **Decision rule:**
   - **Create and search operations** → Present MCP response directly (no kubit-analyst).
   - **Multiple search matches** → Compact list with id, name, type. Ask user to pick.
   - **Zero matches** → Offer to broaden search or create.
   - **Errors / regressions visible in the report** → After presenting the results, add a one-line natural-language suggestion: "If you want to find the code change behind this, try /kubit-blame." Do not run /kubit-blame yourself — let the user decide.
   - **Report data returned + export URL** → Spawn kubit-analyst on the full dataset (see below).
   - **Report data returned + no export URL** → Present MCP summary. Add a note: "Full-dataset analysis isn't available for this report (no CSV export)."
   - Relay any MCP clarification questions verbatim.

   **Kubit-analyst spawn procedure** (for report data + export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then fall back to the report results. The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question about the report
      - **Export URL:** The export URL from the MCP response text
      - **Workspace context key:** `$WSCTX_KEY` (from step 2 — tells the analyst where to cache)
      - **Source:** `report` (recorded in the dataset manifest)
      - **Context:** The report type, any filters applied, and relevant column descriptions
   3. Relay the analyst's findings as returned (headline + compact table + brief notable findings). Don't expand into prose.

   **Cached-dataset spawn** (for step 2 follow-ups that reuse `$CACHE_DIR/current.csv`):
   1. Check prerequisites via Bash (`command -v uv`, `python3 --version`). If neither is available, tell the user and stop — there's no MCP fallback on this path.
   2. Spawn `kubit-analyst` with:
      - **Question:** The user's follow-up question
      - **Dataset path:** `$CACHE_DIR/current.csv` (already wsctx-scoped)
      - **Context:** The original question and column list from `$CACHE_DIR/current.json`
   3. Present findings conversationally.

6. **Offer next steps.** Ask if the user wants to refine the report. If the report contains rows the user might want to investigate individually (traces, sessions, users, events), suggest `/kubit-inspect` as a drill-down. Do not suggest `/kubit-inspect` for aggregate reports like retention curves or funnel conversion rates where row-level drilling is not meaningful.

## Rules
- **Always render the report as `[<display>](<reportUrl>)`.** Whenever the MCP response contains `display` and `reportUrl` fields, present the report as a markdown link using `display` as the link text and `reportUrl` as the href. Never show the URL bare, and never present a report identifier without the link when both fields are available. Applies to every branch that surfaces a report — open, create, and each row of a multi-match list.
- Always search before creating when intent is ambiguous
- Never create multiple reports in one turn without confirming first
- Only set `refresh: true` on `get_report` when the user explicitly asks to re-run or bypass the cache
- Relay MCP clarification questions verbatim rather than guessing
- When the report surfaces errors, escalations, sentiment drift, or a regression, suggest `/kubit-blame` as a next step — but never invoke it automatically.

## Error Handling

- Switch org/workspace → "Run /kubit-connect to switch."
- `get_report` id not found → "No report with id <id>. Want me to search by name instead?"
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

**Zero results:**
Input: /kubit-report latency by provider
Output: "No report matched 'latency by provider.'
        Want me to create a new one, or try a broader search?"
