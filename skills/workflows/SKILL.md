---
name: workflows
description: "Chain Kubit skills together into automated, repeatable pipelines. Use for: workflow, pipeline, automate, chain, schedule, every day, recurring, run X then Y, build me a flow, daily report, alert when."
---

# /kubit:workflows

## Overview

This skill composes other `/kubit:*` skills into multi-step workflows — for example, "every morning, run `/kubit:report` for failed traces, then `/kubit:inspect` the top three errors, then drop them into the `regressions` dataset." It is the orchestration layer on top of the individual skills. The active workspace and organization are managed by `/kubit:init`.

> **Status:** early scaffold. The MCP-side `kubit_workflows` tool is not yet wired up. Until it ships, this skill should help the user *describe* the workflow they want, then execute it interactively step by step using the existing skills.

## When to Use

- The user wants to run several `/kubit:*` skills in sequence and reuse the result
- The user describes a recurring task ("every day", "every release", "whenever X happens")
- The user wants to save a multi-step investigation as a named pipeline they can re-run
- The user wants to chain investigation → dataset capture → report generation in one go

## Inputs

- `query` (required) — natural language description of the workflow. Can be a one-shot composition ("inspect the failed checkout traces from today, then add them to the checkout-regressions dataset") or a definition of a named pipeline ("save this as 'morning triage'").

## Workflow

1. **Confirm workspace context.** Call `kubit_init` and confirm the current org/workspace. If the user wants to switch, redirect to `/kubit:init`.
2. **Decompose the request.** Identify which `/kubit:*` skills the workflow needs and in what order. Echo the plan back to the user before executing — workflows can be expensive, so confirm the steps first.
3. **Execute step by step.** Run each skill in sequence. Pass results from one step into the next (e.g. trace IDs from `/kubit:inspect` into `/kubit:dataset`). Surface intermediate results so the user can intervene if a step goes wrong.
4. **Offer to save.** If the workflow looks reusable, offer to save it as a named pipeline once the `kubit_workflows` MCP tool is available.
5. **Present the final result** with a summary of what each step produced, plus links to any reports, datasets, or trace inspections created along the way.

## Rules

- Always confirm the decomposed step list with the user before executing — do not silently fan out into expensive operations.
- Never invent a step that requires a `/kubit:*` skill that does not exist.
- Stop on the first failing step and report it; do not continue blindly.
- If a step is destructive (e.g. dataset writes), require explicit confirmation per step, not just for the workflow as a whole.

## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- A required skill does not exist or is not yet implemented → Stop, tell the user which skill is missing, and offer the closest available alternative.
- MCP tool not yet available → Tell the user this skill is in early scaffold and offer to walk through the workflow manually using the individual `/kubit:*` skills.
- MCP failure → "Could not connect to the kubit MCP server. Check your network."

## Gotchas

_To be added as we test._
