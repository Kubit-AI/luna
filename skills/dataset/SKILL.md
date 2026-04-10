---
name: dataset
description: Use this skill to manage Kubit golden datasets and test suites. Use for: golden dataset, golden data, test suite, add trace, update trace, remove trace, list traces, curate, ground truth, evaluation set, benchmark data, save trace, tag trace, manage dataset. Use this skill whenever the user wants to add, update, remove, or list traces in a golden dataset or test suite — even if they don't use the word "dataset." Do NOT use this skill for inspecting or searching raw trace data — use /kubit:inspect instead. Do NOT use this skill for creating or finding reports — use /kubit:report instead.
---

# /kubit:dataset

## Overview

This skill manages golden datasets and test suites in Kubit. Golden datasets are curated sets of known-good traces used as ground truth for testing and evaluation. Test suites are tagged subsets within a golden dataset. The active workspace and organization are managed by `/kubit:init`. To find traces to add, use `/kubit:inspect` first.

## When to Use

- The user wants to add a trace to a golden dataset or test suite
- The user wants to update an existing trace in a dataset (e.g. change expected output, update tags)
- The user wants to remove a trace from a dataset
- The user wants to list or view what's currently in a golden dataset or test suite
- The user references a trace from a prior `/kubit:inspect` result and wants to save it to a dataset

## Inputs

- `query` (required) — natural language description of the dataset operation. Can include trace ids, dataset names, test suite names, or a reference to a trace from prior conversation.
- `limit` (optional) — maximum number of results when listing dataset contents. Defaults to 5.

## Workflow

1. 1. **Confirm workspace context.** Verify the current org/workspace is set. If no context exists or the user wants to switch, redirect to /kubit:init — workspace and organization selection is owned by that skill.
2. **Pass the query through.** Send the user's wording directly to `kubit_dataset` as `{ "query": "...", "limit": 5 }`. Do not pre-parse, resolve, or reshape parameters — the MCP handles dataset lookup, trace resolution, and operation type (add, update, remove, list). If the user references a trace from a prior `/kubit:inspect` result or pastes a trace id, include that context in the query string. Only include `limit` when the operation is a list.
3. **Confirm destructive operations.** Before removing a trace from a dataset, confirm with the user. Adding and updating do not require confirmation unless the user's intent is ambiguous.
4. **Present results.**
   - **Add/update/remove:** Confirm the action was completed. Show the trace id, dataset name, and what changed. You may add a 1–2 line contextual note if it adds value (e.g., "Trace 400377 added to the Checkout golden dataset. Dataset now has 142 traces.").
   - **List:** Return a structured list of traces in the dataset, one per result, with the total count. Show trace id, status, and any tags.
   - If the MCP returns suggestions or clarification questions, relay them verbatim. If 0 results on a list, say so.
5. **Offer next steps.** Ask if the user wants to add more traces, inspect a trace with `/kubit:inspect`, or run a blame analysis with `/kubit:blame` against the dataset.

Example output format:

    <action> confirmed:
    Trace: <trace_id>
    Dataset: <dataset_name>
    Test suite: <suite_name> (if applicable)

    <optional 1–2 line contextual note>

## Error Handling

- User wants to switch org/workspace → "Run /kubit:init to switch."
- Trace id not found → "Trace not found. Check the id or use /kubit:inspect to find the right trace."
- Dataset not found → "No dataset matched that name. Check the name or list available datasets."
- Ambiguous operation → Relay the MCP's clarification question verbatim and let the user clarify.
- MCP failure → "Could not connect to the kubit MCP server. Check your network."

## Examples

**Add a trace by id:**
Input: /kubit:dataset add trace 400377 to the Checkout golden dataset
MCP: `{ "query": "add trace 400377 to the Checkout golden dataset" }`

**Add a trace from a prior inspect result:**
Input: add that last trace we looked at to the regression test suite
MCP: `{ "query": "add trace 400377 to the regression test suite" }`

**Update a trace in a dataset:**
Input: /kubit:dataset update trace 400377 expected output to "order confirmed"
MCP: `{ "query": "update trace 400377 expected output to order confirmed" }`

**Remove a trace:**
Input: /kubit:dataset remove trace 400377 from the Checkout golden dataset
MCP: `{ "query": "remove trace 400377 from the Checkout golden dataset" }`
Behavior: Confirm with user before removing.

**List traces in a dataset:**
Input: /kubit:dataset list traces in the Checkout golden dataset
MCP: `{ "query": "list traces in the Checkout golden dataset", "limit": 5 }`

**Zero results on list:**
Input: /kubit:dataset list traces in the Onboarding test suite
MCP: `{ "query": "list traces in the Onboarding test suite", "limit": 5 }`
Behavior: No traces found. Respond: "The Onboarding test suite is empty. Use /kubit:inspect to find traces to add."

## Gotchas

_To be added as we test._
