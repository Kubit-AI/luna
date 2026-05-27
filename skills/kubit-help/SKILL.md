---
name: kubit-help
description: Use this skill when the user asks what Kubit can do, needs help, is unsure which skill to use or needs help from kubit support
---
# /kubit-help

## Overview

This skill is the discovery index for the Kubit plugin. It lists all available
skills, explains what each one does, and routes users to the right one for their
task. No workspace context required — works before /kubit-connect is complete.

This skill can also be used to file a support request with the kubit system - it
is possible to file BUGs, QUESTION for asking for help and FEEDBACK for general feedback
or feature requests, using the `help` MCP call.

## Steps

1. If no specific skill is requested, display the full skill list below.
2. If a specific skill is requested, explain it in detail with examples.
3. If the user describes a task but is unsure which skill to use, identify
   the best match and suggest it with an example.
4. Consider using the `help` MCP call if the request fits in its use cases.
   When you do, format the `text` argument as described in "Filing a support
   request" below.

## Filing a support request

When calling the `help` MCP tool, the `text` argument MUST be formatted as:

```
<user's request>
---
<conversation context>
```

The line containing only `---` is the separator — it is mandatory even when
the context block is short.

The conversation context block should include any of the following that you
can determine from the current conversation or by looking at the project
(e.g. `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, lockfiles):

- **Project language and framework** (e.g. "TypeScript / Next.js 14",
  "Python 3.12 / FastAPI").
- **SDKs and libraries in use, with versions** — especially anything Kubit-
  adjacent: `kubit-otel`, `@kubit-ai/otel`, observability sinks (Langfuse,
  Braintrust), and LLM sources (Vercel AI SDK, OpenAI, Anthropic, LangChain,
  OpenTelemetry GenAI).
- **Kubit workspace context info** — current org and workspace if a wsctx is active.
- **Troubleshooting signals from this conversation** — recent error messages,
  stack traces, failed MCP calls (tool name + error), and what the user has
  already tried.

Guidelines:
- Only include information you actually know. Do not invent versions, names,
  or errors. Omit anything unknown.
- Tailor depth to `requestType`: BUG and QUESTION should include reproduction
  details and any errors; FEEDBACK usually only needs a brief environment
  summary.
- Keep the context concise — a short labeled list is better than a wall of
  prose.

## Skills

### /kubit-connect
Sets up your Kubit workspace context. Handles org and workspace selection and
switching. Required before any other skill — provides the WSCTX
(workspace context) token everything else depends on.
    /kubit-connect
    /kubit-connect switch workspace staging
---
### /kubit-integrate
Wires your LLM app's tracing into Kubit. Detects observability sinks
(Langfuse, Braintrust) and LLM sources (Vercel AI, OTel GenAI),
creates a Kubit workspace, mints an ingestion key, and emits the
bootstrap that ships spans to Kubit — either alongside an existing
sink or as the sole sink for a new app.
    /kubit-integrate
    /kubit-integrate turn on Kubit for this Next.js app
---
### /kubit-blame
Finds the code change behind a trace regression — errors, sentiment drift,
escalations, intent accuracy drops. Downstream of /kubit-report and
/kubit-inspect: they detect the regression and suggest blame; blame maps
traces to code and ranks recent commits.
    /kubit-blame find the commit behind the checkout escalation spike last week
    /kubit-blame why did trace t_abc fail — what changed?
---
### /kubit-inspect
Retrieves raw data from Kubit — traces, sessions, users, and events. The go-to
skill for debugging failures, investigating unexpected behavior, or drilling into
a specific segment of data. Returns up to 5 results by default.
    /kubit-inspect failed traces with intent Checkout since yesterday
    /kubit-inspect sessions where token cost > $5 in the last 2 hours
    /kubit-inspect users who rephrased more than 2 times last week
---
### /kubit-report
Finds, opens, and creates Kubit analytics reports — Grids, Queries,
Funnels, Flows, and Retention reports. Use this for trends, aggregations, and
LLM performance analysis. Searches existing reports before creating new ones.
    /kubit-report daily failed traces
    /kubit-report build a funnel for prompt → intent → tool call → response
    /kubit-report create a weekly retention report for new users
---
### /kubit-update
Checks npm for a newer version of the Kubit agent plugin, shows what changed
since the installed version, and runs the installer after confirmation.
    /kubit-update
    check if there's a new version of kubit

---

## Rules

- Don't require a workspace context — this skill must work before /kubit-connect is complete.
  However, the `help` mcp call does require a wsctx - call `init` first if you don't already have a wsctx in
  the context and `help` needs to be called. If that `init` (or the `help` call) returns an
  auth/unauthenticated error, do not improvise — follow **MCP authentication** below. The skill
  list above never needs auth; only the `help` MCP call does.
- When calling `help`, always format `text` as `<user request>\n---\n<context>`
  per the "Filing a support request" section. The `---` separator is mandatory.
- Never invent skills that do not exist
- Keep the skill list accurate — update it whenever a new skill is added
- One example block per skill in the summary view; full detail on specific request

## MCP authentication

{{KUBIT_MCP_AUTH}}

## Gotchas

- If a user asks about a capability not yet built, say so clearly
