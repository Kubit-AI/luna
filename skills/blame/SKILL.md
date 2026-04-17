---
name: blame
description: Use this skill when the user wants to know which agent, skill, or prompt caused errors, escalations, or sentiment drift.
---

# /kubit-blame

## Overview

This skill traces errors, bad intent classifications, sentiment drift, escalations,
and other LLM ops issues back to the agents, skills, or prompts responsible. It
answers: what went wrong, and whose fault is it? The MCP can accept explicit agent
names or infer responsible agents from recent tracing activity. Workspace and
organization are managed by /kubit-connect.

## When to Use

- The user wants to know which agent, skill, or prompt caused errors or degraded performance
- The user wants to attribute escalations, bad intent, or sentiment drift to a source
- The user provides a metric and threshold (e.g. "escalation_count > 1","sentiment drift < 0.3")
- The user asks "what changed", "who caused this", "why are errors up", or "which prompt is responsible"
- Do NOT use for raw record lookup — use /kubit-inspect for that

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit-connect — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `blame` as `{ "query": "...", "limit": 5 }`. Do not pre-parse, resolve, or reshape parameters — the MCP handles agent resolution, metric lookup, threshold evaluation, and time range inference. Only include `limit` when the user expects a ranked list.
3. **Present attribution results.** Return results as a structured list showing which agents, skills, or prompts are responsible, along with the relevant metrics. Present the data in whatever shape the MCP returns — do not reformat. If agents were inferred (not named by the user), state that before the list. You may add a 1–2 line contextual note after the results if it adds value. If the MCP returns suggestions or clarification questions, relay them verbatim. If 0 results match, say so and suggest broadening the query or checking the metric/agent names.
4. **Offer next steps.** Ask if the user wants to drill into specific records with `/kubit-inspect`, build a report to track the metric over time with `/kubit-report`, or refine the blame query with different thresholds or time ranges.

## Error Handling

- User wants to switch org/workspace → "Run /kubit-connect to switch."
- No agents match the threshold → "No agents breached that threshold. Try lowering the threshold or expanding the time range."
- Unrecognized metric or agent name → Relay the MCP's clarification question verbatim and let the user correct.
- MCP failure → "Could not connect to the kubit MCP server. Check your network."

## Examples

**Named agent with threshold:**
Input: /kubit-blame CheckOut escalation_count > 1
Output: Attribution results for CheckOut — agents ranked by escalation count,
        those breaching threshold highlighted. Total count shown.

**Metric threshold only — MCP infers agents:**
Input: /kubit-blame sentiment drift < 0.3
Output: MCP infers responsible agents from recent activity. State that agents
        were inferred before showing results. Attribution data returned as-is.

**Root cause investigation:**
Input: why are checkout errors up this week?
Output: Attribution results — agents, skills, or prompts linked to the error
        spike. Contextual note on what changed. Offer to inspect records or
        report the trend.

**Prompt-level attribution:**
Input: which prompt is causing the worst intent accuracy?
Output: Prompts ranked by intent accuracy degradation. Offer to drill into
        affected traces with /kubit-inspect.

**Zero results:**
Input: /kubit-blame escalation_count > 100 last 24 hours
Output: "No agents had escalation_count > 100 in the last 24 hours.
        Try lowering the threshold or expanding the time range."
        
## Gotchas

_To be added as we test._
