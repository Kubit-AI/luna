---
name: kubit-inspect
description: Use this skill when the user wants to find or drill into raw Kubit data — traces, sessions, users, or events, or who is in a cohort.
---

# /kubit-inspect

## Overview

This skill finds and investigates Kubit entities — users, sessions, traces, and
events. Entities are hierarchical: a user has sessions, a session has traces, a
trace has events. Start at any level and navigate down. When multiple results are
returned, summarize the pattern across them — do not dump raw fields. For
aggregate analytics and trends, use /kubit-report.

## When to Use

- The user wants to find or inspect specific traces, sessions, users, or events
- The user is debugging a failure, error, or unexpected behavior
- The user wants to navigate from one entity into related ones (e.g. "show me the traces for that session" or "what sessions does this user have?")
- The user wants to filter data by cost, intent, status, or time range for specific users, sessions, traces or events
- The user wants to drill into a segment of an existing report (from prior conversation or a pasted URL)
- The user wants to see or find the users, sessions or traces in a cohort

## Workflow

1. **Confirm workspace context.** Call the `init` MCP tool to load the current org/workspace and obtain a WSCTX (workspace context) token if one isn't already available in this conversation. `init` is the only MCP tool that returns workspace context and a wsctx token — do not substitute any other tool (e.g. `help`) for this step. If the user wants to switch org/workspace, redirect to /kubit-connect — workspace and organization selection is owned by that skill. On an auth error or missing Kubit tools, follow **MCP authentication** below.
2. **Check for a cached dataset (wsctx-scoped).** Compute the cache key from the current MCP WSCTX token so concurrent conversations don't collide:

   ```bash
   WSCTX_KEY=$(printf %s "$WSCTX" | shasum -a 256 | cut -c1-12)
   CACHE_DIR="/tmp/kubit-dataset/$WSCTX_KEY"
   ```

   If `$CACHE_DIR/current.json` exists, read it. If the user's message is a follow-up analysis or narrowing question about that same dataset (e.g. references "those", "the ones", "that set", or asks for a different cut of the data just shown), **skip the MCP call** and spawn `kubit-analyst` with `Dataset path: $CACHE_DIR/current.csv` plus the cached manifest's question and columns as Context. Otherwise proceed to the MCP call below — it will replace this workspace's cached dataset. When unsure whether the question is a follow-up, prefer a fresh fetch.
3. **Build the rows.** You write the report; Kubit checks and runs it. Every call takes the `wsctx` from step 1.
   1. Pick the report type (`kind`):
      - **Rows** (traces, sessions, users, events) → `activity`. The workspace decides what a row is: traces, sessions, users or spans where it has an OTEL Activity profile, otherwise events.
      - **Users or sessions a cohort narrows or excludes** ("users except those who…") → `activity`, with the cohort filter.
      - **Who is in a cohort**, or a cohort comparison that names no metric → `inspection`. Name the cohorts in `create_report`'s separate `cohorts` argument; `search_published_cohorts` and `define_cohort` find or make them.
   2. `get_report_instructions(kind="<kind>", wsctx)` for that kind's rules and JSON Schema.
   3. `get_analytics_schema(wsctx)` for the exact event and field names.
   4. `create_report(kind="<kind>", definition=<definition>, wsctx)`. An id the user names (a trace, session or user) goes in the definition's filter. A result starting **The report was not run** lists what to fix: resend as it says.
4. **Route the response.** The result has a `## Created Analysis` block (id, display, reportUrl, status), an `exportUrl` to the full dataset CSV, and a sample: **5 rows** for activity, **20** for an inspection (long values cut at 97 chars). Its row count is marked **capped by the warehouse** when the real total is higher: then it is a floor, never a total. Use the sample and count to summarize directly without spawning the analyst, unless the user's intent is analytical. A report that matched nothing still returns the block, with `totalRows: 0`; a failed run has a status other than SUCCESS and its failure message.

   **Top-level decision rule:**
   - **Zero results** (`totalRows: 0`) → Say nothing matched and suggest broadening filters or time range. Do not spawn the analyst on an empty dataset.
   - **A status other than SUCCESS** → Surface its failure message as-is.
   - **Rows and an exportUrl** → route by intent (see below). Apply the same rule to single- and multi-row results.
   - **MCP error** (`isError: true`) → Surface the failure as-is. Do not fabricate data.

   **Intent routing (exportUrl path):**

   Classify the user's query as **analytical** if it contains aggregation/statistical asks (`p50`, `p95`, `p99`, percentile, distribution, average, mean, median, total, sum, count by, rate, ratio), ranking (`top N`, `bottom N`, worst, best, highest, lowest, most, least), or pattern/causal asks (`why`, pattern, cluster, outlier, correlate, trend, over time, compared to, breakdown by, group by). Otherwise treat as **lookup** ("show me failed traces", "find sessions for alex", "list traces with intent Checkout"). When ambiguous, prefer lookup — the user can always accept the trailing offer.

   - **Analytical intent → auto-spawn `kubit-analyst`** on the export URL (see procedure below). Relay the analyst's headline + table + notable findings as-is, then add the standard next-step suggestions. Do not ask first.
   - **Lookup intent → render directly from the inline sample**, then offer the analyst as the trailing next step. Do not spawn unless the user accepts.

   **Lookup-path output shape (formatted by this skill, not by the analyst):**
   - **Headline (1 sentence):** match count, time window if present, and any free split (e.g. "12 of 47 failed"). State "Showing N of TOTAL" when N < TOTAL, or "Showing N of at least TOTAL" when the count is capped by the warehouse.
   - **Body:**
     - Multi-row: compact markdown table — one row per sample row, with columns taken from the sample's own headers (an id, status, cost, latency, intent or timestamp when the sample has them).
     - Single-row (total = 1): brief conversational prose summary of the key fields from that row, taken from its own columns (cost, latency, tokens, error info or status when the row has them). No table needed. Don't just list fields — explain what they mean for this entity.
   - Do not invent fields beyond what the MCP sample provides; ellipsified values stay ellipsified in the rendered table.
   - **Trailing analyst offer (one line):** tailor to entity type and visible signals — e.g. "Want me to run the analyst for failure clusters / latency tail / cost outliers across all 47? — say yes to dig in."
   - Then proceed to the standard next-step suggestions in step 5.

   **Kubit-analyst spawn procedure** (analytical intent, export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then read the rows with `get_report(reportId=<id>, rows=…, wsctx)` instead (see **Rules**). The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question
      - **Export URL:** The export URL from the MCP response text
      - **Workspace context key:** `$WSCTX_KEY` (from step 2 — tells the analyst where to cache)
      - **Source:** `inspect` (recorded in the dataset manifest)
      - **Context:** Any relevant column descriptions or filter criteria from the MCP response
   3. Relay the analyst's findings as returned: headline + compact table + brief notable findings. Don't expand into prose.

   **Cached-dataset spawn** (for step 2 follow-ups that reuse `$CACHE_DIR/current.csv`):
   1. Check prerequisites via Bash the same way as above (`command -v uv`, `python3 --version`). If neither is available, read the rows of that report with `get_report(reportId=<id>, rows=…, wsctx)` when its id is in this conversation; otherwise tell the user so and stop.
   2. Spawn `kubit-analyst` with:
      - **Question:** The user's follow-up question
      - **Dataset path:** `$CACHE_DIR/current.csv` (already wsctx-scoped)
      - **Context:** The original question and column list from `$CACHE_DIR/current.json`, so the analyst knows what the dataset represents
   3. Relay the analyst's findings the same way as above (headline + table + notable findings).

5. **Offer next steps based on entity type.**
   - User → "Want to see sessions or traces for [user email/id]?"
   - Session → "Want to see the traces in session [session id]?"
   - Trace → "Want to see events for trace [trace id]?"
   - Multiple traces → suggest /kubit-report if the user wants to see the trend over time.
   - Errors / failures among the returned traces → After the entity-specific offer, add a one-line suggestion: "If you want to find the code change behind these failures, try /kubit-blame." Do not run it yourself.

## MCP authentication

{{KUBIT_MCP_AUTH}}

## Rules
{{KUBIT_LUMOS_CONTEXT}}
- For more rows than the sample, or when neither uv nor Python is installed: `get_report(reportId=<id>, rows={offset: 0, limit: 50}, wsctx)` reads the report's rows a page at a time (limit up to 100; only with `reportId`). An Activity report is paged, not filtered: for a slice, build it again with the filter in its definition.
- Route by intent, not row count: analytical asks auto-spawn the analyst; lookup asks render the inline sample directly and offer the analyst as a trailing next step.
- Do not auto-spawn the analyst on lookup-style queries (single- or multi-row). Offer it; let the user decide.
- For multi-row lookup output, render the compact table from the MCP's inline sample. For multi-row analytical output, lead with the analyst's compact table.
- For single-row and navigation output, use conversational prose with inline numbers, not tables.
- Always show the match count alongside displayed results ("Showing N of TOTAL" when N < TOTAL; "of at least TOTAL" when it is capped by the warehouse — never quote a capped count as a total).
- Trust the MCP's row selection and ellipsification — don't truncate, pad, or expand sample values client-side.
- The MCP is stateless — every call must include all necessary identifiers. When the user follows up on a previous result, take the relevant entity id from the prior response and put it in the new definition's filter.
- When inspected traces contain failures, errors, or unexpected behavior, suggest `/kubit-blame` as a next step — but never invoke it automatically.

## Error Handling

- No results (MCP returns zero rows) → Tell the user nothing matched and suggest broadening the time range or checking filter values. Use your own wording.
- Execution failure (MCP returns isError: true) → Surface the failure message from the MCP. Don't invent details about what went wrong.
- No export URL (MCP succeeded but response has no CSV link) → If the user asked for analytical work, tell them this query type doesn't support CSV export. Present the inline sample directly instead.
- MCP unreachable (not an auth error) → Tell the user the connection to the MCP failed and suggest checking their network. An auth error, or Kubit tools that are not available, goes to **MCP authentication**.
- Kubit's result offers choices → relay them to the user rather than guessing.

## Examples

**Inspect a user (lookup, single-row):**
Input: /kubit-inspect user alex@acme.com
Output: Conversational prose summary built from the sample row's own columns. Trailing
        analyst offer, then offer to drill into sessions or traces.

**Navigate from user into sessions (lookup, multi-row):**
Input: show me sessions for alex@acme.com
Output: One-line headline (count, time window, failure split, "Showing 5 of N"), compact
        table of the sample sessions with the sample's own columns, trailing analyst
        offer, then drill-into-traces suggestion.

**Failed traces with filters (lookup, multi-row):**
Input: /kubit-inspect failed traces with intent Checkout since yesterday
Output: Headline with the count and time window, compact table of the sample rows with
        the sample's own columns. Trailing offer to run the analyst
        for failure clusters; then drill-into-trace suggestion and /kubit-blame hint.

**Analytical query (auto-spawn analyst):**
Input: /kubit-inspect p95 latency for failed traces today
Output: Skill auto-spawns kubit-analyst on the export URL and relays its findings —
        headline + table + notable bullets. No "want me to analyze?" prompt; the user
        asked for analysis explicitly.

**Drill into a report segment:**
Input: inspect the users who dropped off at payment in that funnel
Output: User summary with cost and error signals for the dropped-off segment.
        Offer to inspect sessions or traces for [user email/id].

**Zero results:**
Input: /kubit-inspect traces with intent "ResetPassword" in the last hour
Output: No matching results. Suggest broadening time range or checking the intent name.
