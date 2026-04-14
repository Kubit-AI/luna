---
name: help
description: Use this skill when the user asks what Kubit can do, needs help, or is unsure which skill to use.
---
# /kubit:help

## Overview

This skill is the discovery index for the Kubit plugin. It lists all available
skills, explains what each one does, and routes users to the right one for their
task. No session required — works before /kubit:init is complete.

## Steps

1. If no specific skill is requested, display the full skill list below.
2. If a specific skill is requested, explain it in detail with examples.
3. If the user describes a task but is unsure which skill to use, identify
   the best match and suggest it with an example.

## Skills

### /kubit:init
Sets up your Kubit session. Handles org and workspace selection, switching,
and creating new workspaces. Required before any other skill — provides the
SESSION token everything else depends on.
    /kubit:init
    /kubit:init switch workspace staging
    /kubit:init create workspace "q2-experiments"
---
### /kubit:inspect
Retrieves raw data from Kubit — traces, sessions, users, and events. The go-to
skill for debugging failures, investigating unexpected behavior, or drilling into
a specific segment of data. Returns up to 5 results by default.
    /kubit:inspect failed traces with intent Checkout since yesterday
    /kubit:inspect sessions where token cost > $5 in the last 2 hours
    /kubit:inspect users who rephrased more than 2 times last week
---
### /kubit:report
Finds, opens, creates, and modifies Kubit analytics reports — Grids, Queries,
Funnels, Flows, and Retention reports. Use this for trends, aggregations, and
LLM performance analysis. Searches existing reports before creating new ones.
    /kubit:report daily failed traces
    /kubit:report build a funnel for prompt → intent → tool call → response
    /kubit:report add a filter for model=gpt-4 to report 10798
---
### /kubit:blame
Traces errors, escalations, sentiment drift, and bad intent classifications back
to the agents, skills, or prompts responsible. Answers the question: what went
wrong, and whose fault is it?
    /kubit:blame CheckOut escalation_count > 1
    /kubit:blame sentiment drift < 0.3 last 7 days
    /kubit:blame which prompt is causing the worst intent accuracy?
---
### /kubit:dataset
Manages golden datasets and test suites — curated sets of known-good traces used
as ground truth for evaluation and regression testing. Add, update, remove, or
list traces. Use /kubit:inspect first to find the right traces to save.
    /kubit:dataset add trace 400377 to the Checkout golden dataset
    /kubit:dataset list traces in the Checkout golden dataset
    /kubit:dataset remove trace 400377 from the regression test suite
---
### /kubit:workflows
Chains two or more Kubit skills together into a multi-step pipeline. Passes
results from one step to the next automatically. Use for triage pipelines,
regression capture flows, and any investigation that spans multiple skills.
    find failed checkout traces, blame the agents, then save them to the regression dataset
    run the token cost report, inspect the expensive sessions, then blame the responsible prompts

---

## Rules

- Never require a session — this skill must work before /kubit:init is complete
- Never invent skills that do not exist
- Keep the skill list accurate — update it whenever a new skill is added
- One example block per skill in the summary view; full detail on specific request

## Gotchas

- If a user asks about a capability not yet built, say so clearly
