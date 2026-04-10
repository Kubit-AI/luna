---
name: blame
description: Use this skill to attribute errors, bad intent classification, sentiment drift, escalations, or other LLM ops issues back to specific agents, skills, or prompts. Use for: blame, attribute, root cause, which agent, which skill, which prompt, who caused, escalation, error attribution, sentiment drift, bad intent, regression, what changed, agent comparison, prompt comparison. Use this skill whenever the user wants to know why something went wrong and which agent, skill, or prompt is responsible — even if they don't use the word "blame." Do NOT use this skill for inspecting raw records — use /kubit:inspect instead. Do NOT use this skill for creating or finding reports — use /kubit:report instead.
---

# /kubit:blame

## Overview

This skill traces errors, bad intent classifications, sentiment drift, escalations, and other LLM ops issues back to the agents, skills, or prompts responsible. It answers the question: "what went wrong, and whose fault is it?" The MCP can accept explicit agent names or infer the responsible agents from recent tracing activity. The active workspace and organization are managed by `/kubit:init`.

## When to Use

- The user wants to know which agent, skill, or prompt caused errors or degraded performance
- The user wants to attribute escalations, bad intent, or sentiment drift to a source
- The user provides a metric + threshold and wants to know which agents breach it (e.g. "escalation_count > 1", "sentiment drift < 0.3")
- The user asks "what changed", "who caused this", "why are errors up", or "which prompt is responsible"

## Inputs

- `query` (required) — natural language description of what to blame. Can include agent names, metric thresholds, time ranges, or a general description of the issue. If the user doesn't name specific agents, the MCP infers from recent tracing activity.
- `limit` (optional) — maximum number of agents/results to return. Defaults to 5.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit:init — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `kubit_blame` as `{ "query": "...", "limit": 5 }`. Do not pre-parse, resolve, or reshape parameters — the MCP handles agent resolution, metric lookup, threshold evaluation, and time range inference. Only include `limit` when the user expects a ranked list.
3. **Present attribution results.** Return results as a structured list showing which agents, skills, or prompts are responsible, along with the relevant metrics. Present the data in whatever shape the MCP returns — do not reformat. If agents were inferred (not named by the user), state that before the list. You may add a 1–2 line contextual note after the results if it adds value. If the MCP returns suggestions or clarification questions, relay them verbatim. If 0 results match, say so and suggest broadening the query or checking the metric/agent names.
4. **Offer next steps.** Ask if the user wants to drill into specific records with `/kubit:inspect`, build a report to track the metric over time with `/kubit:report`, or refine the blame query with different thresholds or time ranges.

Example output format:

    Blame results for: <query> (<time range>)

    [1] <Agent|Skill|Prompt>: <name>
        <metric>: <value>
        % of total: <pct>
        Top trigger: <trigger>

    Showing <n> of <total> that breached the threshold.
    <optional 1–2 line contextual note>

## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- No agents match the threshold → "No agents breached that threshold. Try lowering the threshold or expanding the time range."
- Unrecognized metric or agent name → Relay the MCP's clarification question verbatim and let the user correct.
- MCP failure → "Could not connect to the kubit MCP server. Check your network."

## Examples

**Blame with named agent + threshold:**
Input: /kubit:blame CheckOut escalation_count > 1
MCP: `{ "query": "CheckOut escalation_count > 1", "limit": 5 }`

**Blame with metric threshold (no agent named — MCP infers):**
Input: /kubit:blame sentiment drift < 0.3
MCP: `{ "query": "sentiment drift < 0.3", "limit": 5 }`

**Root cause investigation:**
Input: why are checkout errors up this week?
MCP: `{ "query": "why are checkout errors up this week", "limit": 5 }`

**Prompt-level attribution:**
Input: which prompt is causing the worst intent accuracy?
MCP: `{ "query": "which prompt is causing the worst intent accuracy", "limit": 5 }`

**Zero results:**
Input: /kubit:blame escalation_count > 100 last 24 hours
MCP: `{ "query": "escalation_count > 100 last 24 hours", "limit": 5 }`
Behavior: No agents breached the threshold. Respond: "No agents had escalation_count > 100 in the last 24 hours. Try lowering the threshold or expanding the time range."

## Gotchas

_To be added as we test._
