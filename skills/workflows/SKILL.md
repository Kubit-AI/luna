---
name: workflows
description: Use this skill to chain multiple Kubit skills together into multi-step workflows. Use for: workflow, pipeline, automate, chain, triage, morning report, regression capture, blame pipeline, inspect then save, error spike workflow, run X then Y, first do X then do Y, find and add, inspect and blame. Use this skill whenever the user wants to combine two or more /kubit:* skills in sequence — even if they don't use the word "workflow." Do NOT use this skill for single-skill operations — use the individual skill directly (e.g. /kubit:inspect, /kubit:report, /kubit:blame, /kubit:dataset).
user_invocable: true
---

# /kubit:workflows

## Overview

This skill composes other `/kubit:*` skills into multi-step workflows. It is the orchestration layer — it does not access data directly, but coordinates `/kubit:inspect`, `/kubit:report`, `/kubit:blame`, and `/kubit:dataset` in sequence, passing results from one step to the next. The active workspace and organization are managed by `/kubit:init`.

Use this skill when a request involves two or more `/kubit:*` skills in sequence. Single-skill requests should go directly to that skill.

> **Scaffold mode:** The `kubit_workflows` MCP tool is not yet available. Until it ships, decompose the workflow into individual skill calls and execute them interactively step by step. Do not offer to save or schedule workflows.

## When to Use

- The user wants to run several `/kubit:*` skills in sequence and pass results between them
- The user describes a multi-step investigation (e.g. "find the failed traces, blame the responsible agents, then save the traces to a dataset")
- The user describes a triage or debugging pipeline across skills
- Do NOT use for single-skill requests — route directly to that skill
- Do NOT use for steps requiring external tools (Jira, Slack, CI/CD) that are not yet available — acknowledge the limitation and execute the Kubit-native steps only

## Inputs

- `query` (required) — natural language description of the workflow. Should involve two or more `/kubit:*` skills.

Results from each step are controlled by the limits of the underlying skills (default 5 per skill), not by a workflow-level limit.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to `/kubit:init` — workspace and organization selection is owned by that skill.
2. **Decompose the request.** Identify which `/kubit:*` skills the workflow needs and in what order. Map how results flow between steps (e.g. trace ids from `/kubit:inspect` become inputs to `/kubit:dataset`). Echo the plan back to the user before executing.
3. **Execute step by step.** Run each skill in sequence using the existing individual skills. Pass results from one step into the next. Surface intermediate results after each step so the user can intervene, adjust, or stop if something goes wrong. If any step is destructive (e.g. removing traces via `/kubit:dataset`), confirm that step individually — do not rely on the initial workflow confirmation alone.
4. **Present the final summary.** After all steps complete, summarize what each step produced with references to the artifacts created (report ids, trace ids, dataset names, blame results).

Example output format:

    Workflow complete: <workflow description>

    Step 1 — /kubit:report: <summary>
    Step 2 — /kubit:inspect: <summary> (<n> traces returned)
    Step 3 — /kubit:blame: <summary> (top agent: <agent_name>)

    <optional 1–2 line contextual note>

## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- A step fails → Stop execution, report which step failed and why. Offer to retry that step or skip it.
- A step references a skill that does not exist → Stop, tell the user which skill is missing. Do not invent capabilities.
- Request involves external tools (Jira, Slack, CI/CD) → Acknowledge those steps are not yet available. Execute the Kubit-native steps only and note what would need to be added.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Triage pipeline (report → inspect → blame):**
Input: Run the failed traces report for today, inspect the top 5 errors, then blame the responsible agents
Steps:
1. `/kubit:report` — `{ "query": "failed traces report for today" }`
2. `/kubit:inspect` — `{ "query": "top 5 errors from report <report_id>", "limit": 5 }`
3. `/kubit:blame` — `{ "query": "blame agents for traces <trace_ids>" }`

**Dataset curation (inspect → dataset):**
Input: Find all failed checkout traces from yesterday and add them to the checkout-regressions dataset
Steps:
1. `/kubit:inspect` — `{ "query": "failed checkout traces from yesterday", "limit": 5 }`
2. `/kubit:dataset` — `{ "query": "add traces <trace_ids> to checkout-regressions dataset" }`

**Regression capture (blame → inspect → dataset):**
Input: Blame the prompt regression on onboarding, inspect the affected traces, and save them as a test suite
Steps:
1. `/kubit:blame` — `{ "query": "prompt regression on onboarding" }`
2. `/kubit:inspect` — `{ "query": "traces affected by <prompt_name>", "limit": 5 }`
3. `/kubit:dataset` — `{ "query": "add traces <trace_ids> to onboarding regression test suite" }`

**Report-to-blame (report → blame → inspect):**
Input: The token cost grid is showing a spike — find out which agents are responsible and show me the expensive traces
Steps:
1. `/kubit:report` — `{ "query": "token cost grid" }`
2. `/kubit:blame` — `{ "query": "agents responsible for token cost spike" }`
3. `/kubit:inspect` — `{ "query": "traces from <agent_name> with high token cost", "limit": 5 }`

## Gotchas

_To be added as we test._