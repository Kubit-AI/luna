---
name: integrate
description: Use this skill when the user wants to start shipping their existing LLM tracing into Kubit. Detects which tracing framework the user's repo uses (Braintrust, Langfuse, LangSmith, Logfire, OpenAI Agents, OpenInference/Arize Phoenix, OpenLLMetry/Traceloop, Vercel AI SDK, or OpenTelemetry GenAI), creates a fresh Kubit workspace, mints an ingestion key, writes it to the repo's env config (`.env.local` or `.env`), installs the Kubit SDK (`kubit-otel` / `@kubit-ai/otel`) via the project's package manager, and wires Kubit's span processor into the existing OTel setup — merging into the current wiring site when one exists, falling back to a standalone bootstrap file otherwise.
---

# /kubit-integrate

## Overview

This skill is the single "turn on Kubit ingestion" flow. Given a repo that
already uses a supported LLM tracing framework, it:

1. Ensures a Kubit session exists (delegating to `/kubit-connect` if not).
2. Creates a new Kubit workspace for this app (interactive onboarding).
3. Mints an ingestion key against that workspace.
4. Writes the key into the repo's env config — `.env.local` or `.env`,
   whichever matches the project's conventions (gitignore-checked).
5. Installs the Kubit SDK (`kubit-otel` / `@kubit-ai/otel`) plus any
   framework extras via the project's package manager.
6. Wires Kubit's span processor alongside the user's existing OTel
   setup — merging into the existing wiring site when one exists,
   falling back to a standalone bootstrap file otherwise.

Nine frameworks are supported; one framework per run; one workspace per
run.

## When to Use

- The user wants traces from their existing app to appear in Kubit and
  does not yet have a Kubit exporter wired in.
- The user asks how to send their braintrust / langfuse / langsmith /
  logfire / openai-agents / openinference / openllmetry / vercel-ai /
  otel-genai traces to Kubit. These adapter names (the filenames in
  `references/frameworks/`) are the canonical form; SDK brand names
  (Arize Phoenix → `openinference`, Traceloop → `openllmetry`,
  Pydantic Logfire → `logfire`, Vercel AI SDK / `ai` / `@ai-sdk/*` →
  `vercel-ai`) are aliases.
- Do NOT use to debug failing traces (that's `/kubit-inspect`), explain
  a metric regression (`/kubit-report`, `/kubit-blame`), or switch
  between existing org/workspace contexts (`/kubit-connect`).

## Inputs

- The skill takes no flags; everything is inferred from the current
  working directory plus interactive prompts for the new workspace's
  name and timezone.

## Workflow

1. **Detect tracing framework.** Grep the user's current working
   directory (their application repo, NOT this skill's install dir) for
   dependency signals from each adapter. Adapter files live at:
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-integrate/references/frameworks/<fw>.md`

   Adapters to check (§1 of each for the grep patterns):
   - `braintrust.md`
   - `langfuse.md`
   - `langsmith.md`
   - `logfire.md`
   - `openai-agents.md`
   - `openinference.md`
   - `openllmetry.md`
   - `vercel-ai.md`
   - `otel-genai.md`

   Check `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`,
   and a shallow scan of top-level imports.

2. **Framework pick.**
   - 0 matches → print *"No supported tracing framework detected.
     Supported: braintrust, langfuse, langsmith, logfire, openai-agents,
     openinference, openllmetry, vercel-ai, otel-genai. Add one of these
     first, or reach out on #kubit."* and exit.
   - 1 match → confirm with the user: *"Detected `<fw>`. Instrument it?
     [y/N]"*. Exit on no.
   - ≥ 2 matches → list detections and ask the user to pick exactly one.
     Do not accept "all"; the user can re-run for a second framework.

3. **Adapter prerequisite gate.** If the picked adapter's §2 contains a
   `### Prerequisites` subsection, print that subsection verbatim and
   require an explicit `y/N` opt-in. Default is no. If the user declines
   or does not respond `y`, exit 0 with the adapter's stated decline
   message and write nothing — no session touch, no workspace created.
   This gate exists for adapters whose wiring changes load-bearing
   behavior in the user's existing pipeline (e.g. `braintrust`, which
   needs OTel-compat mode enabled).

4. **Ensure Kubit session.** If the conversation already holds a
   `SESSION` value (from a prior `/kubit-connect init` or `switch`),
   reuse it. Otherwise, invoke `/kubit-connect` and resume here once it
   returns a session. If the user aborts `/kubit-connect` or it fails to
   establish a session, exit 0 with *"No active Kubit session — re-run
   `/kubit-integrate` after `/kubit-connect`."* Do not write anything.

5. **Workspace onboarding — always create a new workspace.**
   - Prompt for **workspace name** (free-text; required). One workspace
     per instrumented app is the expected shape, so a repo-descriptive
     name is a good default suggestion.
   - Prompt for **timezone**. Detect a default with a best-effort
     one-liner (prefer
     `node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)"`;
     fall back on macOS/Linux to
     `readlink /etc/localtime 2>/dev/null | sed -n 's|.*/zoneinfo/||p'`;
     fall back to `UTC`). Show the detected value and let the user press
     enter to accept, or supply a valid IANA name (e.g.
     `America/Los_Angeles`, `Europe/Berlin`).
   - Show a single review line — `name=<value>, timezone=<value>` — and
     ask for an explicit confirm before the MCP call. The user can edit
     either input and re-review.
   - Call `workspace_create { name, timezone, session }`. Warn the user
     the call can take ~30 seconds. The response returns a session
     pinned to the newly created workspace; use that session for the
     next step.

6. **Mint the ingestion key.**
   - Call `workspace_mint_key { session }` against the session returned
     by `workspace_create`. This is the call that produces the value
     `KUBIT_EXPORT_API_KEY` expects — `workspace_create` itself does not
     return an ingestion key.
   - Hold the minted key in memory only. Never log it, never echo it
     back to the user. The only places it is allowed to land are the
     env-file write in step 7 or the fallback `export` line.

7. **Write the API key and endpoint to the project's env config.**
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
         of the tracing framework detected in step 1.
   - Verify the chosen target is gitignored: `git check-ignore -q <path>`.
     If exit code is 0, proceed to write. If non-zero (not ignored, or
     no git repo), skip the write and jump to the print-export fallback
     below; continue with instrumentation emission anyway.
   - Upsert both `KUBIT_EXPORT_API_KEY=<minted-value>` and
     `KUBIT_EXPORT_ENDPOINT={{KUBIT_EXPORT_ENDPOINT}}` into the chosen file.
     For each key independently:
     - If the file exists and already contains a line with that key,
       replace that single line in place — do not reorder other keys,
       do not touch comments. Preserve the file's trailing newline.
     - If the file exists but has no line for that key, append it as
       its own line at the end of the file.
     - If the file is missing, create it with both lines.
   - **Fallback (gitignore check failed):** print a single line
     *"`<file>` not gitignored — printing export lines instead to avoid
     committing the key:"* followed by both
     `export KUBIT_EXPORT_API_KEY=<minted-value>` and
     `export KUBIT_EXPORT_ENDPOINT={{KUBIT_EXPORT_ENDPOINT}}`. This is the
     only place the key is allowed to leave the env-file write target.
     Continue to step 8.

8. **Install the Kubit SDK and framework extras.** The coding agent
   both edits the project's manifest and runs the install — not one or
   the other.

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
   - **Compute the dep list** from the adapter's §4 *Required deps*
     block for the detected language. Some adapters carry framework
     extras (e.g. braintrust Python needs `"braintrust[otel]>=0.3.1"`
     in addition to `kubit-otel`; braintrust TS also needs
     `@opentelemetry/sdk-node`). Always include `kubit-otel` /
     `@kubit-ai/otel`.
   - **Edit the manifest first, then install.** Add the deps to
     `pyproject.toml` / `requirements.txt` / `package.json` matching
     the project's existing style (e.g. `[project.dependencies]` vs
     `[tool.poetry.dependencies]`; exact / caret / tilde pinning; the
     dep list's existing sort order). Then run the matching install
     command (`uv add …`, `poetry add …`, `pip install …`,
     `pnpm add …`, `yarn add …`, `bun add …`, `npm install …`). Never
     edit the manifest without running the install, and never run the
     install without the manifest edit.
   - **Failure handling.** If the install command fails, surface
     stderr verbatim, leave the manifest edit in place, and tell the
     user to install manually before running the verification
     command. Continue to step 9 — missing install blocks
     verification, not emission.

9. **Wire Kubit into the existing tracing setup.** The adapter's §3
   snippet is the *specification* of what Kubit code must end up in the
   program (import + `KubitSpanProcessor` / `configure` / `attach`
   call, plus any assertions §3 carries). Treat placement and
   syntactic style (variable names, import grouping, sync vs async,
   quote style) as adaptable — match the surrounding file's
   conventions.

   **`configure()` vs `attach()` in adapter §3 snippets.** As of
   kubit-otel 0.4.0 the two public entry points behave differently:
   - `configure(...)` creates a fresh `TracerProvider` and registers
     it as the global if none exists, or attaches `KubitSpanProcessor`
     to the existing real provider (merging resource attrs) if one is
     already installed. Use it when the user — or a framework that
     composes with an existing provider (Langfuse, LangSmith, generic
     OTel-GenAI, OpenAI Agents, Braintrust's gated setup) — owns
     provider registration.
   - `attach(...)` only attaches; it raises if no real provider is
     installed. Adapter §3 uses it for frameworks that install their
     own `TracerProvider` inside their setup call and would lose their
     registration if kubit-otel claimed the global first (Logfire
     standalone form, OpenInference/Phoenix, OpenLLMetry/Traceloop).
     The raise is the loud-failure guardrail for misordering.

   Emit whichever helper the picked adapter's §3 snippet uses — do
   not substitute one for the other.

   - **Substitute service metadata placeholders** in Python snippets
     before showing any diff, **only when present**. `attach()`
     snippets (logfire/openinference/openllmetry standalone form) do
     not carry service metadata and require no substitution — the
     host framework owns the resource. For snippets that do contain
     `service_name=`/`service_version=`, resolve them from
     `pyproject.toml` — `[project].name` / `[project].version`,
     falling back to `[tool.poetry].name` / `[tool.poetry].version`.
     If neither is present, fall back to the normalised repo
     directory name (lowercase; spaces/underscores → hyphens) and
     `"0.1.0"`. When `resource_attributes=` is present, emit
     `{"deployment.environment": "dev"}` as a literal — the user is
     expected to edit this per deploy target. These are scaffolded
     values, not runtime config; bake them in as string literals so
     the user can grep and edit after emission.

   - **Search for an existing wiring site** using the adapter's §3a
     *Integration-site signals* patterns (e.g. a `phoenix.otel.register(`
     call, a `new NodeSDK({…})`, a `TracerProvider` construction). Scan
     the full repo, not just the entrypoint.
   - **Classify the result and act:**
     - *Single clean site* → merge the Kubit wiring into that file.
       Show a diff against the proposed edit and require explicit user
       approval before writing. When merging, the adapter's §4 wire-in
       instruction is already satisfied inline; there is no separate
       "add this import to main.py" step.
     - *Multiple candidates* → list them and ask the user which file
       to merge into. Offer `none — emit standalone bootstrap file`
       as an explicit option. No silent pick.
     - *No site found* → fall back to the standalone bootstrap file
       **plus an entrypoint edit**. Writing the file alone is not
       enough; the user must never be left to paste the import in
       manually as the default outcome.
       - Language: detect from manifests (`pyproject.toml` /
         `requirements.txt` → Python; `package.json` → TS). If both
         are present, prefer the language of the matched framework's
         primary SDK per adapter §1; ask the user if still ambiguous.
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
       - TypeScript write target: `kubit-instrumentation.ts` at repo
         root; import statement `import './kubit-instrumentation';`.
       - Use the adapter's §3 snippet verbatim (standalone form),
         replacing `<YYYY-MM-DD>` in the header with today's date.
       - **Locate the entrypoint** to wire the import into. The
         position spec comes from adapter §4 (e.g. *"first import"*
         for Langfuse, *"after `logfire.configure(...)`"* for
         Logfire, *"before any `Agent(...)` construction"* for
         openai-agents). Candidate patterns:
         - Python: a file at repo root or under `src/<pkg>/` named
           `main.py`, `__main__.py`, `cli.py`, `app.py`, `server.py`,
           or any file whose body calls the framework init
           (`logfire.configure(`, `Traceloop.init(`,
           `phoenix.otel.register(`,
           `OpenAIAgentsInstrumentor().instrument(`) or exposes a
           top-level `if __name__ == "__main__"`. Also honour
           `[project.scripts]` / `[tool.poetry.scripts]` targets in
           `pyproject.toml` as entrypoint hints.
         - TypeScript: `src/index.ts`, `src/main.ts`, `src/server.ts`,
           the file referenced by `package.json`'s `main`, or the
           script target of `scripts.start` / `scripts.dev`.
       - **Classify and act on the entrypoint search:**
         - *Exactly one candidate* → propose a diff inserting
           `{{KUBIT_IMPORT_STATEMENT}}` (Python) or
           `import './kubit-instrumentation';` (TS) at the position
           required by adapter §4. Apply after explicit user approval.
         - *Multiple candidates* → list them and ask the user to pick
           exactly one. Include `none — print the instruction instead`
           as an explicit option so the user can still bail.
         - *No candidates* → ask the user once for the entrypoint
           path. If they decline or the path is still unresolved,
           fall through to the printed-instruction close-out (step
           10's third terminal state). Do not invent a path.
   - **Always show a diff** before writing (file writes, merges, and
     entrypoint edits alike). No silent overwrite, no silent merge,
     no silent entrypoint insertion. If a target already exists with
     conflicting content, diff and ask.
   - **Record the outcome** for the close-out. Three possible shapes:
     - *merge* — merged into one existing file; record the path.
     - *standalone + entrypoint edit* — bootstrap file path **and**
       entrypoint file path.
     - *standalone + no entrypoint edit* — bootstrap file path only;
       adapter §4 text will be printed in step 10 as a manual-paste
       fallback.

10. **Close-out.** Print exactly three blocks, in this order:
    1. A single status line:
       `Kubit workspace "<name>" created; API key written to <file>`
       (substitute the chosen env file name; use the fallback wording
       when the write was skipped).
    2. A wiring line describing where Kubit landed. Three possible
       terminal states, determined by step 9:
       - *Merge path* → `Kubit wiring merged into <path>.`
       - *Standalone + entrypoint edit* →
         `Kubit bootstrap written to <bootstrap-path>; import added to <entrypoint-path>.`
       - *Standalone + no entrypoint edit* (fallback) → the wire-in
         instruction from adapter §4 with every
         `{{KUBIT_IMPORT_STATEMENT}}` token replaced by the import
         statement chosen in step 9 (e.g. `import kubit_instrumentation`
         or `from trip_planner import kubit_instrumentation`). This
         is the degraded path — only reached when the user declined
         the entrypoint edit or no entrypoint could be resolved.
    3. The verification command from adapter §5, with the same token
       substitution applied (merge and entrypoint-edit paths: replace
       with `from <pkg> import …` or `./<merged-file>` as appropriate).

    When a Python snippet was emitted (merged or standalone) **and
    it contains `service_name=`/`service_version=`/
    `resource_attributes=`** (i.e. it uses `configure(...)`, not
    `attach(...)`), append one more line after the verification
    command: *"Verify `service_name`, `service_version`, and
    `deployment.environment` in `<path>` before running the
    verification command."* Substitute `<path>` with the merge target
    or the standalone bootstrap file. For `attach()` snippets
    (logfire / openinference / openllmetry standalone), omit this
    line — the host framework owns the resource metadata.

    Do not run the verification command; it runs against the user's
    environment.

## Rules

- Never fetch trace data or metrics; delegate to `/kubit-inspect` or
  `/kubit-report`.
- Never echo the minted `KUBIT_EXPORT_API_KEY` back to the user once
  received. The detected env file is the only write target; the
  shell-export fallback prints it exactly once (step 7) and never
  again.
- Never call Kubit ingestion from inside the skill. No test spans.
  No connectivity probes. The user runs the verification command
  themselves.
- Write the key only to the detected env file at repo root
  (`.env.local` or `.env`). Never write to secret stores, dotenv-vault
  files, CI config, or production env files (`.env.production`) unless
  the user explicitly asks.
- Never set instrumentation up for a framework that wasn't detected —
  "install the framework for me" is explicitly out of scope. The
  install in step 8 only covers the Kubit SDK plus the adapter's §4
  required extras; it does not install the tracing framework itself.
- Never edit the manifest without running the install, and never run
  the install without the manifest edit (step 8). The two happen
  together or not at all.
- Never silently pick a merge target or silently overwrite existing
  files in step 9. Every write goes through a diff and an explicit
  user approval; multi-candidate merges require the user to pick.
- On the standalone-fallback path, the agent commits to an entrypoint
  edit (with diff + approval) rather than printing prose that leaves
  the user to paste. Printed prose is a degraded last-resort
  fallback, not the default outcome.
- Never create more than one workspace per run. If `workspace_create`
  fails, do not retry silently — surface the error and stop.

## Error Handling

Grouped by phase. Each bucket shares the same end state; specific
messages are in the sub-bullets.

1. **Detection-phase exits.** No session touch, no workspace, no writes.
   - No framework detected → print supported list; exit 0.
   - Multiple frameworks detected → user picks one; no "all" option.
   - Adapter file missing *or* `{{KUBIT_EXPORT_ENDPOINT}}` literal still
     present in an adapter body → fatal: *"Skill install is corrupt:
     re-run `npx @kubit-ai/agent-plugin`."*

2. **User-declined gates.** Exit 0, write nothing.
   - Adapter prereq gate declined → adapter's decline message.
   - Framework-pick confirmation declined.
   - Workspace review step aborted.

3. **Session unavailable.** No session in context and `/kubit-connect`
   fails or is aborted → exit 0 with *"No active Kubit session — re-run
   `/kubit-integrate` after `/kubit-connect`."*

4. **Timezone input.** Invalid IANA value → re-prompt once; on a second
   invalid value exit 0 with *"Invalid timezone — run `/kubit-integrate`
   again when ready."*

5. **MCP errors.** Surface the server message and exit 0; the
   workspace-state context differs by phase.
   - `workspace_create` fails → nothing was created; no mint, no write,
     no instrumentation.
   - `workspace_mint_key` fails → workspace already exists. Append
     *"Workspace '<name>' created but key mint failed — re-run
     `/kubit-integrate`, or use `/kubit-connect switch` to reuse the
     workspace."*
   - Mint response missing the key field → fatal: *"workspace_mint_key
     succeeded but no key in response — report to #kubit."*

6. **Write-phase issues.** Degrade gracefully; never block instrumentation
   once the key is in hand.
   - CWD is not a git repo → warn once (*"Not inside a git checkout —
     generated files won't be tracked."*) and continue.
   - Chosen env file not gitignored → fall through to the print-export
     fallback (step 7); continue with install + wiring.
   - Merge target or bootstrap-file collision → diff and ask; never
     overwrite silently.
   - Multi-candidate merge with no user pick → print the adapter's §3
     reference snippet for manual paste and exit 0.
   - User declines the diff → print the adapter's §3 snippet inline for
     manual paste; exit 0. The env-file write and the dep install
     stand; the user can merge later.

7. **Dependency-install issues (step 8).** The manifest edit stays in
   place; the wiring step still runs so the user ends up with a
   diffable change.
   - Install command fails (network, resolver conflict, permission) →
     surface stderr verbatim, tell the user to install manually, then
     continue to step 9. The close-out calls this out so the user
     knows verification will fail until the install succeeds.
   - Unsupported package manager (no recognised lockfile, no
     `pyproject.toml`, no `package.json`) → skip the install, print
     *"Could not detect a package manager — install `<deps>`
     manually."*, and continue to step 9.

## Examples

**Single-framework repo with existing OTel site (merge path):**
Input: *"wire my app to send traces into Kubit"*
Output: Detected `openinference`. No session in context, so
`/kubit-connect` runs; user lands back here with a session. Prompts
for workspace name (`payments-prod`) and timezone (accepts detected
`America/Los_Angeles`). Confirms. Calls `workspace_create`, then
`workspace_mint_key`. Writes `KUBIT_EXPORT_API_KEY` into `.env`
(verified gitignored). Detects `uv.lock` → runs `uv add kubit-otel`
after editing `pyproject.toml`. Greps for §3a signals, finds a single
`phoenix.otel.register(tracer_provider=...)` in `src/payments/otel.py`;
proposes a diff that appends the Kubit processor on the returned
provider; user approves. Prints:
```
Kubit workspace "payments-prod" created; API key written to .env
Kubit wiring merged into src/payments/otel.py.
Verify with: python -c "..."
```

**Single-framework repo with no existing OTel site (standalone + entrypoint edit):**
Input: *"turn on Kubit for this script"*
Output: Detected `langfuse` in a decorator-only app (package
`trip_planner`, uses `@observe` decorators but no explicit
`TracerProvider` construction). Onboards workspace, mints key, writes
env, runs `uv add kubit-otel`. Greps for §3a signals, finds no
wiring site. Falls back to standalone: writes
`src/trip_planner/kubit_instrumentation.py`, shows the diff, user
approves. Then locates the entrypoint — `src/trip_planner/cli.py` is
the only file under `src/trip_planner/` with a top-level
`if __name__ == "__main__"` and a `load_dotenv()` call; proposes a
diff adding `from trip_planner import kubit_instrumentation` as the
first import; user approves. Close-out prints:
```
Kubit workspace "trip-planner" created; API key written to .env
Kubit bootstrap written to src/trip_planner/kubit_instrumentation.py; import added to src/trip_planner/cli.py.
Verify with: python -c "..."
```

**Standalone path, user declines the entrypoint edit:**
Input: *"wire Kubit"*
Output: Same as above up through the bootstrap-file write. The agent
proposes the entrypoint edit; user declines (or says "I'll do it
myself"). The skill falls through to the degraded close-out — adapter
§4 wire-in instruction printed verbatim for manual paste. The
bootstrap file and dep install stand.

**Multi-framework repo:**
Input: *"instrument my repo"*
Output: *"I see two supported frameworks: `langfuse`, `openai-agents`.
Which one produces the traces you want in Kubit?"* — user picks
`openai-agents`; proceeds through onboarding, install, and wiring for
that adapter.

**Multi-candidate merge:**
Input: *"ship traces to Kubit"*
Output: Detected `langfuse`. Two files match §3a (`src/server/otel.ts`
and `src/worker/otel.ts`). Lists both and asks the user which one
the new traces should flow through — or to emit a standalone file
instead. Proceeds with the chosen path.

**Zero-framework repo:**
Input: *"set up kubit tracing"*
Output: *"No supported tracing framework detected. Supported: …. Add
one of these first."* Exit 0. No session touch, no workspace created,
no install, no writes.

**`.env` not gitignored:**
Input: *"turn on Kubit"*
Output: Detects framework, onboards workspace, mints key. `.env` write
skipped with *"`.env` not gitignored — printing export line instead to
avoid committing the key:"* followed by the `export` line. Proceeds
through install and wiring as normal.

**Install fails:**
Input: *"hook me up to Kubit"*
Output: Detects framework, onboards, mints, writes env. `uv add
kubit-otel` returns a resolver conflict; stderr is echoed and the
user is told to resolve the conflict and run the install manually.
Wiring still proceeds so the user has a diffable change; the
close-out flags that verification will fail until the install is
fixed.

## Gotchas

_Populated as real-repo dogfooding surfaces issues. Track per-framework
below; remove items once covered by an adapter update. A framework is
ready-to-ship when it has ≥ 1 clean dogfood run and all items here are
either resolved or documented._

- [ ] `braintrust` — verified against one real repo
- [ ] `langfuse` — verified against one real repo
- [ ] `langsmith` — verified against one real repo
- [ ] `logfire` — verified against one real repo
- [ ] `openai-agents` — verified against one real repo
- [ ] `openinference` — verified against one real repo
- [ ] `openllmetry` — verified against one real repo
- [ ] `vercel-ai` — verified against one real repo
- [ ] `otel-genai` — verified against one real repo
