# Braintrust Sink Adapter (instrument)

Hybrid — ships source instrumentation alongside the Braintrust sink.
`provider_owner: user` once OTel-compat mode is enabled (both
Braintrust and Kubit are processors on a user-constructed provider).

## 1. Dependency signals

Grep these patterns in manifests and imports:

- `braintrust` in `pyproject.toml` / `requirements.txt` (Python)
- `braintrust[otel]` extras in `pyproject.toml` / `requirements.txt`
- `braintrust` or `@braintrust/otel` in `package.json` (JS/TS)
- `import braintrust` / `from braintrust import` in Python
- `from "braintrust"` / `from "@braintrust/otel"` in TS/JS
- `BRAINTRUST_API_KEY`, `BRAINTRUST_PARENT`, `BRAINTRUST_OTEL_COMPAT`
  env-var references

## 2. Minimum-change tier

**`bootstrap-file`** — but **gated on a user-confirmed prerequisite**
(see "Prerequisites" below). Routing native Braintrust spans to Kubit
requires Braintrust's OTel-compatibility mode, which has two parts
that must be configured together:

1. OTel-compat must be activated **before** Braintrust is imported.
   The activation mechanism is language-specific and the two are
   not interchangeable:
   - **Python.** Set `BRAINTRUST_OTEL_COMPAT=true` in the environment
     before any `import braintrust`. There is no function-call
     equivalent — the env var is the only switch the Python SDK
     honors.
   - **TypeScript.** Call `setupOtelCompat()` from `@braintrust/otel`
     before any `import 'braintrust'`. There is no env-var
     equivalent — `BRAINTRUST_OTEL_COMPAT` has **no effect** in the
     JS SDK.
2. A `TracerProvider` must be registered with both the
   `BraintrustSpanProcessor` (preserving the existing Braintrust
   destination) and `KubitSpanProcessor` from `@kubit-ai/otel` /
   `kubit_otel` (the new parallel pipeline into Kubit).

### Prerequisites

The skill MUST surface this block to the user verbatim and require an
explicit `y/N` opt-in before writing any file. Default is no.

> Enabling Braintrust's OTel-compatibility mode changes how Braintrust
> emits and consumes spans. Before turning it on, confirm:
>
> 1. **Distributed tracing.** OTel-compat changes the format of
>    `span.export()` and the parent header. If any other service or
>    job in your system reads exported Braintrust spans (via the
>    `x-bt-parent` header or distributed tracing across processes),
>    those services must be upgraded first to:
>    - Python: `braintrust[otel] >= 0.3.5`
>    - TypeScript: `braintrust >= 1.0.0` with `@braintrust/otel >= 0.1.0`
>    Skip this step if your repo is the only producer/consumer.
>
> 2. **Existing TracerProvider.**
>    - *Python.* If your app already registers a global OTel
>      `TracerProvider`, the bootstrap file attaches to it rather than
>      replace it — but it adds `BraintrustSpanProcessor` to that provider,
>      which means **all** OTel spans in the process — not just
>      Braintrust ones — start flowing into Braintrust. If that is
>      undesirable, configure `BraintrustSpanProcessor` with a
>      `custom_filter` after the file is written.
>    - *TypeScript (OTel JS SDK v2).* The bootstrap file constructs
>      its own `NodeSDK` with `BraintrustSpanProcessor` and Kubit's
>      `KubitSpanProcessor` in `spanProcessors: [...]` — it cannot
>      attach to an already-running provider (v2 removed
>      `addSpanProcessor`). If your app already constructs its own
>      `NodeSDK` / `NodeTracerProvider`, the skill must merge both
>      processors into that existing `spanProcessors` array instead
>      of writing the standalone bootstrap, otherwise two providers
>      compete for the global registration. Configure
>      `BraintrustSpanProcessor` with a `customFilter` if you do not
>      want non-Braintrust spans flowing into Braintrust.
>
> 3. **How the bootstrap file opts you in.** The mechanism is
>    language-specific:
>    - *Python.* The bootstrap file does **not** set
>      `BRAINTRUST_OTEL_COMPAT=true` for you — flipping it changes
>      how Braintrust emits spans, so the choice stays with you. The
>      file treats the env var as your explicit opt-in: when it is
>      `true`, the file wires Kubit; when absent, the file logs a
>      skip message and does nothing. Export the flag before starting
>      the process to enable Kubit.
>    - *TypeScript.* The bootstrap file calls `setupOtelCompat()`
>      itself — importing the file **is** your opt-in. There is no
>      env var to set; setting `BRAINTRUST_OTEL_COMPAT` does nothing
>      in the JS SDK. If you do not want compat mode active, do not
>      import the bootstrap file.
>
> Proceed with these changes? [y/N]

If the user declines, exit 0 with a one-line note: *"Skipped Braintrust
instrumentation. Re-run after enabling OTel-compat mode for your
project."*

## 3. Bootstrap snippet

Reference Kubit wiring — the *minimum* code that must end up in the
program (import + processor/`configure` call, plus any assertions
below). When merging into an existing wiring site (see §3a), adapt
placement and syntactic style to the surrounding file.

Python's `if BRAINTRUST_OTEL_COMPAT != "true": skip` guard is
load-bearing and must be preserved when merging — it is the user's
opt-in switch and the only way the Python SDK honors compat mode.
TypeScript has no equivalent guard: importing the bootstrap is the
opt-in, and `setupOtelCompat()` runs unconditionally on import.

### Python — `kubit_instrumentation.py`

```python
# Generated by /kubit-integrate for braintrust on <YYYY-MM-DD>.
# Requires the KUBIT_API_KEY env var.
# Requires BRAINTRUST_OTEL_COMPAT=true in env, set BEFORE the first
# `import braintrust` anywhere in the process. This file does not set
# it — flipping it changes how Braintrust emits spans, so the choice
# stays with you. See README from /kubit-integrate for caveats.
import os
import sys

if os.environ.get("BRAINTRUST_OTEL_COMPAT", "").lower() != "true":
    print(
        "kubit_instrumentation: skipping Kubit setup. Reason: "
        "BRAINTRUST_OTEL_COMPAT=true is your explicit opt-in to "
        "Braintrust's V4 span format and OTel id space — until you "
        "flip it, the bootstrap does not enable any pipeline that "
        "emits V4 spans. (Note: this guard is about format, not "
        "routing — LangChain spans on source-langchain.md Path B flow "
        "through OTel regardless of this flag.) To enable, export "
        "BRAINTRUST_OTEL_COMPAT=true before starting the process and "
        "make sure any peers reading exported spans are upgraded first "
        "— see /kubit-integrate README.",
        file=sys.stderr,
    )
else:
    from braintrust.otel import BraintrustSpanProcessor
    from kubit_otel import KubitSpanProcessor
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider

    provider = TracerProvider(resource=Resource.create({
        "service.name": "<service-name>",
        "service.version": "<service-version>",
        "deployment.environment": "dev",
    }))
    # Kubit destination — parallel pipeline. KubitSpanProcessor is
    # used as a plain processor; configure() would construct its own
    # provider without BraintrustSpanProcessor and clobber this one.
    provider.add_span_processor(KubitSpanProcessor(
        api_key=os.environ["KUBIT_API_KEY"],
    ))
    # Existing Braintrust destination. parent= is set explicitly because
    # BraintrustSpanProcessor reads only BRAINTRUST_PARENT (not the more
    # widely-used BRAINTRUST_PROJECT) and silently defaults to
    # "project_name:default-otel-project" without it.
    provider.add_span_processor(
        BraintrustSpanProcessor(
            parent=f"project_name:{os.environ.get('BRAINTRUST_PROJECT', 'default-otel-project')}",
        )
    )
    trace.set_tracer_provider(provider)
```

### TypeScript — `kubit-instrumentation.ts`

The TS bootstrap shape branches on whether `langchain` is in
`sources_detected`:

- **Without LangChain** (Vercel AI, OTel-genai, or pure-OTel manual
  instrumentation) — the snippet below is correct. `setupOtelCompat()`
  + `BraintrustSpanProcessor` cover non-callback OTel sources: the
  user emits OTel spans directly, those flow through the global
  provider, and `BraintrustSpanProcessor` ships them to Braintrust
  while `KubitSpanProcessor` ships them to Kubit.
- **With LangChain** — this snippet does NOT apply. On TS,
  `setupOtelCompat()` does not bridge `BraintrustCallbackHandler`
  into OTel (see `source-langchain.md` §6 caveat), so
  `BraintrustSpanProcessor` would never receive LangChain spans.
  Use the parallel-pipelines bootstrap from
  `source-langchain.md` §3 Path B (TS) instead — that file owns the
  Kubit-side wiring on the LangChain path. `setupOtelCompat()`,
  `BraintrustSpanProcessor`, and `@braintrust/otel` are not used in
  that bootstrap; Braintrust gets its spans from
  `BraintrustCallbackHandler` in user code, unchanged.

```typescript
// Generated by /kubit-integrate for braintrust on <YYYY-MM-DD>.
// Requires the KUBIT_API_KEY env var.
// Importing this file IS your opt-in to Braintrust's OTel-compat
// mode — `setupOtelCompat()` runs at module load, before any
// `import 'braintrust'` elsewhere. The JS SDK has no env-var
// equivalent (BRAINTRUST_OTEL_COMPAT is Python-only and has no
// effect here). See README from /kubit-integrate for caveats.
import { setupOtelCompat, BraintrustSpanProcessor } from '@braintrust/otel';
import { KubitSpanProcessor } from '@kubit-ai/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Must run before any `import 'braintrust'` anywhere in the process.
// This file's import position at the entrypoint is what guarantees that.
setupOtelCompat();

const sdk = new NodeSDK({
  spanProcessors: [
    // Existing Braintrust destination. parent is set explicitly because
    // BraintrustSpanProcessor reads only BRAINTRUST_PARENT (not the more
    // widely-used BRAINTRUST_PROJECT) and silently defaults to
    // "project_name:default-otel-project" without it.
    new BraintrustSpanProcessor({
      parent: `project_name:${process.env.BRAINTRUST_PROJECT ?? "default-otel-project"}`,
    }),
    // Kubit destination — parallel pipeline.
    new KubitSpanProcessor({
      apiKey: process.env.KUBIT_API_KEY!,
    }),
  ],
});
sdk.start();
```

## 3a. Integration-site signals

Grep targets for an existing wiring site to merge Kubit into. This is
only meaningful once the §Prerequisites gate has been accepted — the
user has opted into OTel-compat mode. If the gate was declined, skip
this section and exit per SKILL.md.

If exactly one file in the repo matches, merge §3 wiring into that
file; otherwise fall back to the standalone bootstrap file per
SKILL.md step 9.

Python:

- A call to `BraintrustSpanProcessor(` (imported from
  `braintrust.otel`) registered on a `TracerProvider`. Add a
  `provider.add_span_processor(KubitSpanProcessor(api_key=os.environ["KUBIT_API_KEY"]))`
  to the same provider, after the Braintrust processor, guarded by
  the same `BRAINTRUST_OTEL_COMPAT=="true"` check.

TypeScript:

- A module that calls `setupOtelCompat()` from `@braintrust/otel` and
  constructs `new NodeSDK({ spanProcessors: [...] })`. Append
  `new KubitSpanProcessor({ apiKey: process.env.KUBIT_API_KEY! })`
  from `@kubit-ai/otel` to the same `spanProcessors` array — do
  **not** call `configure()`, which would register a second
  provider and clobber Braintrust's `NodeSDK`. Do **not** wrap the
  processor in a `BRAINTRUST_OTEL_COMPAT` env-var check — the env
  var has no effect in the JS SDK; the existing `setupOtelCompat()`
  call is itself the activation, and the user has already opted in
  by reaching this site.
- **LangChain caveat.** When `langchain` is in `sources_detected`,
  this site is not the merge target for LangChain spans — Kubit's
  LangChain wiring lives in its own `NodeSDK` per
  `source-langchain.md` §3 Path B (TS), separate from any
  Braintrust setup. Appending `KubitSpanProcessor` to the existing
  `setupOtelCompat()` site still covers non-callback OTel sources
  in the same process (e.g. Vercel AI), so it is a reasonable
  merge for those — but the LangChain coverage comes from a
  different bootstrap, not this one.

If multiple files match, ask the user which one the agent's traces
flow through.

## 3b. LangChain source hand-off

Emitted only when `langchain` is in `sources_detected` alongside
this sink **and** §Prerequisites has been accepted. The LangChain
wiring itself is owned by `source-langchain.md` §3 — this section
points to it, it does not duplicate the snippets.

`source-langchain.md` §3 presents the user with two paths and
**requires the user to choose one** before the skill writes any
LangChain-specific deps or wiring:

- **Path A — native Braintrust callback** (`BraintrustCallbackHandler`
  + `set_global_handler`, or per-call `callbacks=[handler]`). The
  pre-existing wiring most Braintrust users already have. Simple;
  changes no project deps. Braintrust receives LangChain spans via
  its native HTTP pipeline. **Kubit does not see those spans on
  this path** (verified `braintrust==0.16.0`, April 2026 — see
  `source-langchain.md` §6's `BRAINTRUST_OTEL_COMPAT` caveat).
- **Path B — OTel-native instrumentation.** Shape differs by
  language:
  - **Python.** `opentelemetry-instrumentation-langchain` plus a
    matching LLM-client instrumentor. LangChain emits OTel spans on
    the global `TracerProvider`; both `BraintrustSpanProcessor` and
    `KubitSpanProcessor` (both registered in §3 above) receive
    them. Adds the OpenLLMetry instrumentor ecosystem and requires
    pinning `wrapt<2`. Verified end-to-end.
  - **TypeScript (parallel pipelines).** Different shape — the §3
    TS bootstrap above does NOT apply on this path. Kubit gets a
    separate `NodeSDK` driven by
    `@arizeai/openinference-instrumentation-langchain` (NOT
    Traceloop), with `KubitSpanProcessor` as its only processor;
    `setupOtelCompat()`, `BraintrustSpanProcessor`, and
    `@braintrust/otel` are not used on this path. Braintrust still
    works via `BraintrustCallbackHandler` in user code (Path A
    wiring, unchanged) — there is no OTel bridge between the two.
    Bootstrap shape lives in `source-langchain.md` §3 Path B (TS).

Walk the user through the tradeoff from `source-langchain.md` §3
and have them choose **before** running SKILL.md step 7 — the
chosen path determines the dep list (see §4 below and
`source-langchain.md` §4).

## 4. Wire-in instruction

Python:

1. Add `{{KUBIT_IMPORT_STATEMENT}}` as the **first** import in
   `main.py` (or the app entrypoint), before any `import braintrust`.
   The file is safe to import without the env var — it will log a
   skip message and do nothing.
2. When ready to enable Kubit, export
   `BRAINTRUST_OTEL_COMPAT=true` in the environment that runs the app.
   The OTel-compat env var has no effect once Braintrust has been
   imported, so it must be set before the process starts.

TypeScript:

1. Add `import './kubit-instrumentation';` as the first import in
   `src/index.ts` (or your entrypoint), before any
   `import 'braintrust'` or `'@braintrust/otel'`. That import is the
   opt-in: the bootstrap calls `setupOtelCompat()` and registers
   both span processors on load.
2. No env var to set. `BRAINTRUST_OTEL_COMPAT` does not exist in the
   JS SDK and exporting it has no effect — to disable Kubit, remove
   the import.

Required deps:

- Python: `pip install kubit-otel "braintrust[otel]>=0.3.5"`
  (the `braintrust[otel] >= 0.3.5` floor matches the
  peer-compatibility floor from §2 — distributed-tracing-safe for
  any consumer reading spans exported by this repo).
- TypeScript: `npm install @kubit-ai/otel @braintrust/otel @opentelemetry/api @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-node @opentelemetry/sdk-node`
  (the existing `braintrust` dep — the signal that triggered
  detection in §1 — is left in place; this install only adds the
  Kubit-side extras). `@kubit-ai/otel` requires OTel JS at major
  v2 — SKILL.md step 7's version gate refuses to install when the
  project pins these peers to `^1.x`.
- When `langchain` is also in `sources_detected` (see §3b), the
  dep list depends on the user's chosen path per
  `source-langchain.md` §3 / §4:
  - **Path A** (native Braintrust callback). Python: no extra
    (`braintrust[otel] >= 0.3.5` bundles
    `braintrust.integrations.langchain`). TypeScript: add
    `@braintrust/langchain-js`.
  - **Path B** (OTel-native instrumentation). Shape differs by
    language:
    - Python: `opentelemetry-instrumentation-langchain` plus a
      matching LLM-client instrumentor
      (`opentelemetry-instrumentation-anthropic` / `-openai` /
      `-google-genai` / …, picked from the project's detected
      `langchain_<provider>` imports), plus `wrapt<2`.
    - TypeScript (parallel pipelines):
      `@arizeai/openinference-instrumentation-langchain` plus
      `@kubit-ai/otel` and `@opentelemetry/sdk-node` for the
      Kubit-side `NodeSDK`. `@braintrust/langchain-js` (the Path A
      Braintrust callback) stays in user code, unchanged.
      `@braintrust/otel` and `setupOtelCompat()` are NOT used on
      this path. **Do NOT install
      `@traceloop/instrumentation-langchain`** — it discards
      `parentRunId` and produces disconnected spans (see
      `source-langchain.md` §6).
  See `source-langchain.md` §3 / §4 for the bootstrap snippets, the
  wrapt failure mode (Python), and the full per-LLM-client
  instrumentor matrix.

## 5. Verification snippet

Python:

```bash
KUBIT_API_KEY=<your-key> BRAINTRUST_OTEL_COMPAT=true python -c "
{{KUBIT_IMPORT_STATEMENT}}
from opentelemetry import trace
trace.get_tracer('kubit-sdk').start_span('hello-kubit').end()
import time; time.sleep(2)
"
```

TypeScript:

```bash
KUBIT_API_KEY=<your-key> node -r ts-node/register -e "
require('./kubit-instrumentation');
const { trace } = require('@opentelemetry/api');
trace.getTracer('kubit-sdk').startSpan('hello-kubit').end();
setTimeout(() => process.exit(0), 2000);
"
```
