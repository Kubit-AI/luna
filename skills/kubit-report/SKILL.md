---
name: kubit-report
description: Use this skill to view, build, change, or search Kubit analytics reports — queries, data tables, funnels, paths, retention, significance tests, or agent flows.
---

# /kubit-report

## Overview

This skill finds, opens, and creates Kubit analytics reports for LLM
ops analysis — traces, sessions, intents, token cost, model performance, and user
behavior. Supported report types: query, data table, funnel, path, retention,
significance test, and agent flow. Raw rows and who is in a cohort are
/kubit-inspect's.
Workspace and organization are managed by /kubit-connect. To drill into individual
records from a report, use /kubit-inspect.

## When to Use

- The user wants to open a specific report by id
- The user wants to search for an existing report by name or description
- The user wants to create a new report (e.g. "build a funnel for prompt → response → user retry")
- The user wants to change a report (e.g. "add a filter for platform = ios to report 10798")
- Do NOT use for inspecting individual records — use /kubit-inspect for that

## Workflow

1. **Confirm workspace context.** Call the `init` MCP tool to load the current org/workspace and obtain a WSCTX (workspace context) token if one isn't already available in this conversation. `init` is the only MCP tool that returns workspace context and a wsctx token — do not substitute any other tool (e.g. `help`) for this step. If the user wants to switch, redirect to /kubit-connect. On an auth error or missing Kubit tools, follow **MCP authentication** below.
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
   - **Change** — the user asks to alter an existing report (add a filter, change the dates, a different breakdown) → **Change a report** below.
   - **Create** — user uses explicit creation language: "create", "build", "make", "new", "set up", "give me a..." — or a search returned zero matches and the user confirmed they want to create
   - **Refresh** — user explicitly asks to re-run or bypass cache for a known report id
   - **Ambiguous** — always search first.
4. **Call the MCP based on intent.** Every call below takes the `wsctx` from step 1.
   - **Find/open (by id)** → `get_report(reportId=<id>, wsctx)` returns the report's summary, its settings, the first 20 rows and its definition.
   - **Search (by name)** → `get_report(searchTerm="<query>", wsctx)` returns up to 10 name matches. One match → render. Multiple → compact list, ask the user to pick. A match that already answers the question is read with `get_report`, not built again.
   - **List recent** → `get_report(wsctx)` with neither `reportId` nor `searchTerm` returns the 10 most recent reports.
   - **Refresh** → `get_report(reportId=<id>, refresh=true, wsctx)` forces re-execution, bypassing cached data. Only on explicit user request — it may be slow.
   - **Create** → you write the report; Kubit checks and runs it:
     1. Pick the report type (`kind`): `query`, `dataTable`, `funnel`, `path`, `retention`, `significance` or `agentFlow`.
     2. `get_report_instructions(kind="<kind>", wsctx)` for that kind's rules and JSON Schema.
     3. `get_analytics_schema(wsctx)` for the exact event and field names.
     4. `create_report(kind="<kind>", definition=<definition>, wsctx)`. A report that names cohorts passes them in the separate `cohorts` argument; `search_published_cohorts` and `define_cohort` find or make them.
     5. A result starting **The report was not run** lists what to fix: resend as it says. It cost nothing.

     Ask the user only when the schema cannot settle what they meant, or when Kubit's result offers choices.

   `reportId` and `searchTerm` are mutually exclusive — never pass both.

   **Change a report** (one built in this session, or one the user names by id):
   1. `get_report(reportId=<id>, wsctx)` shows its definition.
   2. Change that definition as the user asked.
   3. `create_report(kind="<kind>", definition=<changed definition>, basedOnReportId="<id>", wsctx)`. Kubit files it as the report's next version where it can, with its chart settings.

   A change of report type is a new report: build it through the **Create** steps above, without `basedOnReportId`, and tell the user it is a new report.

   **Agent flows.** A built or opened agent flow ends with its failed nodes. Offer `investigate_agent_flow_failure(reportId="<id>", position, label, …, wsctx)` (why traces fail at a node: the node the user names, otherwise the largest) and `inspect_agent_flow_activity(reportId="<id>", position, label, …, wsctx)` (open a node's traces in Activity) as its result names them, and run them only when the user asks. Their findings are associations, never causes.

   **Reading rows.** For a slice, or when neither uv nor Python is installed, read rows directly: `get_report(reportId=<id>, where={"<column>": "<value>"}, columns=["…"], rows={offset: 0, limit: 50}, wsctx)` (limit up to 100; only with `reportId`, never with `refresh`). An Activity report is paged, not filtered: pass only `rows` for it. When a result says its data was reused or cached, say when it was computed and offer a refresh.
5. **Route the response.** The result already carries the report's first 20 rows and its series totals: answer from them. Spawn the kubit-analyst on the full dataset only when the question needs more than they show (more rows, a statistic over all of them, a breakdown the result doesn't have) and an export URL is available.

   **Decision rule:**
   - **Search and list operations** → Present MCP response directly (no kubit-analyst).
   - **Multiple search matches** → Compact list with id, name, type. Ask user to pick.
   - **Zero matches** → Offer to broaden search or create.
   - **Errors / regressions visible in the report** → After presenting the results, add a one-line natural-language suggestion: "If you want to find the code change behind this, try /kubit-blame." Do not run /kubit-blame yourself — let the user decide.
   - **Report data returned** → Spawn kubit-analyst when the whole dataset is needed and there is an export URL (see below); otherwise see **Reading rows**.
   - **Whole dataset needed, no export URL** → Present the summary. Add a note: "Full-dataset analysis isn't available for this report (no CSV export)."
   - Relay any choices Kubit's result offers rather than guessing.

   **Kubit-analyst spawn procedure** (for report data + export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then read the rows with `get_report(…, rows=…)` instead (see **Reading rows**). The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question about the report
      - **Export URL:** The export URL from the MCP response text
      - **Workspace context key:** `$WSCTX_KEY` (from step 2 — tells the analyst where to cache)
      - **Source:** `report` (recorded in the dataset manifest)
      - **Context:** The report type, any filters applied, and relevant column descriptions
   3. Relay the analyst's findings as returned (headline + compact table + brief notable findings). Don't expand into prose.

   **Cached-dataset spawn** (for step 2 follow-ups that reuse `$CACHE_DIR/current.csv`):
   1. Check prerequisites via Bash (`command -v uv`, `python3 --version`). If neither is available, read the rows of that report with `get_report(reportId=<id>, rows=…, wsctx)` when its id is in this conversation; otherwise tell the user so and stop.
   2. Spawn `kubit-analyst` with:
      - **Question:** The user's follow-up question
      - **Dataset path:** `$CACHE_DIR/current.csv` (already wsctx-scoped)
      - **Context:** The original question and column list from `$CACHE_DIR/current.json`
   3. Present findings conversationally.

6. **Offer next steps.** When the repository holds the code that sends a Kubit event or field the report uses, and the question covers a date range, check that code's git history and name the date its meaning last changed, if that date falls inside the range. Ask if the user wants to refine the report. If the report contains rows the user might want to investigate individually (traces, sessions, users, events), suggest `/kubit-inspect` as a drill-down. Do not suggest `/kubit-inspect` for aggregate reports like retention curves or funnel conversion rates where row-level drilling is not meaningful.

## MCP authentication

{{KUBIT_MCP_AUTH}}

## Rules
{{KUBIT_LUMOS_CONTEXT}}
- **Always render the report as `[<display>](<reportUrl>)`.** Whenever the MCP response contains `display` and `reportUrl` fields, present the report as a markdown link using `display` as the link text and `reportUrl` as the href. Never show the URL bare, and never present a report identifier without the link when both fields are available. Applies to every branch that surfaces a report — open, create, and each row of a multi-match list.
- Always search before creating when intent is ambiguous
- Never create multiple reports in one turn without confirming first
- Only set `refresh: true` on `get_report` when the user explicitly asks to re-run or bypass the cache
- Relay choices Kubit's result offers rather than guessing
- When the report surfaces errors, escalations, sentiment drift, or a regression, suggest `/kubit-blame` as a next step — but never invoke it automatically.

## Error Handling

- Switch org/workspace → "Run /kubit-connect to switch."
- `get_report` id not found → "No report with id <id>. Want me to search by name instead?"
- No match → "No report matched. Want me to broaden the search or create a new one?"
- Ambiguous match → Show top results and ask the user to pick.
- MCP failure that is not an auth error → "Could not connect to the Kubit MCP server. Check your network." An auth error, or Kubit tools that are not available, goes to **MCP authentication**.

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
Output: Instructions for `funnel` and the schema read, the funnel JSON written,
        `create_report(kind="funnel", definition=…, wsctx)` run — report data returned. Offer to
        drill into results with /kubit-inspect.

**Change a report by id:**
Input: /kubit-report add a filter for platform = ios to report 10798
Output: `get_report(reportId=10798, wsctx)` read, its definition changed, and
        `create_report(…, basedOnReportId="10798", wsctx)` run — the next version.

**Create with inferred type:**
Input: /kubit-report create a weekly retention report for users whose first session had zero errors
Output: Retention report created — report data returned.

**Zero results:**
Input: /kubit-report latency by provider
Output: "No report matched 'latency by provider.'
        Want me to create a new one, or try a broader search?"
