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

1. **Confirm workspace context.** Call the `init` MCP tool to load the current org/workspace and obtain a SESSION token if one isn't already available in this session. `init` is the only MCP tool that returns workspace context and a session token — do not substitute any other tool (e.g. `help`) for this step. If the user wants to switch org/workspace, redirect to /kubit-connect — workspace and organization selection is owned by that skill.
2. **Check for a cached dataset (session-scoped).** Compute the cache key from the current MCP SESSION token so concurrent sessions don't collide:

   ```bash
   SESSION_KEY=$(printf %s "$SESSION" | shasum -a 256 | cut -c1-12)
   CACHE_DIR="/tmp/kubit-dataset/$SESSION_KEY"
   ```

   If `$CACHE_DIR/current.json` exists, read it. If the user's message is a follow-up analysis or narrowing question about that same dataset (e.g. references "those", "the ones", "that set", or asks for a different cut of the data just shown), **skip the MCP call** and spawn `kubit-analyst` with `Dataset path: $CACHE_DIR/current.csv` plus the cached manifest's question and columns as Context. Otherwise proceed to the MCP call below — it will replace this session's cached dataset. When unsure whether the question is a follow-up, prefer a fresh fetch.
3. **Pass the query through.** Send the user's wording directly to `inspect`. Do not pre-parse, resolve, or reshape parameters — the MCP handles entity type, filters, schema, and date range. If the user references a prior report or pastes a report URL, include that context in the query string. If the MCP asks which entity type to query (users, sessions, traces, events), present the options to the user rather than guessing.
4. **Route the response.** The MCP returns a text response containing a summary and selected rows. The MCP's summary is based on a limited sample (~100 traces) — when the full dataset is larger, route through the kubit-analyst for accurate analysis.

   **Decision rule:**
   - **Single entity** (lookup by id, one result) → Present MCP summary directly.
   - **Navigation** ("show me their sessions", "drill into this trace") → Present MCP summary directly.
   - **Entity-type clarification** (MCP asks which type to query) → Relay options to user directly.
   - **Multi-result + export URL** → Spawn kubit-analyst on the full dataset (see below).
   - **Multi-result + no export URL** → Present MCP summary. Add a note: "This summary is based on the MCP's limited sample — CSV export was not available for full-dataset analysis."

   **Direct presentation formatting** (for single entity, navigation, no export URL):
   - Lead with the key finding or answer sentence from the MCP.
   - Single entity: summarize the key fields conversationally. Include cost, latency, tokens, error info, and status. Don't just list fields — explain what they mean for this entity.
   - Multiple entities: summarize the pattern first (what's broken, expensive, or slow), then list individual results as a compact numbered list with one line per entity showing id, status, cost, latency, and timestamp.
   - Always state the total match count vs. displayed count (e.g. "Showing 5 of 47").

   **Kubit-analyst spawn procedure** (for multi-result + export URL):
   1. Check prerequisites via Bash:
      - Run `command -v uv` and `python3 --version`. If neither `uv` nor `python3` is available, tell the user: "Full-dataset analysis requires uv or Python 3, which are not installed on this system." Then fall back to the MCP summary. The kubit-analyst sub-agent handles environment setup and pandas installation internally.
   2. Spawn the `kubit-analyst` sub-agent with a prompt containing:
      - **Question:** The user's original question
      - **Export URL:** The export URL from the MCP response text
      - **Session key:** `$SESSION_KEY` (from step 2 — tells the analyst where to cache)
      - **Source:** `inspect` (recorded in the dataset manifest)
      - **MCP summary:** The MCP's text response — the analyst uses this as context and starting point, flags discrepancies with full-dataset findings
      - **Context:** Any relevant column descriptions or filter criteria from the MCP response
   3. Present the kubit-analyst's findings conversationally. Use the same formatting rules as the direct presentation path — lead with key finding, contextualize numbers, use prose not tables.

   **Cached-dataset spawn** (for step 2 follow-ups that reuse `$CACHE_DIR/current.csv`):
   1. Check prerequisites via Bash the same way as above (`command -v uv`, `python3 --version`). If neither is available, tell the user so and stop — there's no MCP fallback on this path since we're deliberately skipping the MCP.
   2. Spawn `kubit-analyst` with:
      - **Question:** The user's follow-up question
      - **Dataset path:** `$CACHE_DIR/current.csv` (already session-scoped)
      - **Context:** The original question and column list from `$CACHE_DIR/current.json`, so the analyst knows what the dataset represents
   3. Present findings conversationally, same as above.

5. **Offer next steps based on entity type.**
   - User → "Want to see sessions or traces for [user email/id]?"
   - Session → "Want to see the traces in session [session id]?"
   - Trace → "Want to see events for trace [trace id]?"
   - Multiple traces → suggest /kubit-report if the user wants to see the trend over time.
   - Errors / failures among the returned traces → After the entity-specific offer, add a one-line suggestion: "If you want to find the code change behind these failures, try /kubit-blame." Do not run it yourself.

## Rules
- Summarize when returning multiple results - never list raw fields without context
- Always show total match count alongside displayed results
- Trust the MCP's row selection — don't truncate or pad results client-side.
- The MCP is stateless — every call must include all necessary identifiers. When the user follows up on a previous result, extract the relevant entity id from the prior response and include it explicitly in the new query.
- Do not restructure the MCP's stats into tables, bullet lists, or other rigid formats unless the user asks for a specific format. Use conversational prose with inline numbers.
- When inspected traces contain failures, errors, or unexpected behavior, suggest `/kubit-blame` as a next step — but never invoke it automatically.

## Error Handling

- No results (MCP returns zero rows) → Tell the user nothing matched and suggest broadening the time range or checking filter values. Use your own wording.
- Execution failure (MCP returns isError: true) → Surface the failure message from the MCP. Don't invent details about what went wrong.
- No export URL (MCP succeeded but response has no CSV link) → If the user asked for deep analysis, tell them this query type doesn't support CSV export. Present the MCP summary instead.
- MCP unreachable → Tell the user the connection to the MCP failed and suggest checking their network.
- Entity type ambiguous (MCP asks for clarification) → Present the options (users, sessions, traces, events) to the user. Don't guess.

## Examples

**Inspect a user:**
Input: /kubit-inspect user alex@acme.com
Output: User summary — cost, latency, tokens, top errors, session count, top intent.
        Offer to drill into sessions or traces.

**Navigate from user into sessions:**
Input: show me sessions for alex@acme.com
Output: Pattern summary — failure rate, avg cost, avg latency, common errors.

**Failed traces with filters:**
Input: /kubit-inspect failed traces with intent Checkout since yesterday
Output: Pattern summary — avg cost, avg latency, avg tokens, common error, common model.
        List with cost, latency, intent, and timestamp per trace. Total count shown.
        Offer to report the trend over time.

**Drill into a report segment:**
Input: inspect the users who dropped off at payment in that funnel
Output: User summary with cost and error signals for the dropped-off segment.
        Offer to inspect sessions or traces for [user email/id].

**Zero results:**
Input: /kubit-inspect traces with intent "ResetPassword" in the last hour
Output: No matching results. Suggest broadening time range or checking the intent name.
