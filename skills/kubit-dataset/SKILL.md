---
name: kubit-dataset
description: Use this skill when the user wants to add, update, remove, or list traces in a golden dataset or test suite.
---

# /kubit-dataset

## Overview

This skill manages golden datasets and test suites in Kubit. Golden datasets are curated sets of known-good traces used as ground truth for testing and evaluation. Test suites are tagged subsets within a golden dataset. The active workspace and organization are managed by `/kubit-connect`. To find traces to add, use `/kubit-inspect` first.

## When to Use

- The user wants to add a trace to a golden dataset or test suite
- The user wants to update an existing trace in a dataset (e.g. change expected output, update tags)
- The user wants to remove a trace from a dataset
- The user wants to list or view what's currently in a golden dataset or test suite
- The user references a trace from a prior `/kubit-inspect` result and wants to save it to a dataset
- Do NOT use for searching raw traces — use /kubit-inspect for that

## Workflow

1. **Confirm workspace context.** Verify the current org/workspace is set. If
   no context exists or the user wants to switch, redirect to /kubit-connect.

2. **Pass the query through.** Send the user's wording directly to `dataset`.
   Do not pre-parse or reshape — the MCP handles dataset lookup, trace resolution,
   and operation type (add, update, remove, list). If the user references a trace
   from a prior /kubit-inspect result, include that id in the query. 

3. **Confirm before removing.** Before removing a trace from a dataset, confirm
   with the user. Adding and updating do not require confirmation unless intent
   is ambiguous.

4. **Present results.** Return the operation result as returned by the MCP.
   For list operations, show total count alongside results. Relay any MCP
   clarification questions verbatim. If 0 results on a list, say so.

5. **Offer next steps.** Ask if the user wants to add more traces, inspect a
   trace with /kubit-inspect, or run blame analysis with /kubit-blame.

## Rules

- Always confirm before removing a trace — this is destructive and hard to undo
- Omit `limit` for add, update, and remove operations
- Carry trace ids from prior /kubit-inspect results into the query automatically
- Relay MCP clarification questions verbatim   

## Error Handling

- User wants to switch org/workspace → "Run /kubit-connect to switch."
- Trace not found → "Trace not found. Check the id or use /kubit-inspect to find the right trace."
- Dataset not found → "No dataset matched that name. Check the name or list available datasets."
- Ambiguous operation → Relay the MCP's clarification question verbatim and let the user clarify.
- MCP failure → "Could not connect to the kubit MCP server. Check your network."

## Examples

**Add a trace:**
Input: /kubit-dataset add trace 400377 to the Checkout golden dataset
Output: Confirmation — trace id, dataset name, and updated trace count.

**Add from a prior inspect result:**
Input: add that last trace we looked at to the regression test suite
Output: Trace id carried from context. Confirmation — trace id, suite name,
        updated count.

**Update a trace:**
Input: /kubit-dataset update trace 400377 expected output to "order confirmed"
Output: Confirmation — trace id, what changed, dataset name.

**Remove a trace:**
Input: /kubit-dataset remove trace 400377 from the Checkout golden dataset
Output: Confirm with user before removing. On confirmation — removal confirmed,
        trace id, dataset name, updated count.

**List traces in a dataset:**
Input: /kubit-dataset list traces in the Checkout golden dataset
Output: Structured list — trace id, status, tags per trace. Total count shown.
        Offer to add more or inspect individual traces.

**Zero results on list:**
Input: /kubit-dataset list traces in the Onboarding test suite
Output: "The Onboarding test suite is empty. Use /kubit-inspect to find traces
        to add."
        
## Gotchas

_To be added as we test._
