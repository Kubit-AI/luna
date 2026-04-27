# LangChain Source Adapter (instrument)

Pure source — LangChain has no native OTel emitter. Traces reach
Kubit through one of two mechanisms:

1. **Vendor callback handlers** (Langfuse's `CallbackHandler`,
   Braintrust's `BraintrustCallbackHandler`, …). When the sink's
   OTel path is active and the callback writes into the same
   `TracerProvider` Kubit attaches to, Kubit receives the LangChain
   spans as a sibling `SpanProcessor`. Langfuse v3 works this way
   end-to-end. **Braintrust does NOT** — `BraintrustCallbackHandler`
   posts via Braintrust's native HTTP pipeline regardless of
   `BRAINTRUST_OTEL_COMPAT`, so Kubit cannot see those spans (§3
   Path A; §6 caveat).
2. **OTel-native auto-instrumentation** via
   `opentelemetry-instrumentation-langchain` (OpenLLMetry), which
   patches LangChain at runtime and emits OTel spans on the global
   `TracerProvider` directly. The skill installs this on Braintrust
   Path B (§3); Python verified, TS not yet.

**Sink-dependent by default.** The skill currently requires a
Langfuse or Braintrust sink alongside `langchain` before it will
wire anything — a LangChain-only repo with no sink falls through to
SKILL.md step 2's friendly exit. See §6.

## 1. Dependency signals

Both Python and TypeScript are supported — LangChain ships
first-party packages in both ecosystems.

- Python — `pyproject.toml` / `requirements.txt` / `Pipfile`:
  - `langchain`, `langchain-core`, `langchain-community`,
    `langchain-text-splitters`
  - `langgraph`
  - Any provider package: `langchain-openai`, `langchain-anthropic`,
    `langchain-google-genai`, `langchain-aws`, `langchain-cohere`, …
    (any dep matching `^langchain[-_]`)
- TypeScript — `package.json` `dependencies` / `devDependencies`:
  - `langchain`, `@langchain/core`, `@langchain/community`
  - `@langchain/langgraph`
  - Any provider package: `@langchain/openai`, `@langchain/anthropic`,
    `@langchain/google-genai`, `@langchain/aws`, … (any dep matching
    `^@langchain/`)
- Import patterns:
  - Python: `from langchain`, `from langchain_core`,
    `from langchain_community`, `from langgraph`, `from langchain_<provider>`
  - TS/JS: `from "langchain/…"`, `from "@langchain/core…"`,
    `from "@langchain/langgraph…"`, `from "@langchain/<provider>…"`

**Detection trap — Langfuse v2 CallbackHandler is legacy.**
`from langfuse.callback import CallbackHandler` is the Langfuse v2
import path. It uses the v2 non-OTel HTTP pipeline, so Kubit's span
processor cannot see its spans. If the only LangChain wiring in the
repo is this v2 form, surface it in the confirmation and tell the
user to upgrade to `langfuse >= 3` (import path
`from langfuse.langchain import CallbackHandler`) before Kubit can
attach. Do not silently write an import that targets the v3 path
against a v2 install.

## 2. Minimum-change tier

`sink-dependent merge`

LangChain itself has no wiring site for Kubit to touch on the
callback-handler path — it emits no OTel spans natively. The wiring
that matters lives at two places:

1. The sink adapter's §3 span-processor merge / bootstrap (standard
   Kubit wiring — unchanged by LangChain being a source).
2. The LangChain-specific hand-off, which on Braintrust requires the
   user to choose between Path A (native callback package) and Path
   B (`opentelemetry-instrumentation-langchain` + matching
   LLM-client instrumentor). On Langfuse, the v3 callback handler
   already emits OTel spans, so there is no Path B/A split there.

Item 1 is driven by the sink adapter (`sink-langfuse.md` or
`sink-braintrust.md`). Item 2 is driven by §3 below — including the
Path A vs Path B decision the skill must surface to the user before
emitting any deps or wiring.

## 3. Sink-specific hand-off

The skill emits this block **after** the sink adapter's §3 wiring has
been resolved. Dispatch on the sink selected in SKILL.md step 2.

### Langfuse

Python (`langfuse >= 3`):

```python
# LangChain → Langfuse → Kubit. The v3 CallbackHandler emits OTel
# spans through the global TracerProvider that Kubit is also
# registered on, so Kubit receives the LangChain spans as a sibling
# processor. Pass the handler to every chain.invoke / ainvoke /
# stream call you want traced, or wire it into a default
# RunnableConfig.
from langfuse.langchain import CallbackHandler

langfuse_handler = CallbackHandler()

response = chain.invoke(
    {"input": "…"},
    config={"callbacks": [langfuse_handler]},
)
```

TypeScript (`@langfuse/langchain` + `@langfuse/otel`):

```typescript
// LangChain → Langfuse → Kubit. @langfuse/langchain's
// CallbackHandler emits spans through the same OTel TracerProvider
// that @langfuse/otel's LangfuseSpanProcessor is registered on,
// which is also where KubitSpanProcessor lives. Pass the handler to
// every chain.invoke / chain.stream call you want traced.
import { CallbackHandler } from "@langfuse/langchain";

const langfuseHandler = new CallbackHandler();

await chain.invoke(
  { input: "…" },
  { callbacks: [langfuseHandler] },
);
```

Extra dep (on top of what the Langfuse sink adapter already pulls
in):

- Python: none — `langfuse >= 3` already ships the
  `langfuse.langchain` submodule.
- TypeScript: `@langfuse/langchain` (not a transitive of
  `@langfuse/otel`).

### Braintrust

When `langchain` and `braintrust` are both in scope, **the user must
choose one of two paths before any deps land or any wiring is
written.** Surface both paths with their tradeoff and let the user
pick — do not silently rewrite their existing wiring.

**Path A — native Braintrust callback handler** (current default).
The pre-existing wiring most Braintrust users already have. Simple;
changes no project deps. Braintrust receives LangChain spans via its
native HTTP pipeline. **Kubit does not see those spans on this path**
because `BraintrustCallbackHandler` posts directly through Braintrust
regardless of `BRAINTRUST_OTEL_COMPAT` — verified against
`braintrust==0.16.0` (April 2026); see §6's caveat. Pick this path
when the user explicitly does not want Kubit coverage on the
LangChain side, or when adding the OpenLLMetry dep ecosystem is not
acceptable.

**Path B — OTel-native LangChain instrumentation.** Replace the
callback with `opentelemetry-instrumentation-langchain` plus a
matching LLM-client instrumentor. LangChain emits OTel spans on the
global `TracerProvider`, so both `BraintrustSpanProcessor` and
`KubitSpanProcessor` (already registered per `sink-braintrust.md` §3)
see the same spans. Coverage is process-wide once instrumented — no
per-call `callbacks: [handler]` threading. Adds a new dep ecosystem
(OpenLLMetry instrumentors) and requires pinning `wrapt<2` (see §4).
Python is verified end-to-end; TS is not yet verified as of April
2026.

Once the user picks, the skill emits exactly one of the snippets
below — never both. Mixing them double-emits LangChain spans
(callback → Braintrust native pipeline AND OTel →
`BraintrustSpanProcessor`).

#### Path A — Python (`braintrust[otel] >= 0.3.5`)

Requires Braintrust's OTel-compat gate from `sink-braintrust.md`
§Prerequisites accepted (the format opt-in still applies to
non-LangChain Braintrust spans). The LangChain spans on this path
do **not** route through OTel; the callback posts directly to
Braintrust's native pipeline.

```python
# LangChain → Braintrust (native pipeline). Kubit does not see these spans.
# set_global_handler() wires the callback into every LangChain run in
# the process — an alternative to passing `callbacks: [...]` on each
# chain.invoke. Use one or the other; do not stack them.
from braintrust.integrations.langchain import (
    BraintrustCallbackHandler,
    set_global_handler,
)

set_global_handler(BraintrustCallbackHandler())
```

#### Path A — TypeScript (`@braintrust/langchain-js`)

Requires the Kubit bootstrap from `sink-braintrust.md` §3 to be
imported first — its `setupOtelCompat()` call activates compat mode
before `import 'braintrust'` runs.

```typescript
// LangChain → Braintrust (native pipeline). Kubit does not see these spans.
import { BraintrustCallbackHandler } from "@braintrust/langchain-js";

const handler = new BraintrustCallbackHandler();

await chain.invoke(
  { input: "…" },
  { callbacks: [handler] },
);
```

#### Path B — Python (OTel-native)

`opentelemetry-instrumentation-langchain` patches LangChain's runtime
once at process start; every chain invocation in the process emits
OTel spans automatically. No per-call `callbacks: [...]` threading.

The matching LLM-client instrumentor must be installed alongside it
and must match the model SDK the chain actually uses (`anthropic`,
`openai`, `google_genai`, `bedrock`, `cohere`, `mistral`, …). A
mismatch silently produces no spans for the LLM call segment — no
error, no warning. The skill matches the instrumentor to the
project's detected `langchain_<provider>` imports per §4.

```python
# LangChain → OTel → BraintrustSpanProcessor + KubitSpanProcessor.
# Both Braintrust and Kubit receive the same spans.
# DO NOT also register BraintrustCallbackHandler — it would double-emit
# (callback → Braintrust native pipeline AND OTel → BraintrustSpanProcessor).
from opentelemetry.instrumentation.langchain import LangchainInstrumentor
from opentelemetry.instrumentation.anthropic import AnthropicInstrumentor
# (or openai / google_genai / bedrock / … — match the LLM client the chain uses)

LangchainInstrumentor().instrument()
AnthropicInstrumentor().instrument()
```

#### Path B — TypeScript (parallel pipelines with OpenInference)

On TS, Path B does not bridge through OTel the way Python does —
`setupOtelCompat()` only swaps Braintrust's internal context
manager / ID generator / span components; it does not make
`BraintrustCallbackHandler` emit OTel spans (see §6 caveat). The
verified TS pattern is therefore **parallel pipelines**: Braintrust
keeps its native HTTP callback path unchanged (Path A wiring stays
in user code, preserving Braintrust UI fidelity for tool calls,
model metadata, and chain typing), and Kubit runs its own `NodeSDK`
fed by an OpenInference LangChain instrumentor. No
`BraintrustSpanProcessor`, no `setupOtelCompat()`, no
`@braintrust/otel` import on this Kubit-side bootstrap. Two
emissions, no shared OTel pipeline, no Braintrust-as-OTel bridge.

The verified instrumentor is
`@arizeai/openinference-instrumentation-langchain`, which threads
`parentRunId` correctly via
`trace.setSpanContext(context.active(), parentCtx)`. **Do not use
`@traceloop/instrumentation-langchain` on TS** — it discards
`parentRunId` in every callback handler and produces disconnected
spans (see §6 caveat).

**Precondition.** The published `@kubit-ai/otel` must allow
OpenInference scopes through its default span filter. OpenInference
emits `openinference.*` and `llm.*` attrs (not `gen_ai.*`), so the
SDK must include `@arizeai/openinference` in its
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES` (or equivalent allowlist
constant). Verify the user's installed `@kubit-ai/otel` version
covers this before proceeding — see SKILL.md Gotchas.

```typescript
// Generated by /kubit-integrate for braintrust + langchain on <YYYY-MM-DD>.
// Requires KUBIT_EXPORT_API_KEY env var.
// User-side: setGlobalHandler(new BraintrustCallbackHandler(...)) stays
// unchanged in your existing code (Path A wiring, for Braintrust UI
// fidelity). Braintrust's callback handler does NOT route through OTel
// on TS — see §6 caveat. This file owns Kubit's separate OTel pipeline;
// the two run in parallel.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { KubitSpanProcessor } from "@kubit-ai/otel";
import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

// `manuallyInstrument` is required because LangChain.js's CallbackManager
// is imported as an ESM module — the default `instrument()` Hook
// auto-attach does not fire reliably for ESM in current Node runtimes.
const langchainInstrumentation = new LangChainInstrumentation();
langchainInstrumentation.manuallyInstrument(CallbackManagerModule);

const sdk = new NodeSDK({
  spanProcessors: [
    new KubitSpanProcessor({
      apiKey: process.env.KUBIT_EXPORT_API_KEY!,
      tokenEndpoint: process.env.KUBIT_EXPORT_ENDPOINT,
    }),
  ],
  instrumentations: [langchainInstrumentation],
});
sdk.start();
```

Extra dep (on top of what the Braintrust sink adapter already pulls
in): see §4 — the dep list branches on the chosen path.

## 3a. Integration-site signals

Grep targets for existing callback-handler wiring the user may
already have. If found, the skill surfaces the existing site in the
close-out rather than asking the user to add a fresh one.

Python:

- `from langfuse.langchain import CallbackHandler` or
  `from langfuse.callback import CallbackHandler` (v2 — flag as
  legacy per §1).
- `from braintrust.integrations.langchain import BraintrustCallbackHandler`
  or `set_global_handler(`. **Decision point, not a legacy flag.**
  This is Path A wiring (see §3). Surface the §3 tradeoff to the
  user and ask whether to keep Path A (Kubit will not see LangChain
  spans) or migrate to Path B (OTel-native instrumentation, adds the
  OpenLLMetry deps and `wrapt<2` pin). Do not silently relabel as
  legacy and do not silently rewrite — the user must choose.
- A `callbacks=[` literal in a `chain.invoke(` / `chain.ainvoke(` /
  `chain.stream(` call.

TypeScript:

- `from "@langfuse/langchain"` / `from "langfuse-langchain"` (the
  latter is the v2 JS package — flag as legacy per §1).
- `from "@braintrust/langchain-js"`. **Decision point** — same Path
  A vs Path B framing as the Python bullet above, with the caveat
  that Path B is not verified end-to-end on TS as of April 2026.
- A `callbacks: [` literal in a `.invoke(` / `.stream(` /
  `.batch(` call on a `Runnable` / `Chain` / `Agent`.

## 4. Wire-in instruction

LangChain needs no `import './kubit-instrumentation';` at the
entrypoint beyond what the sink adapter already requires — the
sink's bootstrap handles OTel wiring. There is no Kubit-owned file
to import for this source.

What the user must do manually depends on the path:

- **Langfuse and Braintrust Path A (callback handler):**
  1. Install the sink's LangChain callback package (see §3 — the
     skill does this during SKILL.md step 7).
  2. Pass the callback handler into each chain/agent call they want
     traced:
     - Langfuse Python: `chain.invoke(…, config={"callbacks": [handler]})`
     - Langfuse TS: `chain.invoke(…, { callbacks: [handler] })`
     - Braintrust Python: either `set_global_handler(handler)` once, or
       per-call `callbacks=[handler]`
     - Braintrust TS: `chain.invoke(…, { callbacks: [handler] })`

- **Braintrust Path B — Python (OTel-native instrumentation):**
  1. The skill installs `opentelemetry-instrumentation-langchain` plus
     the matching LLM-client instrumentor(s) per §4's dep list during
     SKILL.md step 7.
  2. The `LangchainInstrumentor().instrument()` and matching
     `<Provider>Instrumentor().instrument()` calls (§3 Path B Python
     snippet) must run **before** the first chain invocation, ideally
     at process start. Place them in the bootstrap file alongside
     `sink-braintrust.md` §3's span-processor wiring, or in the
     project's existing entrypoint module before any chain
     construction. No per-call `callbacks: [...]` threading is
     needed once instrumented.

- **Braintrust Path B — TypeScript (parallel pipelines):**
  1. The skill installs `@arizeai/openinference-instrumentation-langchain`
     plus `@kubit-ai/otel` and `@opentelemetry/sdk-node` per §4's TS
     dep list during SKILL.md step 7. `@braintrust/langchain-js`
     stays in user code unchanged.
  2. The bootstrap from §3 Path B TS owns its own `NodeSDK` with the
     OpenInference `LangChainInstrumentation` and
     `KubitSpanProcessor`. Importing the bootstrap at the entrypoint
     activates instrumentation process-wide. **Do not** add
     `BraintrustSpanProcessor` or `setupOtelCompat()` to this
     bootstrap — Braintrust's callback handler in user code already
     covers the Braintrust UI side; trying to bridge through OTel on
     TS does not work (see §6 caveat).

Required deps (merged into SKILL.md step 7's dep list when
`langchain` is in `sources_detected` alongside the chosen sink):

- Langfuse, Python: no extra (bundled with `langfuse >= 3`).
- Langfuse, TypeScript: `@langfuse/langchain`.
- Braintrust — depends on the user's chosen path per §3:
  - **Path A** (native Braintrust callback, current default):
    - Python: no extra (bundled with `braintrust[otel] >= 0.3.5`).
    - TypeScript: `@braintrust/langchain-js`.
  - **Path B** (OTel-native instrumentation):
    - Python: `opentelemetry-instrumentation-langchain` plus a
      matching LLM-client instrumentor — picked from the project's
      detected LangChain provider imports
      (`langchain_anthropic` →
      `opentelemetry-instrumentation-anthropic`,
      `langchain_openai` → `opentelemetry-instrumentation-openai`,
      `langchain_google_genai` →
      `opentelemetry-instrumentation-google-genai`,
      `langchain_aws` → `opentelemetry-instrumentation-bedrock`,
      `langchain_cohere` → `opentelemetry-instrumentation-cohere`,
      etc.). Install all matching instrumentors when multiple
      providers are present. **Pin `wrapt<2`** — OpenLLMetry's
      instrumentors call
      `wrap_function_wrapper(module=…, name=…, wrapper=…)`, and
      `wrapt 2.x` removed the `module=` kwarg, so the first
      `_instrument()` call raises
      `TypeError: wrap_function_wrapper() got an unexpected keyword argument 'module'`.
      `braintrust >= 0.16.0` accepts `wrapt >= 1.0.0, < 3.0.0`, so
      the pin does not conflict.
    - TypeScript (parallel-pipelines pattern, see §3 Path B TS):
      `@arizeai/openinference-instrumentation-langchain` (the
      OpenInference LangChain instrumentor) plus `@kubit-ai/otel`
      and `@opentelemetry/sdk-node` for the Kubit-side `NodeSDK`.
      Path A's `@braintrust/langchain-js` stays in user code for the
      Braintrust callback path; it is not a Kubit-side install.
      **Do NOT install `@traceloop/instrumentation-langchain` on
      TS** — it discards `parentRunId` and produces disconnected
      spans (see §6 caveat). **Precondition:** the published
      `@kubit-ai/otel` must allow OpenInference scopes through its
      default span filter — see SKILL.md Gotchas.

## 5. Verification snippet

LangChain-specific verification runs the user's own app — the spans
only land once the user has wired `callbacks: [handler]` into a real
chain invocation. There is no synthetic one-liner that exercises
the LangChain → sink → Kubit path without the user's chain code.

The sink adapter's §5 command still verifies the underlying Kubit
pipeline (Kubit receives a span from the global tracer). After that
passes, run the app and confirm a span whose `instrumentation.scope.name`
contains `langchain` / `langfuse.langchain` / `braintrust` lands
in Kubit.

## 6. LangChain-specific caveats

**Per-call opt-in (Langfuse and Braintrust Path A).** The callback
model is per-invocation — the user has to thread
`callbacks: [handler]` through every chain / agent / runnable call
they want traced (or call `set_global_handler` once, for Braintrust
Python only). Same shape as Vercel AI's
`experimental_telemetry: { isEnabled: true }` gotcha: the skill's
job is to make the wiring valid, but coverage still depends on the
user touching their call sites. Call this out in the close-out so
the user doesn't wonder why the sink verification span lands but
their real chain runs don't.

**Process-wide on Braintrust Path B.** With OTel-native
instrumentation (`LangchainInstrumentor().instrument()`), LangChain's
runtime is patched once at process start and every chain invocation
in the process emits OTel spans automatically. No per-call threading.
Coverage is by-default-on rather than per-call.

**LangChain on its own emits no OTel spans natively.**
`opentelemetry-instrumentation-langchain` is the OTel emitter the
skill installs on Braintrust Path B; it patches LangChain at
runtime. Without that instrumentor, LangChain only reaches Kubit via
a Langfuse callback handler (`langfuse >= 3`, OTel-native) or via
Braintrust Path B above. A LangChain-only repo with no sink is
currently an unsupported combination — SKILL.md step 2 exits with a
message pointing the user to add one of the supported sinks.

**Path B per-LLM-client instrumentor must match the chain's model
SDK.** Installing `opentelemetry-instrumentation-anthropic` while
the chain uses `langchain_openai` produces no spans for the LLM call
segment — no error, no warning, silent. The skill matches the
instrumentor to the project's detected `langchain_<provider>`
imports per §4; if multiple providers are present, install all
matching instrumentors.

**`BRAINTRUST_OTEL_COMPAT=true` does NOT make
`BraintrustCallbackHandler` emit OTel spans** (verified
`braintrust==0.16.0`, April 2026). The env var only changes ID
format (`braintrust/id_gen.py:13`), context propagation
(`braintrust/context.py:123`), and `span.export()` wire format
(`braintrust/logger.py:150,4394`). It does not route the LangChain
callback handler's spans through the global `TracerProvider`. To get
LangChain spans into Kubit on the Braintrust path, use Path B (§3) —
`BRAINTRUST_OTEL_COMPAT` is irrelevant to LangChain coverage.

**`setupOtelCompat()` (TS) does not bridge `BraintrustCallbackHandler`
into OTel** — the TypeScript analog of the
`BRAINTRUST_OTEL_COMPAT` issue above. `setupOtelCompat()` only
swaps Braintrust's internal context manager / ID generator / span
components for OTel-aware versions; `BraintrustCallbackHandler`
(`@braintrust/langchain-js`) still posts via Braintrust's HTTP API
directly, never calling `trace.getTracer(...)`. The TS bootstrap on
the LangChain path therefore drops both `setupOtelCompat()` and
`BraintrustSpanProcessor` from the Kubit-side wiring; Braintrust's
UI keeps working via its callback path unchanged, and Kubit gets
spans from the OpenInference instrumentor (§3 Path B TS).
`BraintrustSpanProcessor` is still useful in non-LangChain TS
combinations (Vercel AI, manual OTel) where the user emits OTel
spans directly — that case keeps the existing
`sink-braintrust.md` §3 TS bootstrap shape.

**`@traceloop/instrumentation-langchain` (TS) discards `parentRunId`**
in every callback handler — it calls `tracer.startSpan(...)` with
no parent context, producing disconnected spans across all sinks
(both Braintrust UI and Kubit). Confirmed by reading the package
source. Do not install for the Kubit path on TS; the verified
instrumentor is `@arizeai/openinference-instrumentation-langchain`,
which threads `parentRunId` correctly via
`trace.setSpanContext(context.active(), parentCtx)`.

**Langfuse v2 → v3 migration.** The v2 import
`from langfuse.callback import CallbackHandler` (Python) and the v2
package `langfuse-langchain` (JS) use Langfuse's non-OTel HTTP
pipeline. Kubit cannot attach to either. If a v2 wiring is present,
the skill flags it in the confirmation and exits until the user
upgrades.
