---
name: workflows
description: Use this skill to chain multiple Kubit skills together into multi-step workflows. 
user_invocable: true
---

# /kubit:workflows

## Overview

This skill composes other `/kubit:*` skills into multi-step workflows. It is the orchestration layer — it does not access data directly, but coordinates `/kubit:inspect`, `/kubit:report`, `/kubit:blame`, and `/kubit:dataset` in sequence, passing results from one step to the next. The active workspace and organization are managed by `/kubit:init`.

> **Scaffold mode:** The `workflows` MCP tool is not yet available. Until it ships, decompose the workflow into individual skill calls and execute them interactively step by step. Do not offer to save or schedule workflows.

## When to Use

- The user wants to run two or more /kubit:* skills in sequence
- The user describes a multi-step investigation or triage pipeline
- Do NOT use for single-skill requests — route directly to that skill
- Do NOT use for steps requiring external tools (Jira, Slack, CI/CD) — acknowledge the limitation and execute the Kubit-native steps only


Results from each step are controlled by the limits of the underlying skills (default 5 per skill), not by a workflow-level limit.

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to `/kubit:init` — workspace and organization selection is owned by that skill.
2. **Decompose the request.** Identify which `/kubit:*` skills the workflow needs and in what order. Map how results flow between steps (e.g. trace ids from `/kubit:inspect` become inputs to `/kubit:dataset`). Echo the plan back to the user before executing.

   The kubit-analyst sub-agent is the default analysis path for any multi-result query that returns an export URL. It is spawned by the skill executing that step — the workflow skill does not spawn it directly. When a workflow step involves `/kubit:inspect` or `/kubit:report` with multi-result data, expect those skills to route through kubit-analyst automatically for full-dataset analysis.

3. **Execute step by step.** Run each skill in sequence using the existing individual skills. Pass results from one step into the next. Surface intermediate results after each step so the user can intervene, adjust, or stop if something goes wrong. If any step is destructive (e.g. removing traces via `/kubit:dataset`), confirm that step individually — do not rely on the initial workflow confirmation alone.
4. **Present the final summary.** After all steps complete, summarize what each step produced with references to the artifacts created (report ids, trace ids, dataset names, blame results).

3. **Execute step by step.** Run each skill in sequence. Pass results from one
   step into the next. Surface intermediate results after each step so the user
   can intervene, adjust, or stop. Confirm any destructive steps individually —
   do not rely on the initial workflow confirmation alone.

4. **Present the final summary.** Summarize what each step produced with
   references to artifacts created — report ids, trace ids, dataset names,
   blame results.

## Rules

- Always confirm the plan with the user before executing
- Confirm destructive steps individually even if the workflow was already approved
- Surface intermediate results after each step — never execute the full chain silently
- If a step fails, stop and report why. Offer to retry or skip that step.
- Never invent capabilities — if a step references a skill that does not exist,
  stop and tell the user


## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- A step fails → Stop execution, report which step failed and why. Offer to retry that step or skip it.
- A step references a skill that does not exist → Stop, tell the user which skill is missing. Do not invent capabilities.
- Request involves external tools (Jira, Slack, CI/CD) → Acknowledge those steps are not yet available. Execute the Kubit-native steps only and note what would need to be added.
- MCP failure → "Could not connect to agent.kubit.ai/mcp. Check your network."

## Examples

**Triage pipeline (report → inspect → blame):**
Input: Run the failed traces report for today, inspect the top errors, then blame the responsible agents
Steps:
1. /kubit:report — failed traces report for today
2. /kubit:inspect — top errors from the report result
3. /kubit:blame — agents responsible for those traces
Output: Step summaries returned after each. Final summary with report id, trace
        count, and top blamed agent.

**Dataset curation (inspect → dataset):**
Input: Find all failed checkout traces from yesterday and add them to the checkout-regressions dataset
Steps:
1. /kubit:inspect — failed checkout traces from yesterday
2. /kubit:dataset — add returned trace ids to checkout-regressions dataset
Output: Inspect summary with trace count. Dataset confirmation with updated count.

**Regression capture (blame → inspect → dataset):**
Input: Blame the prompt regression on onboarding, inspect the affected traces, and save them as a test suite
Steps:
1. /kubit:blame — prompt regression on onboarding
2. /kubit:inspect — traces affected by the blamed prompt
3. /kubit:dataset — add trace ids to onboarding regression test suite
Output: Blame results with responsible prompt. Trace list. Dataset confirmation.

**Report-to-blame (report → blame → inspect):**
Input: The token cost grid is showing a spike — find which agents are responsible and show me the expensive traces
Steps:
1. /kubit:report — token cost grid
2. /kubit:blame — agents responsible for the cost spike
3. /kubit:inspect — traces from the blamed agent with high token cost
Output: Report data with cost spike visible. Blame result

## Gotchas

_To be added as we test._