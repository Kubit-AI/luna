---
name: blame
description: Use this skill when the user wants to find the code change responsible for a Langfuse trace regression — errors, sentiment drift, escalations, intent accuracy drops. Blame is downstream of /kubit-report and /kubit-inspect and never fetches metrics itself.
---

# /kubit-blame

## Overview

This skill is "git blame for agents". Given Langfuse trace data flagged as
problematic, it finds the recent commit(s) most likely responsible. It maps
trace identifiers to concrete code locations with user confirmation for
anything ambiguous, then runs `git log` over those locations and ranks
suspects by temporal proximity, coverage, and diff surface — each with a
short behavioral-change summary.

Langfuse is the only framework supported right now. Adapters for other
frameworks are on hold under `docs/frameworks/blame/` in the repo and will
be re-introduced incrementally.

## When to Use

- The user is investigating a metric regression flagged by `/kubit-report` or
  an error cluster surfaced by `/kubit-inspect` and wants to know which
  commit caused it.
- The user points at a specific failing trace and asks what changed.
- The user wants to overlay commit history against a metric curve for a
  given window.
- Do NOT use to fetch metrics or traces — route to `/kubit-report` or
  `/kubit-inspect` instead.

## Composition with other skills

- Blame is downstream. When `/kubit-report` or `/kubit-inspect` surfaces
  errors, they print a natural-language suggestion pointing at this skill.
  The user chooses whether to follow.
- Blame accepts free-form input — no flags. Examples:
  - *"blame the checkout escalations from last week"*
  - *"why did trace t_abc fail — what changed?"*
  - *"find the commit behind the sentiment drop in the report I just ran"*
- Blame never calls Kubit MCP tools itself. If trace data is only available
  as an export URL, use the `kubit-analyst` subagent to pull and parse it —
  that is reading an artifact, not fetching a metric.

## Workflow

1. **Parse the user's phrasing.** Extract what you can: trace identifiers
   (trace/session ids, agent names, tool names), metric name + direction,
   time window. Do not guess — if the phrasing is ambiguous about any of
   these, ask the user one short question to clarify.

2. **Detect Langfuse.** Grep the user's current working directory (their
   application repo, NOT this skill's install dir) for Langfuse dependency
   signals per the patterns in:
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/langfuse.md` §1

   Check `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, and
   a shallow scan of top-level imports. If no Langfuse signals are found,
   print *"Sorry, at the moment only Langfuse tracing is supported. Add
   Langfuse tracing to your repo first, or reach out on #kubit."* and exit 0.

3. **Resolve trace data.** If the user gave only a report / export URL,
   spawn `kubit-analyst` to parse it and extract trace identifiers. If the
   user gave raw trace JSON or explicit ids, use those directly.

4. **Dispatch `kubit-blame-mapper`.** Pass: the Langfuse adapter path, the
   extracted trace identifiers, and the repo root. The subagent returns a
   compact JSON mapping table.

5. **User-confirmation gate.** For every row where `status != "confirmed"`:
   - `ambiguous` → list the candidates to the user and ask them to pick one
     or skip that identifier.
   - `unresolved` → show the reason; ask the user to supply the code
     location manually (e.g. "paste the prompt body" or "which file
     defines this agent?") or skip.
   - Do not proceed to the correlator until every row is either confirmed
     or skipped.

6. **Resolve the time window.** If the handoff or user phrasing gave an
   explicit `[since, until]`, use it. Otherwise ask the user one question
   for it — do not infer.

7. **Dispatch `kubit-blame-correlator`.** Pass: the confirmed mappings, the
   time window, and any metric context.

8. **Present results in three blocks.**

   **Block 1 — Resolved context** (one or two lines): framework, count of
   mapped locations, window.

   **Block 2 — Ranked suspects** (top N, default 5): one entry per suspect
   with SHA, date, author, message, touched paths, semantic summary, score
   with breakdown, and a drill offer. If the top score ≥ 0.7 and the next
   is < 0.4, lead with *"Most likely cause: #1."* Otherwise stay neutral.

   **Block 3 — Next actions:**
   - Raw diff of a specific SHA → re-dispatch correlator with that SHA.
   - Inspect failing traces side-by-side → hand off to `/kubit-inspect`.
   - Watch metric over time → hand off to `/kubit-report`.
   - Re-run with wider window → re-dispatch correlator with a new window.

   Special cases:
   - `weak_correlation: true` → Block 2 capped at 3; Block 3 leads with
     *"No strong code suspect. This may be data drift or a model-side
     change, not a code regression."*
   - Empty suspects → Block 2 omitted; Block 3 leads with
     *"No commits found in mapped locations during the window. Try
     widening the window or revisiting the mapping."*

## Rules

- Never fetch metrics or traces directly. Delegate to `/kubit-report`,
  `/kubit-inspect`, or the `kubit-analyst` subagent.
- Never silently disambiguate a mapping. Ask the user for every
  `ambiguous` or `unresolved` row.
- Never fall back to filesystem timestamps if git history is unavailable.
- Present numbers with context (temporal proximity, coverage, diff
  surface) — a raw SHA without a "why" is not useful.

## Error Handling

- **No Langfuse detected.** Print the friendly unsupported message (step 2)
  and exit 0.
- **Malformed handoff / ambiguous phrasing.** Ask one clarifying question;
  refuse to invent values.
- **Not a git checkout.** Surface the correlator's clear error; suggest
  running blame inside the dev repo that produces these traces.
- **Shallow clone.** Warn explicitly; offer `git fetch --unshallow` and
  re-dispatch.
- **Mapping scope too large.** Mapper returns `status: "scope_too_large"`.
  Ask the user to narrow the handoff (fewer traces, specific agent).

## Examples

**Metric-regression driven (primary):**
Input: *"blame the checkout escalation spike from last week"*
Output: Langfuse detected. Three trace identifiers mapped, two confirmed
        and one picked by the user. Top suspect: commit 7f3a1c2 on
        2026-04-12 — tightened refund eligibility prompt; score 0.87.

**Trace-driven exploratory:**
Input: *"why did trace t_abc fail — what changed?"*
Output: Mapper identifies the agent + tool involved in the trace. After user
        confirms, correlator shows two commits in the last week that touched
        the mapped locations.

**Zero suspects:**
Input: blame a metric drift when the mapped files have no commits in the
       window
Output: Block 2 omitted. Block 3 leads with the no-commits guidance and
        offers a wider window.

## Gotchas

_To be added as we test._
