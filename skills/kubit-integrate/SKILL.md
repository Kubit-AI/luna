---
name: kubit-integrate
description: Use this skill when the user wants to start shipping their existing LLM tracing into Kubit. Detects on two axes — tracing **sinks** (Langfuse, Braintrust) and tracing **sources** (Vercel AI SDK, OpenTelemetry GenAI, LangChain) — then creates a fresh Kubit workspace, mints an ingestion key, writes it to the repo's env config (`.env.local` or `.env`), installs the Kubit OTel SDK (`@kubit-ai/otel` on Node, `kubit-otel` on Python), and wires `KubitSpanProcessor` into the user's existing provider when a sink is present, or `configure()`s the SDK as the sole sink for the detected source(s) when no sink is present.
---

# /kubit-integrate

## Overview

This skill is the single "turn on Kubit ingestion" flow. It dispatches
on two orthogonal axes:

- **Sink** — owns a destination for spans (Langfuse, Braintrust).
  One sink drives the wiring template. When multiple sinks are
  detected the user picks one.
- **Source** — emits OTel spans, no native destination (Vercel AI,
  OTel GenAI). Zero or more sources can be present; they confirm
  span production. LangChain is a **sink-dependent** source: it
  emits no OTel spans on its own and only reaches Kubit via a
  sink-provided callback handler (Langfuse or Braintrust).

Given a repo with either a sink, one or more sources, or both, it:

1. Ensures a Kubit workspace context exists (delegating to `/kubit-connect` if not).
2. Creates or selects the Kubit workspace for this app.
3. Mints an ingestion key against that workspace.
4. Writes the key into the repo's env config — `.env.local` or `.env`,
   whichever matches the project's conventions (gitignore-checked).
5. Installs the Kubit OTel SDK (`@kubit-ai/otel` on Node,
   `kubit-otel` on Python) via the project's package manager, along
   with its OpenTelemetry peer packages on the JS side.
6. Wires Kubit into the program:
   - **Sink present** → the detected sink adapter's §3 template
     slots `KubitSpanProcessor` alongside the sink's existing
     processor (or `attach()`es on Python), merging into the user's
     existing wiring site or falling back to a standalone bootstrap
     when §3a finds no site.
   - **No sink, source(s) present** → Kubit becomes the sole sink
     via `source-otel-genai.md` §3, which `configure()`s the SDK
     to own the global `TracerProvider`.

Adapters live at `{{KUBIT_CONFIG_DIR}}/skills/kubit-integrate/references/frameworks/`.
Two sinks: `sink-langfuse.md`, `sink-braintrust.md`. Three sources:
`source-vercel-ai.md`, `source-otel-genai.md`, `source-langchain.md`.

## When to Use

- The user wants traces from their existing app to appear in Kubit
  and does not yet have a Kubit exporter wired in.
- The user asks how to send their Langfuse / Braintrust traces to
  Kubit, or asks to ship traces from a Vercel AI / OTel GenAI app.
- Do NOT use to debug failing traces (that's `/kubit-inspect`),
  explain a metric regression (`/kubit-report`, `/kubit-blame`), or
  switch between existing org/workspace contexts (`/kubit-connect`).

## Inputs

- The skill takes no flags; everything is inferred from the current
  working directory plus interactive prompts for the new workspace's
  name and timezone.

## Workflow

1. **Parallel source + sink scan.** Grep the user's current working
   directory (their application repo, NOT this skill's install dir)
   for every adapter's §1 Dependency signals. Check `package.json`,
   `pyproject.toml`, `requirements.txt`, `go.mod`, and a shallow scan
   of top-level imports.

   Emit three sets: `sinks_detected ⊆ {langfuse, braintrust}`,
   `sources_detected ⊆ {vercel-ai, otel-genai, langchain}`, and
   `direct_llm_sdks_detected ⊆ {anthropic, openai, google-genai}`.

   **Direct LLM SDK signals** (declared deps and first-party imports
   only — never lockfile entries; wrappers like `@langchain/anthropic`
   declare these SDKs as runtime deps and would pull them into the
   lockfile without the user using them directly):
   - **`anthropic`** — `@anthropic-ai/sdk` in `package.json`
     `dependencies` / `devDependencies`; `anthropic` in
     `pyproject.toml` / `requirements.txt` / `Pipfile`;
     `from "@anthropic-ai/sdk"` /
     `import Anthropic from "@anthropic-ai/sdk"` in
     `.ts` / `.tsx` / `.js` / `.mjs`; `from anthropic import` /
     `import anthropic` in `.py`.
   - **`openai`** — the bare `openai` package in `package.json` deps
     (not `@ai-sdk/openai` / `@langchain/openai`); `openai` in Python
     manifests; `from "openai"` / `import OpenAI from "openai"` in
     TS/JS; `from openai import` / `import openai` in `.py`.
   - **`google-genai`** — `@google/generative-ai` or `@google/genai`
     in `package.json` deps; `google-generativeai`, `google-genai`,
     or `google-cloud-aiplatform` in Python manifests; matching
     `from "@google/…"` / `from google.generativeai import` /
     `from google import genai` imports.

   These signal that the codebase calls a provider SDK directly
   without a high-level wrapper. They feed the step 2 gate that
   exits early when no supported source is present.

   **Detection traps** (call out in the confirmation when they
   would otherwise tip the decision):
   - `@langfuse/otel` alongside `langfuse` → Langfuse sink (OTel
     shape). Single hybrid adapter.
   - `@opentelemetry/api` alone in TS without any GenAI marker → not
     a GenAI source; skip `otel-genai`.
   - LangChain wiring at the v2 import path — Python
     `from langfuse.callback import CallbackHandler` or JS
     `from "langfuse-langchain"` — routes spans through Langfuse's
     non-OTel HTTP pipeline and Kubit cannot attach. Flag it in the
     confirmation and require the user to upgrade to `langfuse >= 3`
     (Python `from langfuse.langchain import CallbackHandler`) or
     `@langfuse/langchain` (TS) before proceeding. See
     `source-langchain.md` §1.
   - LangChain + Braintrust together — this combination has a wiring
     decision the user must make before any deps land. Surface it in
     the confirmation and resolve it before step 7. The default
     wiring (`BraintrustCallbackHandler` + `set_global_handler` /
     per-call `callbacks: [handler]`) routes spans through
     Braintrust's native HTTP pipeline regardless of
     `BRAINTRUST_OTEL_COMPAT`, so **Kubit does not see LangChain
     spans on this path** (verified `braintrust==0.16.0`, April
     2026). The OTel-native alternative
     (`opentelemetry-instrumentation-langchain` plus a matching
     LLM-client instrumentor) routes spans through OTel so both
     Braintrust and Kubit receive them, but adds a new dep
     ecosystem and requires `wrapt<2`. Python is verified
     end-to-end; TS is not. Walk the user through both paths from
     `source-langchain.md` §3 and let them pick — do not silently
     rewrite their existing wiring. Record the chosen path as
     `langchain_braintrust_path` ∈ {A, B} for downstream steps
     (step 7 dep list, step 9 close-out).

2. **Combined gate + confirm.**

   - `sinks_detected == [] && sources_detected == []` → print
     *"No LLM tracing detected in this repo. `/kubit-integrate`
     recognises sinks (Langfuse, Braintrust) and sources (Vercel AI,
     OpenTelemetry GenAI, LangChain). Add one and re-run, or reach
     out on #kubit."* and exit 0. No wsctx touch, no workspace, no
     writes.
   - `sinks_detected == [] && sources_detected == {langchain}` →
     print *"Detected LangChain, no sink. LangChain emits no OTel
     spans on its own — `/kubit-integrate` ships it only through a
     Langfuse or Braintrust callback handler. Add one of those sinks
     and re-run."* and exit 0. No wsctx touch, no workspace, no
     writes. (If `langchain` is accompanied by another source such
     as `otel-genai`, treat the non-LangChain source as the sole
     source and fall through to the normal no-sink branch; LangChain
     produces no spans in that run.)
   - `direct_llm_sdks_detected != [] && sources_detected == []` →
     print *"Detected direct LLM SDK usage (`<comma-separated list
     of detected SDKs>`) but no supported source. Kubit ingests
     OpenTelemetry spans, and direct calls to the Anthropic /
     OpenAI / Google SDKs do not emit OTel spans on their own.
     `/kubit-integrate` only wires apps whose LLM calls already
     flow through one of: Vercel AI SDK (`ai` / `@ai-sdk/*`),
     OpenTelemetry GenAI semantic conventions, or LangChain via a
     Langfuse or Braintrust callback handler. Move your LLM calls
     under one of those wrappers and re-run."* and exit 0. No
     wsctx touch, no workspace, no writes. The gate is
     sink-agnostic — fires whether or not Langfuse / Braintrust are
     present, because neither produces OTel spans from direct
     provider SDK calls.
   - `len(sinks_detected) > 1` → list them and ask the user to pick
     one. Exit 0 if the user aborts. Record the chosen sink as
     `sink`; all others are ignored for the run.
   - `len(sinks_detected) == 1` → `sink = sinks_detected[0]`.
   - `sinks_detected == []` → `sink = none`; Kubit is the sole sink.
   - Confirm with the user: *"Detected sink: `<sink>`. Detected
     sources: `<sources>`. Instrument? [y/N]"* (omit the sink line
     when sole-sink; say *"Kubit will be the sole sink for
     `<sources>`."*). Exit 0 on no.

3. **Ensure Kubit workspace context.** If the conversation already
   holds a `WSCTX` value (from a prior `/kubit-connect init` or
   `switch`), reuse it. Otherwise, invoke `/kubit-connect` and resume
   here once it returns a wsctx. If the user aborts `/kubit-connect`
   or it fails to establish a wsctx, exit 0 with *"No active Kubit
   workspace context — re-run `/kubit-integrate` after
   `/kubit-connect`."* Do not write anything.

4. **Workspace selection.** The wsctx from step 3 is already pinned
   to a workspace (the user's current one) and carries the list of
   other workspaces in the active org. Surface that context and let
   the user pick one of three branches. Record the branch as
   `workspace_action` ∈ {`used`, `switched`, `created`} for the
   close-out in step 9.

   - **Show current workspace and the org's other workspaces.** Print:
     - Line 1: `Current Kubit workspace: "<name>" (org "<org-name>")`.
     - Then, on following lines, the other workspaces in the active
       org (the same list `/kubit-connect` uses), one per line —
       `  - <name>` — under a heading `Other workspaces in "<org>":`.
       If the current workspace is the only one, print instead
       `No other workspaces in "<org>".` as a single line.
     - Workspaces carrying the `[example: read-only, cannot mint api
       key]` tag in the `init` response are demo-only. Surface the tag
       verbatim after the workspace name when listing them. If the
       user picks one via option 1 or 2, re-prompt to either switch to
       a non-demo workspace or create a new one.

   - **Prompt for action.** Present numbered options. Omit option 2
     when there are no other workspaces:
     1. Use current workspace.
     2. Switch to an existing workspace in this org. *(omit when the
        list is empty)*
     3. Create a new workspace.

     Default on empty input is option 1. Route on the user's pick.

   - **Branch: use current** → keep the wsctx as-is.
     `workspace_action = used`. Skip to step 5.

   - **Branch: switch to existing** →
     - Ask the user to pick one of the already-listed workspaces by
       number or name.
     - Call `switch { orgId, workspaceId, wsctx }` with the current
       org id and the chosen workspace id. Replace the in-memory
       wsctx with the one returned by `switch`.
       `workspace_action = switched`. Skip to step 5.

   - **Branch: create new** →
     - Prompt for **workspace name** (free-text; required). One
       workspace per instrumented app is the expected shape, so a
       repo-descriptive name is a good default suggestion.
     - Prompt for **timezone**. Detect a default with a best-effort
       one-liner (prefer
       `node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)"`;
       fall back on macOS/Linux to
       `readlink /etc/localtime 2>/dev/null | sed -n 's|.*/zoneinfo/||p'`;
       fall back to `UTC`). Show the detected value and let the user
       press enter to accept, or supply a valid IANA name (e.g.
       `America/Los_Angeles`, `Europe/Berlin`).
     - Show a single review line — `name=<value>, timezone=<value>` —
       and ask for an explicit confirm before the MCP call. The user
       can edit either input and re-review.
     - Call `workspace_create { name, timezone, wsctx }`. Warn the
       user the call can take ~30 seconds. The response returns a
       wsctx pinned to the newly created workspace; adopt it.
       `workspace_action = created`.

5. **Obtain the ingestion key.** Two branches: mint a fresh key against
   the workspace, or accept an existing key the user already has (e.g.
   issued from the Kubit UI). Record the choice as `key_source` ∈
   {`minted`, `pasted`} for the close-out in step 9.

   - **Prompt for the key source.** Print the just-selected workspace
     so the user can sanity-check before pasting, then offer numbered
     options. Default on empty input is option 1.

     ```
     Kubit workspace: "<name>" (org "<org-name>")
     How should we get the ingestion key?
       1. Mint a new key for this workspace (default).
       2. Paste an existing key you already have.
     ```

   - **Branch: mint a new key (`key_source = minted`).**
     - Compute a default note as `"<project_name> by <user@hostname>"`:
       - `<project_name>` = `basename "$PWD"`. The CWD basename is what
         the user sees in their shell prompt and is the most legible
         label in the dashboard. If `basename` fails, fall back to the
         literal `"kubit"`.
       - `<user@hostname>` = `whoami`@`hostname -s` (short hostname).
         Fall back to `"unknown@unknown"` if either command fails.
       - Trim to 255 chars; if the composed value would be empty,
         substitute `"kubit-integrate"`.
     - Print the computed note as a single informational line —
       `note=<value>` — so the user can see the label that will appear
       in the dashboard. Do not prompt for confirmation or override;
       pass the computed value straight to `workspace_mint_key`.
     - Call `workspace_mint_key { wsctx, note }` against whichever
       wsctx step 4 produced (the original wsctx for the `used`
       branch, the one returned by `switch` for `switched`, or the one
       returned by `workspace_create` for `created`). The `note` field
       is required by the server (1–255 chars, non-empty).
     - Hold the minted key in memory only. Never log it, never echo it
       back to the user. The only places it is allowed to land are the
       env-file write in step 6 or the fallback `export` line.

   - **Branch: paste an existing key (`key_source = pasted`).**
     - Surface the workspace-scope warning verbatim before prompting:
       *"Kubit API keys are scoped to a single workspace. Make sure the
       key you paste was issued for `"<name>"` (org `"<org-name>"`) — a
       key from a different workspace will land traces in the wrong
       place with no error at ingest time."*
     - Prompt for the key. Accept the value as-is; reject only
       obviously empty input (re-prompt once, then exit 0 with
       *"No key provided — re-run `/kubit-integrate` when ready."*).
       Do not echo the value back, do not log it, and do not call any
       MCP tool to validate it — workspace-scope correctness is the
       user's responsibility, gated by the warning above.
     - Hold the pasted value in the same in-memory slot the minted key
       would occupy; step 6 is unchanged.

6. **Write the API key to the project's env config.**
   - Resolve repo root via `git rev-parse --show-toplevel`. If not a git
     checkout, fall back to the current working directory and warn once:
     *"Not inside a git checkout — generated files won't be tracked."*
   - Pick the target env file at repo root:
     - If `.env.local` exists → use it.
     - Else if `.env` exists → use it.
     - If both exist → use `.env.local` (the per-developer local-override
       convention).
     - If neither exists → create one, guided by framework manifests:
       - `next.config.*` or `vite.config.*` → `.env.local`.
       - Python manifest (`pyproject.toml`, `requirements.txt`,
         `Pipfile`) or no JS manifest → `.env`.
       - If both JS and Python manifests are present, match the language
         of the detected sink/source SDK (JS if any TS-only adapter
         matched; Python if any Python-only adapter matched; otherwise
         ask).
   - Verify the chosen target is gitignored: `git check-ignore -q <path>`.
     If exit code is 0, proceed to write. If non-zero (not ignored, or
     no git repo), skip the write and jump to the print-export fallback
     below; continue with instrumentation emission anyway.
   - Upsert `KUBIT_API_KEY=<minted-value>` into the chosen file:
     - If the file exists and already contains a `KUBIT_API_KEY=` line,
       replace that single line in place — do not reorder other keys,
       do not touch comments. Preserve the file's trailing newline.
     - If the file exists but has no `KUBIT_API_KEY=` line, append it
       as its own line at the end of the file.
     - If the file is missing, create it with that single line.
   - **Fallback (gitignore check failed):** print a single line
     *"`<file>` not gitignored — printing export line instead to avoid
     committing the key:"* followed by
     `export KUBIT_API_KEY=<minted-value>`. This is the only place the
     key is allowed to leave the env-file write target. Continue to
     step 7.

7. **Install the Kubit SDK.** The coding agent both edits the project's
   manifest and runs the install — not one or the other.

   - **Detect the package manager** from lockfiles / manifests at repo
     root. Infer from what the project actually uses, not from global
     preferences:
     - Python: `uv.lock` → `uv`; `poetry.lock` → `poetry`;
       `Pipfile.lock` → `pipenv`; `pyproject.toml` + `uv` on PATH →
       `uv`; else `pip` (against `requirements.txt` or the active
       venv).
     - JS / TS: `pnpm-lock.yaml` → `pnpm`; `yarn.lock` → `yarn`;
       `bun.lockb` → `bun`; else `package-lock.json` / `package.json`
       → `npm`.
   - **Dep list** per language — always the Kubit OTel SDK (Python:
     `kubit-otel`; TS: `@kubit-ai/otel` plus its OpenTelemetry JS v2
     peer packages), plus any extras the chosen sink adapter's §4
     names (e.g. `braintrust[otel]` on `sink-braintrust.md`), plus
     the LangChain extras from `source-langchain.md` §4 when
     `langchain` is in `sources_detected`:
     - Python: `kubit-otel` + sink-adapter extras. LangChain extras
       depend on the sink and (for Braintrust) the path chosen in
       step 1's detection trap:
       - Langfuse sink → no extra package (`langfuse.langchain`
         ships inside `langfuse >= 3`).
       - Braintrust sink, Path A (native callback) → no extra
         package (`braintrust.integrations.langchain` ships inside
         `braintrust[otel] >= 0.3.5`).
       - Braintrust sink, Path B (OTel-native) →
         `opentelemetry-instrumentation-langchain` plus a matching
         LLM-client instrumentor (detect from imports:
         `langchain_anthropic` →
         `opentelemetry-instrumentation-anthropic`,
         `langchain_openai` → `opentelemetry-instrumentation-openai`,
         `langchain_google_genai` →
         `opentelemetry-instrumentation-google-genai`,
         `langchain_aws` → `opentelemetry-instrumentation-bedrock`,
         `langchain_cohere` → `opentelemetry-instrumentation-cohere`,
         …). Install all matching instrumentors when multiple
         providers are present. **Pin `wrapt<2`** — see
         `source-langchain.md` §4 for the
         `TypeError: wrap_function_wrapper() got an unexpected keyword argument 'module'`
         failure mode.
     - TypeScript: `@kubit-ai/otel`, `@opentelemetry/api`,
       `@opentelemetry/exporter-trace-otlp-proto`,
       `@opentelemetry/resources@^2`,
       `@opentelemetry/sdk-trace-base@^2`,
       `@opentelemetry/sdk-trace-node@^2` (`@kubit-ai/otel` requires
       the OTel JS v2 peers — see the version gate below) +
       sink-adapter extras + the sink-specific LangChain extras when
       `langchain` is in sources:
       - Langfuse sink → add `@langfuse/langchain`.
       - Braintrust sink, Path A (native callback) → add
         `@braintrust/langchain-js`. Kubit gets nothing from
         LangChain on this path; surface that to the user.
       - Braintrust sink, Path B (parallel pipelines, recommended
         on TS) → add `@arizeai/openinference-instrumentation-langchain`
         and `@opentelemetry/sdk-node` alongside
         `@braintrust/langchain-js` (which stays in user code as
         the Braintrust callback). Kubit's bootstrap on this path
         comes from `source-langchain.md` §3 Path B (TS), which
         stands up its own `NodeSDK` with `KubitSpanProcessor` —
         do **not** install `@braintrust/otel` or call
         `setupOtelCompat()` on the LangChain path; they don't
         bridge the callback into OTel on TS. Do **not** install
         `@traceloop/instrumentation-langchain` — verified broken
         on TS (discards `parentRunId`, see Gotchas).
   - **OTel JS v2 version gate (TS only).** Before running the JS
     install, parse the project's `package.json`. If any of
     `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-trace-node`,
     or `@opentelemetry/resources` is declared in `dependencies` or
     `devDependencies` with a range whose lower bound is `< 2.0.0`
     (e.g. `^1.x`, pinned `1.x.y`), refuse to install. Print
     *"`@kubit-ai/otel` requires OpenTelemetry JS SDK v2; bump
     `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-trace-node`,
     and `@opentelemetry/resources` to `^2.0.0` and re-run
     `/kubit-integrate`."* and exit 0. The manifest edit may have
     already landed; that is acceptable — the install command is
     what's gated. Python has no equivalent gate; `kubit-otel`'s
     `pyproject.toml` pins are handled by the resolver.
   - **Edit the manifest first, then install.** Add the dep(s) to
     `pyproject.toml` / `requirements.txt` / `package.json` matching
     the project's existing style. Then run the matching install
     command (`uv add …`, `poetry add …`, `pip install …`,
     `pnpm add …`, `yarn add …`, `bun add …`, `npm install …`). Never
     edit the manifest without running the install, and never run the
     install without the manifest edit.
   - **Failure handling.** If the install command fails, surface
     stderr verbatim, leave the manifest edit in place, and tell the
     user to install manually before running the verification
     command. Continue to step 8 — missing install blocks
     verification, not emission.

8. **Wire Kubit into the program.** Dispatch on whether a sink was
   selected in step 2.

   - **Sink selected (`sink != none`).** Load
     `{{KUBIT_CONFIG_DIR}}/skills/kubit-integrate/references/frameworks/sink-<sink>.md`.
     That adapter's §3 is the *specification* of what Kubit code must
     end up in the program (imports + `KubitSpanProcessor` slotted
     into the user's `spanProcessors: [...]` array on TS, or
     `attach()` / `KubitSpanProcessor.add_span_processor(...)` on
     Python — never `configure()` on TS when another OTel provider
     is being constructed in the same process, since `configure()`
     registers a fresh `NodeTracerProvider` that would clobber the
     sink's). Treat placement and syntactic style (variable names,
     import grouping, sync vs async, quote style) as adaptable —
     match the surrounding file's conventions.

     If the adapter's §2 has a `### Prerequisites` subsection, surface
     it verbatim and require explicit `y/N` opt-in before any file
     write. On decline, exit 0 with the adapter's decline message.

     Shape-specific branching stays inside the sink adapter and is
     read from it directly:

     - `sink-langfuse.md` splits per §1 into the OTel shape
       (`@langfuse/otel` in `package.json`) and the native shape (only
       `langfuse` / `@langfuse/tracing` / `@langfuse/openai` /
       `@langfuse/core`). Pick the §3 variant that matches the shape
       detected in step 1.
     - `sink-braintrust.md` gates on the OTel-compat prerequisite.
       Activation is language-split: Python wraps both merge and
       standalone forms in a `BRAINTRUST_OTEL_COMPAT=="true"`
       runtime guard (the env var is the only switch the Python SDK
       honors); TypeScript has no env-var equivalent and instead
       calls `setupOtelCompat()` from `@braintrust/otel`
       unconditionally on bootstrap import — that import is the
       opt-in.

     **LangChain hand-off.** When `langchain` is in
     `sources_detected`, after the sink adapter's §3 wiring is
     resolved, surface the corresponding §3 snippet from
     `source-langchain.md`. Dispatch:
     - Langfuse sink → §3 Langfuse subsection (callback handler;
       single path).
     - Braintrust sink → §3 Braintrust subsection's Path A or Path B
       snippet, matching the path the user picked in step 1's
       detection trap. Surface only the chosen path's snippet — do
       not show both, and do not stack them in the same project.
     The snippet is informational for callback paths (the user must
     thread `callbacks: [handler]` themselves) and an actionable
     bootstrap edit for Path B (the
     `LangchainInstrumentor().instrument()` and matching
     `<Provider>Instrumentor().instrument()` calls land in the
     bootstrap file alongside `sink-braintrust.md` §3's wiring).
     Step 9's close-out branches on the chosen sink and path to
     remind the user about coverage expectations.

   - **No sink (`sink == none`).** Kubit becomes the sole sink via
     `source-otel-genai.md` §3. The standalone bootstrap calls the
     SDK's one-liner — `configure(api_key=..., service_name="…")`
     on Python; `configure({ apiKey, serviceName: "…" })` on
     TypeScript — which stands up a Kubit-owned `TracerProvider` and
     registers it globally. Every detected `TracerProvider`-agnostic
     source (`vercel-ai`, `otel-genai`) resolves to it the moment
     the bootstrap runs.

     The Next.js Node/Edge guard from `source-vercel-ai.md` §2/§3
     applies when `vercel-ai` is in `sources_detected`. Wire only
     into the Node runtime — prefer `instrumentation.node.ts` when
     the repo has a `.ts`/`.node.ts` split, or gate the bootstrap
     import on `process.env.NEXT_RUNTIME === 'nodejs'`.

   - **Substitute service metadata placeholders** in Python and TS
     snippets before showing any diff, **only when present** (i.e.
     only in forms that carry `service_name=…` /
     `service_version=…` kwargs to `configure()` / `attach()` in
     Python, or a `serviceName: …` / `serviceVersion: …` field on
     `configure({...})` in TS — and any `resource_attributes={...}` /
     `resourceAttributes: {...}` literal that names the service).
     Resolve from `pyproject.toml` — `[project].name` /
     `[project].version`, falling back to `[tool.poetry].name` /
     `[tool.poetry].version` (Python repos); or `package.json#name`
     / `package.json#version` (TS repos). If neither is present,
     fall back to the normalised repo directory name (lowercase;
     spaces/underscores → hyphens) and `"0.1.0"`. Any
     `"deployment.environment": "dev"` line in Python is a literal —
     the user is expected to edit it per deploy target. These are
     scaffolded values, not runtime config; bake them in as string
     literals so the user can grep and edit after emission.

   - **Hook into `python-dotenv` when present.** If `python-dotenv`
     is among the project's deps and the project's existing
     entrypoint calls `load_dotenv()`, the standalone Python
     bootstrap file must also call `load_dotenv()` at the top —
     before reading any env var. Otherwise the bootstrap fires
     before `main()` runs `load_dotenv()`, so env-driven knobs
     (`KUBIT_API_KEY`, `BRAINTRUST_OTEL_COMPAT`, …) are unset at
     bootstrap time and the user has to remember to `export`
     everything in their shell instead. Verbatim addition to the top
     of the Python bootstrap (right under the header comment, before
     any `os.environ.get` reads):
     ```python
     from dotenv import load_dotenv
     load_dotenv()
     ```
     Skip this when no `python-dotenv` dep is present. TS bootstraps
     are unaffected — Node loads `.env` separately via
     `--env-file`/`dotenv` packaging.

   - **Search for an existing wiring site** using the adapter's §3a
     patterns. Scan the full repo, not just the entrypoint.

   - **Classify the result and act:**

     - *Single clean site* → merge the Kubit wiring into that file.
       Show a diff against the proposed edit and require explicit
       user approval before writing. When merging, the adapter's §4
       wire-in instruction is already satisfied inline; there is no
       separate "add this import to main.py" step.
     - *Multiple candidates* → list them and ask the user which file
       to merge into. Offer `none — emit standalone bootstrap file`
       as an explicit option. No silent pick.
     - *No site found* → fall back to the standalone bootstrap file
       **plus an entrypoint edit**. Writing the file alone is not
       enough; the user must never be left to paste the import in
       manually as the default outcome.
       - Language: detect from manifests (`pyproject.toml` /
         `requirements.txt` → Python; `package.json` → TS). If both
         are present, prefer the language of the dominant detected
         adapter (e.g. `vercel-ai` forces TS); ask the user if still
         ambiguous.
       - Python write target for the bootstrap file:
         - **src-layout** — if exactly one `src/<pkg>/__init__.py`
           exists, write `src/<pkg>/kubit_instrumentation.py`;
           import path `from <pkg> import kubit_instrumentation`.
         - **flat-layout** — else if exactly one top-level
           `<pkg>/__init__.py` exists where `<pkg>` matches
           `[project].name` (hyphens → underscores) from
           `pyproject.toml`, write `<pkg>/kubit_instrumentation.py`
           and use the same import path.
         - **script / ambiguous** — else write
           `kubit_instrumentation.py` at repo root; import path
           `import kubit_instrumentation`. If multiple candidate
           packages exist, ask which to target.

         When placing inside a package, reuse the existing
         `__init__.py`; do not create one.
       - TypeScript write target — mirror the project's TS source
         layout:
         - If a `src/` directory exists at repo root and contains
           `.ts` files → write `src/kubit-instrumentation.ts`.
         - Else → write `kubit-instrumentation.ts` at repo root.
         - **Next.js (Vercel AI) override** — per the Node/Edge split
           in `source-vercel-ai.md` §4, the target file is
           `instrumentation.node.ts`. Place it next to any existing
           `instrumentation.*`; fall back to the layout rule above
           when no existing `instrumentation.*` is present.

         Compute the import statement from the bootstrap path
         relative to the entrypoint's directory (same directory →
         `import './kubit-instrumentation';`; bootstrap under `src/`,
         entrypoint at repo root →
         `import './src/kubit-instrumentation';`; entrypoint under
         `src/`, bootstrap at repo root →
         `import '../kubit-instrumentation';`). Substitute the
         result for `{{KUBIT_IMPORT_STATEMENT}}` on the TS path.
       - Use the adapter's §3 standalone-form snippet verbatim,
         replacing `<YYYY-MM-DD>` in the header with today's date.
       - **Locate the entrypoint** to wire the import into. The
         position spec comes from the chosen adapter's §4. Candidate
         patterns:
         - Python: a file at repo root or under `src/<pkg>/` named
           `main.py`, `__main__.py`, `cli.py`, `app.py`, `server.py`,
           or any file whose body initializes the detected sink
           (e.g. `from langfuse import`,
           `from braintrust.otel import`) or exposes a top-level
           `if __name__ == "__main__"`. Also honour
           `[project.scripts]` / `[tool.poetry.scripts]` targets in
           `pyproject.toml` as entrypoint hints.
         - TypeScript: `src/index.ts`, `src/main.ts`, `src/server.ts`,
           `instrumentation.node.ts` / `instrumentation.ts` (Next.js),
           the file referenced by `package.json`'s `main`, or the
           script target of `scripts.start` / `scripts.dev`.
       - **Classify and act on the entrypoint search:**
         - *Exactly one candidate* → propose a diff inserting
           `{{KUBIT_IMPORT_STATEMENT}}` at the position required by
           the adapter's §4. Apply after explicit user approval.
         - *Multiple candidates* → list them and ask the user to pick
           exactly one. Include `none — print the instruction instead`
           as an explicit option so the user can still bail.
         - *No candidates* → ask the user once for the entrypoint
           path. If they decline or the path is still unresolved,
           fall through to the printed-instruction close-out (step
           9's third terminal state). Do not invent a path.

   - **Always show a diff** before writing (file writes, merges, and
     entrypoint edits alike). No silent overwrite, no silent merge,
     no silent entrypoint insertion. If a target already exists with
     conflicting content, diff and ask.

   - **Record the outcome** for the close-out. Three possible shapes:
     - *merge* — merged into one existing file; record the path.
     - *standalone + entrypoint edit* — bootstrap file path **and**
       entrypoint file path.
     - *standalone + no entrypoint edit* — bootstrap file path only;
       the adapter §4 text will be printed in step 9 as a
       manual-paste fallback.

9. **Close-out.** Print exactly three blocks, in this order:

   1. A single status line, branched on step 4's `workspace_action`
      and step 5's `key_source`. Drop the word "new" on the `pasted`
      branch — the key was supplied by the user, not freshly minted.
      - `key_source == minted`:
        - `created`  → `Kubit workspace "<name>" created; API key written to <file>`
        - `switched` → `Kubit workspace "<name>" selected; new API key written to <file>`
        - `used`     → `Kubit workspace "<name>" selected; new API key written to <file>`
      - `key_source == pasted`:
        - `created`  → `Kubit workspace "<name>" created; API key written to <file>`
        - `switched` → `Kubit workspace "<name>" selected; API key written to <file>`
        - `used`     → `Kubit workspace "<name>" selected; API key written to <file>`

      Substitute the chosen env file name; use the fallback wording
      when the write was skipped.

   2. A wiring line describing where Kubit landed. Sink-present and
      sole-sink cases share the same three terminal shapes; vary the
      surrounding phrasing:

      - **Sink present.**
        - *Merge path* → `Kubit wiring merged into <path> alongside <sink>.`
        - *Standalone + entrypoint edit* →
          `Kubit bootstrap written to <bootstrap-path> alongside <sink>; import added to <entrypoint-path>.`
        - *Standalone + no entrypoint edit* (fallback) → the wire-in
          instruction from the sink adapter's §4 with every
          `{{KUBIT_IMPORT_STATEMENT}}` token replaced by the import
          statement chosen in step 8. Prefix with `Kubit wiring
          landed alongside <sink>, but no entrypoint edit was
          applied — add the import manually:`.

      - **No sink (sole sink).**
        - *Merge path* →
          `Kubit is the sole sink for <sources>; wiring merged into <path>.`
        - *Standalone + entrypoint edit* →
          `Kubit is the sole sink for <sources>; bootstrap written to <bootstrap-path>; import added to <entrypoint-path>.`
        - *Standalone + no entrypoint edit* → the wire-in instruction
          from the source adapter's §4 (template-delegating sources
          inherit `source-otel-genai.md` §4) with
          `{{KUBIT_IMPORT_STATEMENT}}` substituted. Prefix with
          `Kubit is the sole sink for <sources>, but no entrypoint
          edit was applied — add the import manually:`.

   3. The verification command from the chosen adapter's §5, with the
      same token substitution applied.

   When a Python snippet was emitted (merged or standalone) **and it
   contains `service_name=`/`service_version=`/`resource_attributes=`**
   (i.e. any form that carries standalone `configure(...)` with
   those kwargs), append one more line after the verification
   command: *"Verify `service_name`, `service_version`, and
   `deployment.environment` in `<path>` before running the
   verification command."* Substitute `<path>` with the merge target
   or the standalone bootstrap file. For snippets that attach via
   `add_span_processor()` / `attach()`, omit this line — the host
   framework wiring owns the resource metadata. TS snippets never
   contain Python-shaped service metadata, so this line does not
   apply on the TS path.

   When `vercel-ai` is in `sources_detected` and the repo is a Next.js
   app (`next.config.*` present at repo root, or `next` declared in
   `package.json`), append one more line after the verification
   command (and after the Python service metadata line, when that
   applies): *"Next.js's built-in OTel auto-instrumentation will
   parent every Vercel AI span on an HTTP route span that Kubit's
   default filter drops, leaving the AI spans orphaned and no traces
   emitted. Wrap each top-level `streamText` / `generateText` /
   `embed*` / `generateObject` / `streamObject` call in
   `context.with(ROOT_CONTEXT, () => …)` from `@opentelemetry/api`
   to detach it from the HTTP span. See `source-vercel-ai.md` §3 for
   the snippet."* The skill does not edit route handlers — surfacing
   the workaround is enough; the user owns the wrap.

   When `langchain` is in `sources_detected`, append one more line
   after the verification command (and after the Python service
   metadata and Vercel AI Next.js reminders, when those apply). The
   wording branches on the chosen sink and (for Braintrust) the
   path picked in step 1's detection trap:

   - **Langfuse sink:** *"LangChain emits spans via the Langfuse
     callback handler — pass it to every `chain.invoke(…)` you want
     traced. See `source-langchain.md` §3 for the snippet."*
   - **Braintrust sink, Path A** (native callback): *"LangChain
     spans flow to Braintrust via `BraintrustCallbackHandler`.
     **Kubit does not see LangChain spans on this path** (verified
     `braintrust==0.16.0`, April 2026). Re-run `/kubit-integrate`
     and choose Path B in the LangChain+Braintrust prompt to enable
     Kubit coverage. See `source-langchain.md` §3 / §6."*
   - **Braintrust sink, Path B (Python — OTel-native):** *"LangChain
     spans flow via `LangchainInstrumentor().instrument()` plus the
     matching LLM-client instrumentor — coverage is process-wide
     once instrumented, no per-call `callbacks: [...]` threading
     required. Verify the LLM-client instrumentor matches the model
     SDK the chain actually uses; mismatched instrumentors silently
     produce no spans. See `source-langchain.md` §3."*
   - **Braintrust sink, Path B (TypeScript — parallel pipelines,
     recommended):** *"LangChain spans flow to Braintrust via
     `BraintrustCallbackHandler` (callback path, unchanged) and to
     Kubit via `@arizeai/openinference-instrumentation-langchain`
     on a separate `NodeSDK` — the two run in parallel, no shared
     OTel pipeline. Do not install
     `@traceloop/instrumentation-langchain` — it discards
     `parentRunId` and produces disconnected spans (see Gotchas).
     See `source-langchain.md` §3 Path B (TS) for the bootstrap
     snippet."*

   The snippet itself was already surfaced in step 8's LangChain
   hand-off; these reminders set the user's expectation about
   coverage and threading.

   Do not run the verification command; it runs against the user's
   environment.

## Rules

- Never fetch trace data or metrics; delegate to `/kubit-inspect` or
  `/kubit-report`.
- Never echo the minted `KUBIT_API_KEY` back to the user once
  received. The detected env file is the only write target; the
  shell-export fallback prints it exactly once (step 6) and never
  again.
- A pasted `KUBIT_API_KEY` (step 5's `pasted` branch) is treated
  identically to a minted one once accepted: never echoed, never
  logged, written only to the detected env file or the print-export
  fallback. The skill does not validate the pasted key against the MCP
  server — workspace-scope correctness is the user's responsibility,
  surfaced via the step 5 warning.
- Never call Kubit ingestion from inside the skill. No test spans.
  No connectivity probes. The user runs the verification command
  themselves.
- Write the key only to the detected env file at repo root
  (`.env.local` or `.env`). Never write to secret stores, dotenv-vault
  files, CI config, or production env files (`.env.production`) unless
  the user explicitly asks.
- Never set instrumentation up for a framework the user has not
  installed — "install Langfuse for me" is explicitly out of scope.
  The install in step 7 only covers the Kubit SDK (plus any
  sink-adapter-specific Kubit-side extras per its §4); it never
  installs the sink vendor's SDK or a source framework itself.
- Never edit the manifest without running the install, and never run
  the install without the manifest edit (step 7). The two happen
  together or not at all.
- Never silently pick a merge target or silently overwrite existing
  files in step 8. Every write goes through a diff and an explicit
  user approval; multi-candidate merges require the user to pick.
- On the standalone-fallback path, the agent commits to an entrypoint
  edit (with diff + approval) rather than printing prose that leaves
  the user to paste. Printed prose is a degraded last-resort
  fallback, not the default outcome.
- At most one sink drives wiring per run. When multiple are detected
  the user picks exactly one in step 2; the others are ignored for
  the run. Re-running `/kubit-integrate` against the same repo
  selects a different sink if the user asks.
- Create at most one workspace per run. `workspace_create` runs only
  on step 4's "create new" branch; the "use current" and "switch to
  existing" branches never create a workspace. On any
  `workspace_create` or `switch` failure, surface the error and stop
  — no silent retry.
- `@opentelemetry/sdk-trace-node` is Node-only and cannot load in
  Edge / Workers / browser runtimes. `@kubit-ai/otel`'s `configure()`
  imports `NodeTracerProvider` from `@opentelemetry/sdk-trace-node`
  at module load, so the Edge-crash story is inherited by every
  Kubit-side wiring path. For any repo whose entrypoint straddles
  runtimes (Next.js `instrumentation.ts`, Cloudflare Workers, Vercel
  Edge, Deno), the skill must wire Kubit only into the Node runtime
  — either by choosing `instrumentation.node.ts` over
  `instrumentation.ts` (Next.js splits on file suffix when present),
  or by gating the Kubit bootstrap import on
  `process.env.NEXT_RUNTIME === 'nodejs'`. Never import the Kubit
  bootstrap (or `@kubit-ai/otel`, or its `@opentelemetry/sdk-trace-node`
  peer) from code that can be evaluated in an Edge runtime.

## Error Handling

Grouped by phase. Each bucket shares the same end state; specific
messages are in the sub-bullets.

1. **Detection-phase exits.** No wsctx touch, no workspace, no writes.
   - Neither sinks nor sources detected → print the friendly
     "no tracing detected" message (step 2) and exit 0.
   - Direct LLM SDK detected with no supported source → print the
     "direct SDK, no source" message from step 2 and exit 0.
   - Confirmation declined → exit 0.
   - Multi-sink prompt aborted → exit 0.
   - Adapter file missing *or* an unsubstituted `KUBIT_*` template
     marker (e.g. a literal double-brace `KUBIT_CONFIG_DIR` reference)
     still present in the adapter body → fatal: *"Skill install is
     corrupt: re-run `npx @kubit-ai/agent-plugin`."*
   - Braintrust Prerequisites declined (step 8) → exit 0 with
     *"Skipped Braintrust instrumentation. Re-run after enabling
     OTel-compat mode for your project."*

2. **Workspace context unavailable.** No wsctx in context and
   `/kubit-connect` fails or is aborted → exit 0 with *"No active
   Kubit workspace context — re-run `/kubit-integrate` after
   `/kubit-connect`."*

3. **Timezone input.** Invalid IANA value → re-prompt once; on a second
   invalid value exit 0 with *"Invalid timezone — run `/kubit-integrate`
   again when ready."*

4. **MCP errors.** Surface the server message and exit 0; the
   workspace-state context differs by phase.
   - `switch` fails → the wsctx is unchanged (still pinned to the
     previous workspace); no mint, no write, no instrumentation.
   - `workspace_create` fails → nothing was created; no mint, no write,
     no instrumentation.
   - `workspace_mint_key` fails → workspace already exists. Append
     *"Workspace '<name>' created but key mint failed — re-run
     `/kubit-integrate`, or use `/kubit-connect switch` to reuse the
     workspace."*
   - `workspace_mint_key` rejects `note` (length or empty) → this is a
     skill bug — the computed default is always trimmed to 255 chars
     with a non-empty fallback. Surface the server message verbatim
     and exit 0 without retry.
   - Mint response missing the key field → fatal: *"workspace_mint_key
     succeeded but no key in response — report to #kubit."*
   - Paste branch: empty input twice → exit 0 with *"No key provided —
     re-run `/kubit-integrate` when ready."* No env-file write, no
     install, no wiring.

5. **Write-phase issues.** Degrade gracefully; never block
   instrumentation once the key is in hand.
   - CWD is not a git repo → warn once (*"Not inside a git checkout —
     generated files won't be tracked."*) and continue.
   - Chosen env file not gitignored → fall through to the print-export
     fallback (step 6); continue with install + wiring.
   - Merge target or bootstrap-file collision → diff and ask; never
     overwrite silently.
   - Multi-candidate merge with no user pick → print the adapter's §3
     reference snippet for manual paste and exit 0.
   - User declines the diff → print the adapter's §3 snippet inline for
     manual paste; exit 0. The env-file write and the dep install
     stand; the user can merge later.

6. **Dependency-install issues (step 7).** The manifest edit stays in
   place; the wiring step still runs so the user ends up with a
   diffable change.
   - Install command fails (network, resolver conflict, permission) →
     surface stderr verbatim, tell the user to install manually, then
     continue to step 8. The close-out calls this out so the user
     knows verification will fail until the install succeeds.
   - Unsupported package manager (no recognised lockfile, no
     `pyproject.toml`, no `package.json`) → skip the install, print
     *"Could not detect a package manager — install `<deps>`
     manually."*, and continue to step 8.

## Examples

**Sink + hybrid source (Langfuse OTel shape).**
Input: *"re-issue my Kubit key and wire the exporter"*
Output: Detected sink `langfuse` (OTel shape — `@langfuse/otel` in
`package.json`). Workspace context from `/kubit-connect` shows current
workspace `payments-prod` in org `acme`. Skill prints current + other
workspaces, user picks option 1 (use current). Mints a fresh key,
writes `KUBIT_API_KEY` into `.env`, installs `@kubit-ai/otel` plus
its OTel JS v2 peers, slots `new KubitSpanProcessor({ apiKey: ... })`
into the existing `@langfuse/otel` site's `spanProcessors: [...]`
array. Close-out prints:
```
Kubit workspace "payments-prod" selected; new API key written to .env
Kubit wiring merged into src/payments/otel.ts alongside langfuse.
Verify with: node -e "..."
```

**Source-only (Vercel AI, Kubit as sole sink).**
Input: *"turn on Kubit for this Next.js app"*
Output: Detected source `vercel-ai`, no sinks. Confirms Kubit will
be the sole sink. Onboards workspace, mints key, writes `.env.local`,
runs `pnpm add @kubit-ai/otel @opentelemetry/api @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-node`.
Falls through to `source-otel-genai.md` §3 TS template (Vercel AI
delegates to it). Next.js layout: chooses
`instrumentation.node.ts` over `instrumentation.ts` to avoid the
Edge runtime. Standalone bootstrap + entrypoint edit applied.
Close-out:
```
Kubit workspace "vercel-demo" created; API key written to .env.local
Kubit is the sole sink for vercel-ai; bootstrap written to src/kubit-instrumentation.ts; import added to src/instrumentation.node.ts.
Verify with: node -r ts-node/register -e "..."
```

**Empty repo.**
Input: *"set up kubit tracing"*
Output: *"No LLM tracing detected in this repo. `/kubit-integrate`
recognises sinks (Langfuse, Braintrust) and sources (Vercel AI,
OpenTelemetry GenAI). Add one and re-run, or reach out on #kubit."*
Exit 0.

**Direct SDK, no source.**
Input: *"hook this Next.js app up to Kubit"*
Output: Detects `@anthropic-ai/sdk` and `langfuse` in `package.json`;
no `ai` / `@ai-sdk/*`, no LangChain, no OTel GenAI markers. Prints
*"Detected direct LLM SDK usage (`anthropic`) but no supported
source. ..."* and exits 0. No `/kubit-connect` invocation, no
workspace, no `.env.local` write.

**`.env` not gitignored.**
Input: *"turn on Kubit"*
Output: Detects a sink, onboards workspace, mints key. `.env` write
skipped with the print-export fallback. Proceeds through install and
wiring as normal.

**Install fails.**
Input: *"hook me up to Kubit"*
Output: Detects a sink, onboards, mints, writes env. The install
command returns a resolver conflict; stderr is echoed and the user
is told to resolve the conflict and run the install manually. Wiring
still proceeds so the user has a diffable change; the close-out
flags that verification will fail until the install is fixed.

## Gotchas

_Populated as real-repo verification surfaces issues. A sink/source
is ready-to-ship when it has ≥ 1 clean verification run and all items
here are either resolved or documented._

- [ ] `sink-langfuse.md` — verified against one real repo (regression
      check against prior Langfuse-only skill)
- [ ] `sink-braintrust.md` — needs re-verify after the §3 `parent=`
      fix and the §3 skip-guard reason rewrite (April 2026 update).
- [ ] `source-vercel-ai.md` — verified Kubit-as-sole-sink with Next.js Node/Edge split
- [ ] `source-otel-genai.md` — verified as sole-sink template
- [ ] `source-langchain.md` — Path B (OTel-native, Python) verified
      end-to-end (April 2026). Path B TS (parallel pipelines with
      OpenInference) verified end-to-end (April 2026). Path A
      (native callback) needs re-verify after the §3 / §6
      Kubit-doesn't-see-spans note.

**Verified gotchas (April 2026):**

- **`wrapt 2.x` breaks `opentelemetry-instrumentation-{langchain,
  anthropic,openai,…}` v0.60.0 at instrument-time.** Symptom:
  `TypeError: wrap_function_wrapper() got an unexpected keyword
  argument 'module'` raised the first time the instrumentor's
  `_instrument()` runs. The OpenLLMetry instrumentors call
  `wrap_function_wrapper(module=…, name=…, wrapper=…)`, and `wrapt
  2.x` removed the `module=` kwarg. Fix: pin `wrapt<2` in the
  manifest. `braintrust >= 0.16.0` accepts `wrapt >= 1.0.0, <
  3.0.0`, so the pin does not conflict. Caught by step 7's manifest
  edit when `langchain_braintrust_path == B`.
- **`BraintrustSpanProcessor()` with no args silently routes to
  `default-otel-project`.** The processor reads only
  `BRAINTRUST_PARENT`, not the more widely-used `BRAINTRUST_PROJECT`;
  with neither set, the parent silently defaults to
  `"project_name:default-otel-project"` and prints a warning. Fix:
  always pass `parent=f"project_name:{BRAINTRUST_PROJECT}"` (Python)
  / equivalent on TS. Caught by `sink-braintrust.md` §3.
- **`BRAINTRUST_OTEL_COMPAT=true` does not bridge
  `BraintrustCallbackHandler` into OTel** (verified
  `braintrust==0.16.0`, April 2026). The env var only changes ID
  format (`braintrust/id_gen.py:13`), context propagation
  (`braintrust/context.py:123`), and `span.export()` wire format
  (`braintrust/logger.py:150,4394`); it does not route the LangChain
  callback handler's spans through the global `TracerProvider`. To
  get LangChain spans into Kubit on the Braintrust path, use Path B
  (`opentelemetry-instrumentation-langchain` plus a matching
  LLM-client instrumentor — see `source-langchain.md` §3). The
  skill's prior `BRAINTRUST_OTEL_COMPAT` routing claim was incorrect
  and has been removed.
- **`@traceloop/instrumentation-langchain` (TS) is broken** (April
  2026). Discards `parentRunId` in every callback handler — calls
  `tracer.startSpan(...)` with no parent context, producing
  disconnected spans across all sinks. Confirmed by reading the
  package source. Use
  `@arizeai/openinference-instrumentation-langchain` on the
  TS+LangChain+Braintrust path instead — it threads `parentRunId`
  correctly via `trace.setSpanContext(context.active(), parentCtx)`.
  Caught by `source-langchain.md` §3 Path B (TS).
- **`setupOtelCompat()` (TS) does not bridge
  `BraintrustCallbackHandler` into OTel** — TypeScript analog of
  the Python `BRAINTRUST_OTEL_COMPAT` issue above. Only swaps
  Braintrust's internal context manager / ID generator / span
  components for OTel-aware versions. The TS bootstrap on the
  LangChain path drops both `setupOtelCompat()` and
  `BraintrustSpanProcessor` from the Kubit-side wiring; Braintrust
  still works via its callback (Path A) unchanged. The existing
  `setupOtelCompat()` + `BraintrustSpanProcessor` shape is still
  correct in non-LangChain TS combinations (Vercel AI, manual
  OTel) where the user emits OTel spans directly.
- **Next.js auto-instrumentation parents Vercel AI spans on the
  HTTP route span** (verified `next@15.x`, `ai@4.x`, April 2026).
  Registering a global `TracerProvider` activates Next.js's
  built-in OTel auto-instrumentation; the route's HTTP span
  (`scope=next.js`) becomes the parent of every AI SDK span,
  which makes the trace shape less useful in the Kubit dashboard
  than it should be. Fix: wrap each top-level Vercel AI SDK call
  in `context.with(ROOT_CONTEXT, () => …)` from
  `@opentelemetry/api` to re-root it. Surfaced in
  `source-vercel-ai.md` §3 and in the step 9 close-out when
  `vercel-ai` + Next.js are detected.
