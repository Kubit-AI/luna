---
name: trace
description: Look up Kubit analytics traces by name or ID. Orchestrates kubit_init and kubit_trace MCP tool calls.
---

# /kubit:trace

Look up a Kubit trace using the MCP tools `kubit_init` and `kubit_trace`.

## When to use

Use when the user wants to look up analytics traces in Kubit — by trace name, trace ID, or both.

## Workflow

### Step 1: Show current organization and workspace

Always call the `kubit_init` MCP tool first. It returns the current organization and workspace, the full list of available orgs/workspaces, and the available trace names.

Display the current organization and workspace to the user, along with the list of all available options.

Ask the user to confirm the current selection or pick a different one, unless the choice is obvious.

### Step 2: Switch org/workspace (if requested)

If the user wants to use a different organization or workspace, call the `kubit_switch` MCP tool with the chosen `orgId` and `workspaceId`. Confirm the switch succeeded before continuing.

### Step 3: Call kubit_trace

Pass the user's request directly as a natural language query to the `kubit_trace` MCP tool:

```json
{ "query": "purchase events for trace 400377" }
```

The agent inside `kubit_trace` will extract the trace name and/or trace ID from the query automatically. You do not need to parse or resolve parameters yourself.

### Step 4: Present results

The tool returns:
- **Summary** — the agent's interpretation of the query, including any suggestions or clarification questions
- **Analysis CSV** (when a trace name is matched) — a time-series count of matching events over the last 7 days
- **Inspect CSV** (when a trace ID is extracted) — a table of fields associated with that specific trace ID

Summarize the results for the user:
- For analysis data, describe the trend (e.g. "There were 1,234 purchase events in the last 7 days, peaking on March 28th")
- For inspect data, highlight the key fields and values for the trace ID
- If both are returned, present the inspect data first (specific trace), then the broader trend
- If the agent returned suggestions or asked for clarification, relay that to the user
