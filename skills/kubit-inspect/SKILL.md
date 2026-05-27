---
name: kubit-inspect
description: Use this skill when the user wants to find or drill into raw Kubit data — traces, sessions, users, or events.
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

## Workflow

1. **Confirm workspace context.** Call the `init` MCP tool to load the current org/workspace and obtain a WSCTX (workspace context) token if one isn't already available in this conversation. `init` is the only MCP tool that returns workspace context and a wsctx token — do not substitute any other tool (e.g. `help`) for this step. If the user wants to switch org/workspace, redirect to /kubit-connect — workspace and organization selection is owned by that skill. On an auth/unauthenticated error from `init`, do not improvise — follow **MCP authentication** below.
2. **Check for a cached dataset (wsctx-scoped).** Compute the cache key from the current MCP WSCTX token so concurrent conversations don't collide:

   ```bash
   WSCTX_KEY=$(printf %s "$WSCTX" | shasum -a 256 | cut -c1-12)
   CACHE_DIR="/tmp/kubit-dataset/$WSCTX_KEY"
   ```

   If `$CACHE_DIR/current.json` exists, read it. If the user's message is a follow-up analysis or narrowing question about that same dataset (e.g. references "those", "the ones", "that set", or asks for a different cut of the data just shown), **skip the MCP call** and spawn `kubit-analyst` with `Dataset path: $CACHE_DIR/current.csv` plus the cached manifest's question and columns as Context. Otherwise proceed to the MCP call below — it will replace this workspace's cached dataset. When unsure whether the question is a follow-up, prefer a fresh fetch.
3. **Pass the query through.** Send the user's wording directly to `inspect`. Do not pre-parse, resolve, or reshape parameters — the MCP handles entity type, filters, schema, and date range. If the user references a prior report or pastes a report URL, include that context in the query string. If the MCP asks which entity type to query (users, sessions, traces, events), present the options to the user rather than guessing.
4. **Route the response.** For data-fetching queries the MCP returns a `## Created Analysis` metadata block (id, display, reportUrl, status), an `exportUrl` pointing to the full dataset CSV, an inline **sample of up to 5 rows** (long values ellipsified at 97 chars), and the **total matching row count**. Use the sample + total to summarize directly without spawning the analyst, unless the user's intent is analytical. Special cases (entity-type clarification, zero results, MCP errors) return short text instead of the metadata block.

   **Top-level decision rule:**
   - **MCP returned an exportUrl** → route by intent (see below). Apply the same rule to single- and multi-row results.
   - **Entity-type clarification** (MCP asks which type to query) → Relay options to user directly.
   - **Zero results** (text response, no exportUrl) → Surface the message and suggest broadening filters or time range.
   - **MCP error** (`isError: true`) → Surface the failure as-is. Do not fabricate data.

   **Intent routing (exportUrl path):**

   Classify the user's query as **analytical** if it contains aggregation/statistical asks (`p50`, `p95`, `p99`, percentile, distribution, average, mean, median, total, sum, count by, rate, ratio), ranking (`top N`, `bottom N`, worst, best, highest, lowest, most, least), or pattern/causal asks (`why`, pattern, cluster, outlier, correlate, trend, over time, compared to, breakdown by, group by). Otherwise treat as **lookup** ("show me failed traces", "find sessions for alex", "list traces with intent Checkout"). When ambiguous, prefer lookup — the user can always accept the trailing offer.

   - **Analytical intent → auto-spawn `kubit-analyst`** on the export URL (see procedure below). Relay the analyst's headline + table + notable findings as-is, then add the standard next-step suggestions. Do not ask first.
   - **Lookup intent → render directly from the inline sample**, then offer the analyst as the trailing next step. Do not spawn unless the user accepts.

   **Lookup-path output shape (formatted by this skill, not by the analyst):**
   - **Headline (1 sentence):** total match count, time window if present, and any free split (e.g. "12 of 47 failed"). Always state "Showing N of TOTAL" when N < TOTAL.
   - **Body:**
     - Multi-row: compact markdown table — one row per sample row. Columns chosen by entity type:
       - Traces: short id, status, cost, latency, intent, timestamp
       - Sessions: short id, status, cost, latency, trace count, timestamp
       - Users: short id / email, total cost, total traces, top intent, last seen
       - Events: short id, type, status, timestamp
     - Single-row (total = 1): brief conversational prose summary of the key fields from that row — cost, latency, tokens, error info, status, plus one entity-specific column. No table needed. Don't just list fields — explain what they mean for this entity.
   - Do not invent fields beyond what the MCP sample provides; ellipsified values stay ellipsified in the rendered table.
   - **Trailing analyst offer (one line):** tailor to entity type and visible signals — e.g. "Want me to run the analyst for failure clusters / latency tail / cost outliers across all 47? — say yes to dig in."
   - Then proceed to the standard next-step suggestions in step 5.

   **Kubit-analyst spawn procedure** (analytical intent, export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then fall back to the lookup-path output (render the inline sample directly). The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question
      - **Export URL:** The export URL from the MCP response text
      - **Workspace context key:** `$WSCTX_KEY` (from step 2 — tells the analyst where to cache)
      - **Source:** `inspect` (recorded in the dataset manifest)
      - **Context:** Any relevant column descriptions or filter criteria from the MCP response
   3. Relay the analyst's findings as returned: headline + compact table + brief notable findings. Don't expand into prose.

   **Cached-dataset spawn** (for step 2 follow-ups that reuse `$CACHE_DIR/current.csv`):
   1. Check prerequisites via Bash the same way as above (`command -v uv`, `python3 --version`). If neither is available, tell the user so and stop — there's no MCP fallback on this path since we're deliberately skipping the MCP.
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
- Route by intent, not row count: analytical asks auto-spawn the analyst; lookup asks render the inline sample directly and offer the analyst as a trailing next step.
- Do not auto-spawn the analyst on lookup-style queries (single- or multi-row). Offer it; let the user decide.
- For multi-row lookup output, render the compact table from the MCP's inline sample. For multi-row analytical output, lead with the analyst's compact table.
- For single-row and navigation output, use conversational prose with inline numbers, not tables.
- Always show total match count alongside displayed results ("Showing N of TOTAL" when N < TOTAL).
- Trust the MCP's row selection and ellipsification — don't truncate, pad, or expand sample values client-side.
- The MCP is stateless — every call must include all necessary identifiers. When the user follows up on a previous result, extract the relevant entity id from the prior response and include it explicitly in the new query.
- When inspected traces contain failures, errors, or unexpected behavior, suggest `/kubit-blame` as a next step — but never invoke it automatically.

## Error Handling

- No results (MCP returns zero rows) → Tell the user nothing matched and suggest broadening the time range or checking filter values. Use your own wording.
- Execution failure (MCP returns isError: true) → Surface the failure message from the MCP. Don't invent details about what went wrong.
- No export URL (MCP succeeded but response has no CSV link) → If the user asked for analytical work, tell them this query type doesn't support CSV export. Present the inline sample directly instead.
- MCP unreachable → Tell the user the connection to the MCP failed and suggest checking their network.
- Entity type ambiguous (MCP asks for clarification) → Present the options (users, sessions, traces, events) to the user. Don't guess.

## Examples

**Inspect a user (lookup, single-row):**
Input: /kubit-inspect user alex@acme.com
Output: Conversational prose summary built from the inline sample row — cost, latency, tokens,
        top errors, session count, top intent. Trailing analyst offer, then offer to drill
        into sessions or traces.

**Navigate from user into sessions (lookup, multi-row):**
Input: show me sessions for alex@acme.com
Output: One-line headline (count, time window, failure split, "Showing 5 of N"), compact
        table of the sample sessions (id, status, cost, latency, timestamp), trailing analyst
        offer, then drill-into-traces suggestion.

**Failed traces with filters (lookup, multi-row):**
Input: /kubit-inspect failed traces with intent Checkout since yesterday
Output: Headline with total count and time window, compact table of the sample traces
        (id, status, cost, latency, intent, timestamp). Trailing offer to run the analyst
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
