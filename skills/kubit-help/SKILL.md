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

1. If the user asks which Kubit skills there are, or names none, display the
   full skill list below.
2. If a specific skill is requested, explain it in detail with examples.
3. If the user describes a task but is unsure which skill to use, identify
   the best match and suggest it with an example.
4. If the user asks what the Kubit product (the app, Lumos, reports,
   dashboards, workspaces, plans) can do or how to do something in it, call
   the `search_docs` MCP tool and answer from the pages that answer it, with
   their links. When the docs do not say, tell the user so; never guess, and
   follow the next step the result gives.
5. Consider using the `help` MCP call if the request fits in its use cases.
   When you do, format the `text` argument as described in "Filing a support
   request" below, and confirm with the user first as described in
   "Confirm before filing".

## Filing a support request

When calling the `help` MCP tool, the `text` argument MUST be formatted as:

```
<one-line summary of the user's request, under 80 characters>
<the request in the user's words, then the context>
```

Kubit makes the first line the ticket's subject and the rest its body. Do not
add `---` lines or say where the request came from: Kubit adds a footer that does.

The context should include any of the following that you
can determine from the current conversation or by looking at the project
(e.g. `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, lockfiles):

- **Project language and framework** (e.g. "TypeScript / Next.js 14",
  "Python 3.12 / FastAPI").
- **SDKs and libraries in use, with versions** — especially anything Kubit-
  adjacent: `kubit-otel`, `@kubit-ai/otel`, observability sinks (Langfuse,
  Braintrust), and LLM sources (Vercel AI SDK, OpenAI, Anthropic, LangChain,
  OpenTelemetry GenAI).
- **Troubleshooting signals from this conversation** — recent error messages,
  stack traces, failed MCP calls (tool name + error), and what the user has
  already tried.

Guidelines:
- Only include information you actually know. Do not invent versions, names,
  or errors. Omit anything unknown.
- No secrets, no personal data, and no trace or prompt content: cite the
  trace or report id instead.
- If this issue was already filed in this conversation, give its earlier
  ticket id instead of filing a second one.
- Pick the type by what happened: BUG for a Kubit error, FEEDBACK for a
  missing capability, QUESTION for a question about the user's Kubit account
  that the docs cannot answer.
- Tailor depth to `requestType`: BUG and QUESTION should include reproduction
  details and any errors; FEEDBACK usually only needs a brief environment
  summary.
- Keep the context concise — a short labeled list is better than a wall of
  prose.

### Confirm before filing

Call `help` without `draftId` first: it files nothing and returns the exact
ticket. Show that ticket as the result says, kept separate from your own text, and
ask in one `AskUserQuestion`: "Yes, send it", "Edit it first" or "No". On
"Yes, send it", call `help` again with the same arguments and the `draftId`.
On "Edit it first", ask what to change and preview the new text. Where
`AskUserQuestion` is not available, ask the same question in plain text and
wait for a clear yes.

For a QUESTION, the preview also shows what the Kubit docs say. Give the user
what they say that answers the question, with their links, or say they do not
answer it, then ask about the ticket as above: a user the docs answered picks
"No".

## Skills

### /kubit
Natural-language entry point. Classifies your question and routes it to the
right kubit skill; for regression investigations it chains /kubit-report →
/kubit-inspect → /kubit-blame, carrying the window and trace context between
hops.
    /kubit why did errors spike on Tuesday?
    ask kubit what regressed after Friday's deploy
---
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
a specific segment of data, or who is in a cohort. Shows a sample of the
matching rows and the full set as a CSV.
    /kubit-inspect failed traces with intent Checkout since yesterday
    /kubit-inspect sessions where token cost > $5 in the last 2 hours
    /kubit-inspect users who rephrased more than 2 times last week
---
### /kubit-report
Finds, opens, creates, and changes Kubit analytics reports — queries, data
tables, funnels, paths, retention, significance tests, and agent flows. Use this for trends, aggregations, and
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

### Also available through the Kubit MCP server
No skill needed: ask for these in your own words.
- `import_dashboard` — build a Kubit dashboard from reports you made.
- `publish_component` — publish a filter, measure, virtual event, binning or
  cohort for your workspace. Permanent; only when you ask for it.
- `explain_field` — what a field means, or which field holds a value.
- `memory` — what Kubit remembers about you and your workspace (Lumos memory).
- `skill` — find, run, create or edit your Lumos skills. They also appear as
  MCP prompts.
- `investigate_agent_flow_failure` / `inspect_agent_flow_activity` — why
  agent traces fail at a node of an agent flow, and those traces in Activity.

---

## Rules

- Don't require a workspace context — this skill must work before /kubit-connect is complete.
  However, the `help` mcp call does require a wsctx - call `init` first if you don't already have a wsctx in
  the context and `help` needs to be called. If `init` is not available (only `authenticate` is
  offered for the Kubit server), or `init` or `help` returns an auth/unauthenticated error, do
  not improvise — follow **MCP authentication** below. The skill
  list above never needs auth; the `help` and `search_docs` MCP calls do. `search_docs` takes no
  wsctx, so it needs no `init` first, and an auth error from it goes to **MCP authentication** too.
- When calling `help`, always format `text` as a summary line under 80
  characters, then the request and context, per the "Filing a support request"
  section.
- Never call `help` with a `draftId` without the user's yes from "Confirm before filing".
- Never invent skills that do not exist
- Keep the skill list accurate — update it whenever a new skill is added
- One example block per skill in the summary view; full detail on specific request

## MCP authentication

{{KUBIT_MCP_AUTH}}

## Gotchas

- If a user asks about a Kubit capability, search the docs first (step 4). If
  they do not describe it, say the docs do not describe it, not that Kubit
  cannot do it, and preview a FEEDBACK ticket as the `search_docs` result says.
