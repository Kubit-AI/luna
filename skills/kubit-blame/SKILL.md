---
name: kubit-blame
description: Use this skill when the user wants to find the code change responsible for a trace regression — errors, sentiment drift, escalations, intent accuracy drops — in traces ingested via Kubit. Detects which sinks (Langfuse, Braintrust) and sources (Vercel AI, OpenTelemetry GenAI, LangChain, LangSmith, OpenInference, Traceloop, Logfire, OpenAI Agents) shape the spans, then maps trace identifiers to code with user confirmation. Blame is downstream of /kubit-report and /kubit-inspect and never fetches metrics itself.
---

# /kubit-blame

## Overview

This skill is "git blame for agents". Given Kubit-ingested trace data
flagged as problematic, it finds the recent commit(s) most likely
responsible. It maps trace identifiers to concrete code locations with
user confirmation for anything ambiguous, then runs `git log` over those
locations and ranks suspects by temporal proximity, coverage, and diff
surface — each with a short behavioral-change summary.

Traces always arrive at Kubit (either via `/kubit-integrate` or by
manual wiring of the kubit-otel SDK's `KubitSpanProcessor` /
`KubitExporter`). What varies repo-to-repo is **what shaped those
spans**: which **sinks** (Langfuse, Braintrust) decorate them and
which **sources** (Vercel AI, OTel GenAI, LangChain, LangSmith,
OpenInference, Traceloop, Logfire, OpenAI Agents) emit them. Blame
detects both axes in the user's repo and loads the matching
code-side adapters into the mapper. It does not assume Kubit is the
only sink in the code — other sinks may co-exist.

Adapters live at `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/`.
Two sinks: `sink-langfuse.md`, `sink-braintrust.md`. Eight sources:
`source-vercel-ai.md`, `source-otel-genai.md`, `source-langchain.md`,
`source-langsmith.md`, `source-openinference.md`,
`source-traceloop.md`, `source-logfire.md`, `source-openai-agents.md`.

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

2. **Parallel sink + source scan.** Grep the user's current working
   directory (their application repo, NOT this skill's install dir)
   for every adapter's §1 Dependency signals. Check `package.json`,
   `pyproject.toml`, `requirements.txt`, `go.mod`, and a shallow scan
   of top-level imports.

   Emit two sets: `sinks_detected ⊆ {langfuse, braintrust}` and
   `sources_detected ⊆ {vercel-ai, otel-genai, langchain, langsmith,
   openinference, traceloop, logfire, openai-agents}`. Adapter §1
   lives at:

   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/sink-langfuse.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/sink-braintrust.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-vercel-ai.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-otel-genai.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-langchain.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-langsmith.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-openinference.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-traceloop.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-logfire.md`
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-blame/references/frameworks/source-openai-agents.md`

   **Detection traps** (call out in the confirmation when they apply):
   - `@opentelemetry/api` alone in TS without any GenAI marker → not
     a GenAI source; skip `otel-genai` (per `source-otel-genai.md` §1).
   - LangChain wiring at the v2 import path — Python
     `from langfuse.callback import CallbackHandler` or JS
     `from "langfuse-langchain"` — routes spans through Langfuse's
     non-OTel HTTP pipeline, so LangChain identifiers cannot be
     mapped (per `source-langchain.md` §1). Surface the trap and
     mark every LangChain identifier `unresolved` rather than
     blocking the run.
   - LangChain alongside Braintrust without OTel-compat
     (`BRAINTRUST_OTEL_COMPAT=true` / `setupOtelCompat()` absent) →
     same pipeline gap (per `source-langchain.md` §1). Same handling.

3. **Confirm detection.** Print the detected axes back to the user
   in one line — *"Detected sinks: `<sinks>`. Detected sources:
   `<sources>`. Continue? [Y/n]"* (omit either word when its set is
   empty). Surface any traps from step 2 inline. On `n`, exit 0.

   Empty / unsupported terminal cases (no wsctx touch, no fetch):

   - `sinks_detected == [] && sources_detected == []` → print
     *"No supported sink or source detected. `/kubit-blame` recognises
     sinks (Langfuse, Braintrust) and sources (Vercel AI, OpenTelemetry
     GenAI, LangChain, LangSmith, OpenInference, Traceloop, Logfire,
     OpenAI Agents). Add tracing to your repo and re-run, or reach out
     on #kubit."* and exit 0.
   - `sinks_detected == [] && sources_detected == {langchain}` → print
     *"Detected LangChain, no sink. LangChain emits no spans on its
     own — they only reach Kubit through a Langfuse or Braintrust
     callback handler. Add one of those sinks and re-run."* and exit 0.

   **Kubit SDK nudge (informational).** Manual wiring of the Kubit
   SDK is a supported path — `/kubit-integrate` is one entry point
   among several. Detect Kubit SDK presence via:

   - Manifests: `kubit-otel` in Python `pyproject.toml` /
     `requirements.txt`; `@kubit-ai/otel` in `package.json`.
   - Imports / wiring literals (covers monorepos, git installs,
     workspace-linked deps the manifest scan misses):
     - Python: `from kubit_otel import`, `import kubit_otel`,
       `KubitSpanProcessor`, `KubitExporter`, `kubit_otel.configure(`,
       `kubit_otel.attach(`
     - JS/TS: `from "@kubit-ai/otel"`, `KubitSpanProcessor`,
       `KubitExporter`, `configure({ apiKey:` paired with a
       `@kubit-ai/otel` import in the same file

   When Kubit SDK is **not** detected by either path, append one line
   to the confirmation: *"No Kubit SDK detected — verify spans are
   landing in Kubit before relying on blame results."* Do not block;
   the user may be inspecting traces from a separate ingestion path.
   When Kubit SDK **is** detected, append no nudge.

4. **Resolve trace data.** If the user gave only a report / export URL,
   spawn `kubit-analyst` to parse it and extract trace identifiers. If the
   user gave raw trace JSON or explicit ids, use those directly.

5. **Dispatch `kubit-blame-mapper`.** Pass: the lists `sinks_detected`
   and `sources_detected`, the absolute paths to every matching
   adapter file, the extracted trace identifiers, and the repo root.
   The subagent reads all supplied adapters and returns a compact
   JSON mapping table.

6. **User-confirmation gate.** For every row where `status != "confirmed"`:
   - `ambiguous` → list the candidates to the user and ask them to pick one
     or skip that identifier.
   - `unresolved` → show the reason; ask the user to supply the code
     location manually (e.g. "paste the prompt body" or "which file
     defines this agent?") or skip.
   - Do not proceed to the correlator until every row is either confirmed
     or skipped.

7. **Resolve the time window.** If the handoff or user phrasing gave an
   explicit `[since, until]`, use it. Otherwise ask the user one question
   for it — do not infer.

8. **Dispatch `kubit-blame-correlator`.** Pass: the confirmed mappings, the
   time window, and any metric context.

9. **Present results in three blocks.**

   **Block 1 — Resolved context** (one or two lines): the two-axis
   summary (e.g. *"Sinks: langfuse. Sources: vercel-ai."*; print
   `(none)` for an empty set), count of mapped locations, window.

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

- **No supported sink/source detected.** Print the friendly message
  from step 3 and exit 0.
- **LangChain only, no sink.** Print the LangChain-only message from
  step 3 and exit 0.
- **Confirmation declined.** Exit 0.
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
Output: Detected sinks: langfuse. Detected sources: vercel-ai. Three
        trace identifiers mapped, two confirmed and one picked by the
        user. Top suspect: commit 7f3a1c2 on 2026-04-12 — tightened
        refund eligibility prompt; score 0.87.

**Trace-driven exploratory:**
Input: *"why did trace t_abc fail — what changed?"*
Output: Mapper identifies the agent + tool involved in the trace. After user
        confirms, correlator shows two commits in the last week that touched
        the mapped locations.

**Multi-sink ambiguity:**
Input: *"blame the agent regression"* in a repo mid-migration from
       Langfuse to Braintrust where the same agent name is registered
       under both `@observe` and `@traced`.
Output: Detected sinks: langfuse, braintrust. Mapper returns
        `status: "ambiguous"` with `multiple_adapter_match` for the
        agent identifier; user picks which site the failing trace
        flows through.

**Zero suspects:**
Input: blame a metric drift when the mapped files have no commits in the
       window
Output: Block 2 omitted. Block 3 leads with the no-commits guidance and
        offers a wider window.

## Gotchas

_To be added as we test._
