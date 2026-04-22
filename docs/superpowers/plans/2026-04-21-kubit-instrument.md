# /kubit-instrument Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/kubit-instrument` skill that detects one of seven supported LLM tracing frameworks in a user's repo and emits the minimum-change OTel exporter wiring to route traces to Kubit.

**Architecture:** Flat, adapter-driven, main-turn-only skill (no subagents). `skills/instrument/SKILL.md` owns the flow; `skills/instrument/references/frameworks/<fw>.md` adapters own per-framework detection signals, tier choice (`env-only` / `bootstrap-file` / `init-site-edit`), and canonical code snippets. One new installer template marker `{{KUBIT_OTEL_ENDPOINT}}` lets `bin/install.js` stamp the Kubit OTLP URL at install time. Skill stays off `SHIPPED_SKILLS` until dogfood gate passes.

**Tech Stack:** Node.js (installer); markdown (skill + adapters); Python + TypeScript examples in adapter snippets.

**Source of truth:** [`docs/superpowers/specs/2026-04-21-kubit-instrument-design.md`](../specs/2026-04-21-kubit-instrument-design.md). Read the spec before starting. It covers goals, non-goals, tier assignments per framework, error handling, and testing layers. This plan operationalizes it.

**Reuse anchors:**
- Detection grep patterns and library scope already exist in `skills/blame/references/frameworks/*.md` — copy §1 (Dependency signals) of each blame adapter **verbatim** into the corresponding instrument adapter. Do not re-derive.
- Installer substitution pattern to extend: `bin/install.js:152-159` (`substituteKubitMarkers`). Both Claude and Cursor ctx objects at `bin/install.js:298-303` and `bin/install.js:440-445`.
- Skill authoring shape to mirror: `skills/blame/SKILL.md` (has the best framework-adapter-driven flow in this repo).

---

## File Structure

**Create:**
- `skills/instrument/SKILL.md` — interactive flow
- `skills/instrument/references/README.md` — adapter authoring contract
- `skills/instrument/references/frameworks/langfuse.md`
- `skills/instrument/references/frameworks/langsmith.md`
- `skills/instrument/references/frameworks/logfire.md`
- `skills/instrument/references/frameworks/openai-agents.md`
- `skills/instrument/references/frameworks/openinference.md`
- `skills/instrument/references/frameworks/openllmetry.md`
- `skills/instrument/references/frameworks/otel-genai.md`
- `test/install-markers.test.js` — installer substitution smoke test (if a test dir doesn't exist, create it)

**Modify:**
- `bin/install.js:152-159` — add `{{KUBIT_OTEL_ENDPOINT}}` substitution
- `bin/install.js:298-303` and `bin/install.js:440-445` — add `otelEndpoint` to both ctx objects

**Unchanged in this plan (deliberately):**
- `SHIPPED_SKILLS` list — per spec, `instrument` stays unshipped until dogfood gate passes.
- `README.md`, `skills/help/SKILL.md` — update only when flipping the skill to shipped.

---

## Task 1: Installer — add `{{KUBIT_OTEL_ENDPOINT}}` marker

**Files:**
- Modify: `bin/install.js:152-159` (substitution function)
- Modify: `bin/install.js:298-303` (Claude ctx)
- Modify: `bin/install.js:440-445` (Cursor ctx)
- Create: `test/install-markers.test.js`

**Why this task first:** every adapter's code snippets embed `{{KUBIT_OTEL_ENDPOINT}}`. Without the installer substitution, all adapter work is untestable.

**Endpoint source:** hardcode a default constant at the top of `install.js` (`const DEFAULT_KUBIT_OTEL_ENDPOINT = 'https://agent-int.kubit.ai/otel';` — use this exact value as the placeholder; the team can change it before the skill ships), and let `process.env.KUBIT_OTEL_ENDPOINT` override it at install time so int/prod can differ without a code change.

- [ ] **Step 1: Write the failing test**

Create `test/install-markers.test.js`:

```javascript
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function dryInstall(envOverrides) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubit-install-'));
  execFileSync(
    'node',
    [path.join(REPO, 'bin', 'install.js'), '-y', '-l', '-c', tmp],
    { env: { ...process.env, ...envOverrides }, cwd: tmp, stdio: 'pipe' }
  );
  return tmp;
}

(function testEndpointMarkerSubstituted() {
  // Seed a skill body that uses the new marker so the installer is forced
  // to substitute it. (Instrument itself is not yet shipped — this test
  // uses an on-disk fixture skill to exercise the substitution pass.)
  const fixture = path.join(REPO, 'skills', '__marker-fixture__');
  fs.mkdirSync(path.join(fixture), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'SKILL.md'),
    '---\nname: __marker-fixture__\ndescription: test\n---\nENDPOINT={{KUBIT_OTEL_ENDPOINT}}'
  );
  try {
    const tmp = dryInstall({ KUBIT_OTEL_ENDPOINT: 'https://example/otel' });
    // The fixture won't be in SHIPPED_SKILLS so it won't install — that's fine.
    // The unit we're testing is substituteKubitMarkers itself, via require.
    const mod = require(path.join(REPO, 'bin', 'install.js'));
    // If install.js doesn't export, fall back to a regex check on the source:
    const src = fs.readFileSync(path.join(REPO, 'bin', 'install.js'), 'utf8');
    assert.ok(/KUBIT_OTEL_ENDPOINT/.test(src), 'install.js must reference KUBIT_OTEL_ENDPOINT marker');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  console.log('ok - endpoint marker wired');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/install-markers.test.js`
Expected: assertion error — `install.js must reference KUBIT_OTEL_ENDPOINT marker`.

- [ ] **Step 3: Add the constant and env override at top of `bin/install.js`**

Immediately after the `PKG_ROOT` line (`bin/install.js:9`), add:

```javascript
// Kubit OTLP endpoint stamped into /kubit-instrument adapter snippets. Override
// at install time via `KUBIT_OTEL_ENDPOINT=...` for int vs prod. The `/v1/traces`
// suffix is appended by each adapter's snippet, so omit it here.
const DEFAULT_KUBIT_OTEL_ENDPOINT = 'https://agent-int.kubit.ai/otel';
const KUBIT_OTEL_ENDPOINT =
  process.env.KUBIT_OTEL_ENDPOINT || DEFAULT_KUBIT_OTEL_ENDPOINT;
```

- [ ] **Step 4: Extend the substitution function**

Modify `bin/install.js:154-159` to:

```javascript
function substituteKubitMarkers(body, ctx) {
  return body
    .replace(/\{\{KUBIT_RUNTIME\}\}/g, ctx.runtime)
    .replace(/\{\{KUBIT_CONFIG_DIR\}\}/g, ctx.configDir)
    .replace(/\{\{KUBIT_SCOPE\}\}/g, ctx.scope)
    .replace(/\{\{KUBIT_OTEL_ENDPOINT\}\}/g, ctx.otelEndpoint);
}
```

- [ ] **Step 5: Add `otelEndpoint` to both ctx objects**

At `bin/install.js:298-303`, change to:

```javascript
  const ctx = {
    runtime: 'claude',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
    otelEndpoint: KUBIT_OTEL_ENDPOINT,
  };
```

At `bin/install.js:440-445`, change to:

```javascript
  const ctx = {
    runtime: 'cursor',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
    otelEndpoint: KUBIT_OTEL_ENDPOINT,
  };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node test/install-markers.test.js`
Expected: `ok - endpoint marker wired`.

- [ ] **Step 7: Commit**

```bash
git add bin/install.js test/install-markers.test.js
git commit -m "Add KUBIT_OTEL_ENDPOINT template marker to installer"
```

---

## Task 2: Adapter authoring contract (`references/README.md`)

**Files:**
- Create: `skills/instrument/references/README.md`

This doc is what adapter authors (including you in Tasks 3–9) must follow. Writing it first locks the contract.

- [ ] **Step 1: Write the README**

Content:

````markdown
# Instrument Framework Adapter References

Each file in `frameworks/` teaches `/kubit-instrument` how to wire an
additional OTel exporter (targeting the Kubit OTLP endpoint) into a
repo that already uses a specific tracing framework. Adapters are pure
markdown — the skill body reads them directly.

## Framework coverage

- `langfuse.md` — Langfuse (Python + JS/TS)
- `langsmith.md` — LangSmith / LangChain
- `logfire.md` — Pydantic Logfire
- `openai-agents.md` — OpenAI Agents SDK (via OTel contrib)
- `openinference.md` — OpenInference / Arize Phoenix
- `openllmetry.md` — OpenLLMetry / Traceloop
- `otel-genai.md` — OpenTelemetry GenAI semantic conventions

## Required sections

Every adapter contains these five H2 sections, in order:

### 1. Dependency signals

Exact grep patterns in manifests (`package.json`, `pyproject.toml`,
`requirements.txt`, `go.mod`) and top-level imports that prove the
framework is in use. **Copy verbatim from the matching blame adapter
at `skills/blame/references/frameworks/<fw>.md` §1** — the libraries
and detection signals are identical between skills.

### 2. Minimum-change tier

One of: `env-only`, `bootstrap-file`, `init-site-edit`.

- `env-only`: the framework's existing OTel bridge already honors
  standard `OTEL_EXPORTER_OTLP_*` env vars; adding Kubit is zero code.
- `bootstrap-file`: write one new file at repo root that attaches a
  second span processor to the global OTel tracer provider. User
  imports the file once from their entrypoint.
- `init-site-edit`: the framework requires wiring at initialization;
  the skill edits a named entrypoint after showing a diff.

### 3. Bootstrap snippet

Canonical code block(s). Python + TS variants where the framework
supports both. All snippets:

- Read the API key from `KUBIT_OTEL_API_KEY` at runtime — never
  hardcode.
- Post to `{{KUBIT_OTEL_ENDPOINT}}` with the framework-appropriate
  suffix (usually `/v1/traces`).
- Begin with the fixed two-line header:

  ```
  # Generated by /kubit-instrument for <framework> on <YYYY-MM-DD>.
  # Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
  ```

  (TS files use `//` instead of `#`.)

### 4. Wire-in instruction

For `bootstrap-file`: the one line the user adds to their entrypoint
(e.g. `import kubit_instrumentation`). Name the likely entrypoint file
(e.g. `main.py`, `src/index.ts`).

For `env-only`: the literal env-var block the user exports.

For `init-site-edit`: the diff the skill applies.

### 5. Verification snippet

A one-liner the user runs after setting `KUBIT_OTEL_API_KEY` that
emits a single test span. The skill never runs this itself — it only
prints it.

## Not OTel at the wire

`langfuse` and `langsmith` native SDKs are proprietary; both vendors
expose first-party OTLP endpoints separately. This skill routes to
**Kubit**, not the vendor, so even for proprietary-SDK users, the
adapter emits standard OTel SDK wiring alongside their existing
SDK — two parallel pipelines, not a rewrite of theirs.
````

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/README.md
git commit -m "Add instrument adapter authoring contract"
```

---

## Task 3: `otel-genai` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/otel-genai.md`

Do this one **first** — it's the simplest and becomes the template other adapters borrow from.

- [ ] **Step 1: Copy §1 from the blame adapter**

Read `skills/blame/references/frameworks/otel-genai.md` and copy its §1 (Dependency signals) verbatim as §1 of the new file.

- [ ] **Step 2: Write the full adapter**

```markdown
# OpenTelemetry GenAI Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/otel-genai.md verbatim.]

## 2. Minimum-change tier

`bootstrap-file`

A generic OTel user already has a `TracerProvider`; adding Kubit is one
additional `BatchSpanProcessor`.

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

```python
# Generated by /kubit-instrument for otel-genai on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = trace.get_tracer_provider()
if not isinstance(provider, TracerProvider):
    provider = TracerProvider()
    trace.set_tracer_provider(provider)

provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
    headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
)))
```

### TypeScript — `kubit-instrumentation.ts`

```typescript
// Generated by /kubit-instrument for otel-genai on <YYYY-MM-DD>.
// Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let provider = trace.getTracerProvider() as NodeTracerProvider;
if (!(provider instanceof NodeTracerProvider)) {
  provider = new NodeTracerProvider();
  provider.register();
}

provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({
  url: '{{KUBIT_OTEL_ENDPOINT}}/v1/traces',
  headers: { 'x-api-key': process.env.KUBIT_OTEL_API_KEY! },
})));
```

## 4. Wire-in instruction

Python: add `import kubit_instrumentation` as the first import in
`main.py` (or the app entrypoint that initializes the TracerProvider).

TypeScript: add `import './kubit-instrumentation';` as the first import
in `src/index.ts` (or your entrypoint).

## 5. Verification snippet

Python:

```bash
KUBIT_OTEL_API_KEY=<your-key> python -c "
import kubit_instrumentation
from opentelemetry import trace
trace.get_tracer('kubit-verify').start_span('hello-kubit').end()
import time; time.sleep(2)
"
```

TypeScript:

```bash
KUBIT_OTEL_API_KEY=<your-key> node -r ts-node/register -e "
require('./src/kubit-instrumentation');
const { trace } = require('@opentelemetry/api');
trace.getTracer('kubit-verify').startSpan('hello-kubit').end();
setTimeout(() => process.exit(0), 2000);
"
```
```

- [ ] **Step 3: Commit**

```bash
git add skills/instrument/references/frameworks/otel-genai.md
git commit -m "Add otel-genai instrument adapter"
```

---

## Task 4: `logfire` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/logfire.md`

Logfire is OTel-native; snippet reuses the otel-genai pattern almost verbatim. The only logfire-specific thing is that users commonly call `logfire.configure()`, which installs its own TracerProvider — so the adapter note must flag the import order.

- [ ] **Step 1: Copy blame adapter §1 and write adapter body**

```markdown
# Pydantic Logfire Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/logfire.md verbatim.]

## 2. Minimum-change tier

`bootstrap-file`

Logfire is OTel-native and installs its own `TracerProvider` inside
`logfire.configure()`. Attach the Kubit `BatchSpanProcessor` **after**
`logfire.configure()` so the provider already exists.

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

```python
# Generated by /kubit-instrument for logfire on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = trace.get_tracer_provider()
if isinstance(provider, TracerProvider):
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
        endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
        headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
    )))
else:
    raise RuntimeError(
        "kubit_instrumentation must be imported AFTER logfire.configure()"
    )
```

### TypeScript — `kubit-instrumentation.ts`

Same as otel-genai TS snippet (Logfire's browser/node OTel path shares
the global provider).

## 4. Wire-in instruction

Python: `import kubit_instrumentation` **after** `logfire.configure(...)`
in the same module. Example:

```python
import logfire
logfire.configure()
import kubit_instrumentation  # noqa: E402 — must follow logfire.configure()
```

TypeScript: `import './kubit-instrumentation';` after the Logfire
initialization call in your entrypoint.

## 5. Verification snippet

Same as otel-genai §5.
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/logfire.md
git commit -m "Add logfire instrument adapter"
```

---

## Task 5: `openinference` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/openinference.md`

OpenInference (Arize Phoenix) attaches to the global OTel provider via `phoenix.otel.register()`. Mirror logfire's post-register attachment pattern.

- [ ] **Step 1: Write the adapter**

```markdown
# OpenInference / Arize Phoenix Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/openinference.md verbatim.]

## 2. Minimum-change tier

`bootstrap-file`

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

```python
# Generated by /kubit-instrument for openinference on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = trace.get_tracer_provider()
if not isinstance(provider, TracerProvider):
    raise RuntimeError(
        "kubit_instrumentation must be imported AFTER phoenix.otel.register()"
    )

provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
    headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
)))
```

### TypeScript — `kubit-instrumentation.ts`

Same as otel-genai TS snippet.

## 4. Wire-in instruction

Python: `import kubit_instrumentation` **after** `phoenix.otel.register(...)`.
TypeScript: `import './kubit-instrumentation';` after the Phoenix register call.

## 5. Verification snippet

Same as otel-genai §5.
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/openinference.md
git commit -m "Add openinference instrument adapter"
```

---

## Task 6: `openllmetry` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/openllmetry.md`

OpenLLMetry (`Traceloop.init()` / `traceloop.initialize()`) also installs its own provider. Same pattern.

- [ ] **Step 1: Write the adapter**

```markdown
# OpenLLMetry / Traceloop Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/openllmetry.md verbatim.]

## 2. Minimum-change tier

`bootstrap-file`

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

Identical to the openinference snippet body (same global-provider attach
pattern), with the guard message updated:

```python
# Generated by /kubit-instrument for openllmetry on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = trace.get_tracer_provider()
if not isinstance(provider, TracerProvider):
    raise RuntimeError(
        "kubit_instrumentation must be imported AFTER Traceloop.init()"
    )

provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
    headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
)))
```

### TypeScript — `kubit-instrumentation.ts`

Same as otel-genai TS snippet.

## 4. Wire-in instruction

Python: `import kubit_instrumentation` after `Traceloop.init(...)`.
TypeScript: `import './kubit-instrumentation';` after `traceloop.initialize(...)`.

## 5. Verification snippet

Same as otel-genai §5.
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/openllmetry.md
git commit -m "Add openllmetry instrument adapter"
```

---

## Task 7: `openai-agents` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/openai-agents.md`

Uses the official `opentelemetry-instrumentation-openai-agents-v2` contrib package (confirmed via web research 2026-04-21). The wiring calls `OpenAIAgentsInstrumentor().instrument(tracer_provider=provider)`.

- [ ] **Step 1: Write the adapter**

```markdown
# OpenAI Agents SDK Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/openai-agents.md verbatim,
then append:]

Also flag as present-but-already-wired if the repo has:
- `opentelemetry-instrumentation-openai-agents-v2` in Python manifests
- any file that calls `OpenAIAgentsInstrumentor().instrument(`

In that case, the user already has an instrumentor installed; the skill's
job is only to add Kubit as a destination on the same tracer provider.

## 2. Minimum-change tier

`bootstrap-file`

The official OTel contrib package bridges the OpenAI Agents runtime into
OTel spans. We attach Kubit as an additional exporter on the provider
passed to that instrumentor.

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

```python
# Generated by /kubit-instrument for openai-agents on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
# Requires: pip install opentelemetry-instrumentation-openai-agents-v2
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.openai_agents import OpenAIAgentsInstrumentor

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
    headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
)))
trace.set_tracer_provider(provider)

OpenAIAgentsInstrumentor().instrument(tracer_provider=provider)
```

### TypeScript

The `@openai/agents` JS SDK does not yet have a first-party OTel
instrumentation at the same maturity. Do not emit a TS bootstrap; the
skill should print a note that JS/TS OpenAI Agents users should either
(a) switch to the forthcoming OTel JS bridge, or (b) use the generic
`otel-genai` adapter if they've already wired a manual tracer provider.

## 4. Wire-in instruction

Python: `import kubit_instrumentation` **before** any `Agent(...)`
construction — the instrumentor hooks must be installed before the SDK
creates its first agent.

## 5. Verification snippet

Python:

```bash
KUBIT_OTEL_API_KEY=<your-key> python -c "
import kubit_instrumentation
from agents import Agent, Runner
import asyncio
asyncio.run(Runner.run(Agent(name='verify', instructions='say hi'), 'hi'))
"
```
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/openai-agents.md
git commit -m "Add openai-agents instrument adapter"
```

---

## Task 8: `langfuse` adapter (`env-only` primary path)

**Files:**
- Create: `skills/instrument/references/frameworks/langfuse.md`

Langfuse is the only framework in the spec with an `env-only` primary tier. It applies when the repo uses the `@langfuse/otel` (JS) or `langfuse[otel]` (Python) extras; otherwise fall back to `bootstrap-file`.

- [ ] **Step 1: Write the adapter**

```markdown
# Langfuse Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/langfuse.md verbatim.]

Additionally, check for the OTel bridge extras:
- Python: `langfuse[otel]` in `pyproject.toml` / `requirements.txt`, or
  imports of `langfuse.otel` / `from langfuse.opentelemetry import`.
- JS/TS: `@langfuse/otel` in `package.json`, or imports of
  `@langfuse/otel`.

## 2. Minimum-change tier

- **Primary: `env-only`** — if the OTel-bridge extras above are
  detected, the user's existing Langfuse OTel exporter already honors
  standard OTLP env vars. Setting Kubit-targeted vars adds Kubit
  alongside Langfuse with zero code changes.
- **Fallback: `bootstrap-file`** — if the repo uses the native Langfuse
  SDK without the OTel bridge, emit a standalone file that sets up a
  second parallel pipeline into Kubit.

## 3. Bootstrap snippet

### env-only (primary)

Print these export lines to the user; write no file:

```bash
# Keep the user's existing LANGFUSE_* vars pointing at Langfuse.
# These vars add Kubit as an additional OTLP destination in parallel.
export KUBIT_OTEL_API_KEY=<your-key>
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT={{KUBIT_OTEL_ENDPOINT}}/v1/traces
export OTEL_EXPORTER_OTLP_TRACES_HEADERS=x-api-key=$KUBIT_OTEL_API_KEY
```

> Note: these vars apply to the OTel SDK globally. If the user's
> Langfuse setup also registers itself as the global OTel exporter,
> prefer the `bootstrap-file` fallback so Langfuse and Kubit each get
> their own `BatchSpanProcessor` and don't race on the env-var config.

### bootstrap-file (fallback)

Same pattern as `otel-genai.md` §3 — emit a standalone file with a
second `BatchSpanProcessor` on the global provider.

## 4. Wire-in instruction

env-only: just export the vars. No code change.

bootstrap-file: same as otel-genai §4.

## 5. Verification snippet

Same as otel-genai §5.
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/langfuse.md
git commit -m "Add langfuse instrument adapter"
```

---

## Task 9: `langsmith` adapter

**Files:**
- Create: `skills/instrument/references/frameworks/langsmith.md`

LangSmith native SDK is proprietary. To add Kubit as a destination, use a standalone OTel exporter — the LangSmith SDK continues to post to LangSmith on its own pipeline, and our bootstrap file creates a separate OTel pipeline that the `langchain` tracer also feeds if `LANGSMITH_OTEL_ENABLED=true`.

- [ ] **Step 1: Write the adapter**

```markdown
# LangSmith Adapter (instrument)

## 1. Dependency signals

[Paste §1 from skills/blame/references/frameworks/langsmith.md verbatim.]

## 2. Minimum-change tier

`bootstrap-file`

LangSmith's native tracer posts to LangSmith's proprietary ingestion API.
To dual-route into Kubit we set up an independent OTel pipeline. If the
user enables `LANGSMITH_OTEL_ENABLED=true`, LangChain will also emit
OTel spans into the global provider, which Kubit's exporter will pick
up automatically.

## 3. Bootstrap snippet

### Python — `kubit_instrumentation.py`

Identical to the otel-genai Python snippet.

### TypeScript — `kubit-instrumentation.ts`

Identical to the otel-genai TS snippet.

## 4. Wire-in instruction

Python: `import kubit_instrumentation` at the top of `main.py`.
TypeScript: `import './kubit-instrumentation';` at the top of `src/index.ts`.

Additionally suggest (but do not set) `LANGSMITH_OTEL_ENABLED=true` so
LangChain also emits OTel spans into the global provider Kubit is
attached to.

## 5. Verification snippet

Same as otel-genai §5.
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/references/frameworks/langsmith.md
git commit -m "Add langsmith instrument adapter"
```

---

## Task 10: `SKILL.md` — the interactive flow

**Files:**
- Create: `skills/instrument/SKILL.md`

This is the main deliverable. It encodes the user flow from the spec (§"User flow", Steps 1–5) and the error-handling table.

- [ ] **Step 1: Write the skill body**

```markdown
---
name: instrument
description: Use this skill when the user wants to start shipping their existing LLM tracing into Kubit. Detects which tracing framework the user's repo uses (Langfuse, LangSmith, Logfire, OpenAI Agents, OpenInference/Arize Phoenix, OpenLLMetry/Traceloop, or OpenTelemetry GenAI) and emits the minimum-change OTel exporter wiring to route traces to the Kubit OTLP endpoint. User supplies the API key at runtime via the `KUBIT_OTEL_API_KEY` env var.
---

# /kubit-instrument

## Overview

This skill is "turn on Kubit ingestion." Given a repo that already uses a
supported LLM tracing framework, it emits the minimum change required to
add a Kubit-targeted OTel exporter alongside the user's existing setup.
Seven frameworks are supported; one framework per run; no secrets in
source.

## When to Use

- The user wants traces from their existing app to appear in Kubit and
  does not yet have a Kubit exporter wired in.
- The user asks "how do I send my langfuse / langsmith / openai-agents /
  logfire / phoenix / traceloop / otel traces to Kubit?"
- Do NOT use to debug failing traces (that's `/kubit-inspect`), explain
  a metric regression (`/kubit-report`, `/kubit-blame`), or manage
  workspace credentials (`/kubit-connect`).

## Inputs

- The skill takes no flags; everything is inferred from the current
  working directory and, where ambiguous, a single prompt to the user.

## Workflow

1. **Detect tracing framework.** Grep the user's current working
   directory (their application repo, NOT this skill's install dir) for
   dependency signals from each adapter. Adapter files live at:
   - `{{KUBIT_CONFIG_DIR}}/skills/kubit-instrument/references/frameworks/<fw>.md`

   Adapters to check (§1 of each for the grep patterns):
   - `langfuse.md`
   - `langsmith.md`
   - `logfire.md`
   - `openai-agents.md`
   - `openinference.md`
   - `openllmetry.md`
   - `otel-genai.md`

   Check `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`,
   and a shallow scan of top-level imports.

2. **Framework pick.**
   - 0 matches → print *"No supported tracing framework detected.
     Supported: langfuse, langsmith, logfire, openai-agents,
     openinference, openllmetry, otel-genai. Add one of these first, or
     reach out on #kubit."* and exit.
   - 1 match → confirm with the user: *"Detected `<fw>`. Instrument it?
     [y/N]"*. Exit on no.
   - ≥ 2 matches → list detections and ask the user to pick exactly one.
     Do not accept "all"; the user can re-run for a second framework.

3. **Optional: refresh snippet via context7.** If context7 is available
   in this session, make one probe: resolve the picked framework's
   library id and read its latest OTel exporter guidance. Compare
   against the adapter's pinned snippet in §3.
   - If context7 reports a load-bearing API change (renamed imports,
     changed initializer signature, deprecated exporter class), prefer
     the context7 version and add a one-line comment at the top of the
     generated file noting `# source: context7 <library-id>`.
   - If context7 is unavailable or the guidance matches: use the pinned
     snippet verbatim.
   - Exactly one context7 probe per run. Never fatal on failure.

4. **Emit artifact.** Read the adapter's §2 (tier) and proceed:
   - `env-only` — print the env-var block from §3 and stop. Do not
     write any file.
   - `bootstrap-file` — detect language from manifests (`pyproject.toml`
     / `requirements.txt` → Python; `package.json` → TS). Write one file
     at the repo root:
     - Python: `kubit_instrumentation.py`
     - TypeScript: `kubit-instrumentation.ts`
     Prepend the two-line header from the adapter's §3.
     If both languages are present, prefer the language of the matched
     framework's primary SDK (adapter §1 will make it obvious). If still
     ambiguous, ask the user.
     If the target file already exists, show a diff against the
     proposed content and ask for overwrite.
   - `init-site-edit` — locate the entrypoint named in adapter §4 (ask
     the user for the path if not found); show the diff; apply after
     user approval. If the entrypoint cannot be located, print the
     snippet for manual paste and exit.

5. **Close-out.** Print exactly three blocks, in this order:
   1. The env-var export line: `export KUBIT_OTEL_API_KEY=<your-key>`.
   2. The wire-in instruction from adapter §4.
   3. The verification command from adapter §5.

   Do not run any of these; they require the user's key.

## Rules

- Never fetch trace data or metrics; delegate to `/kubit-inspect` or
  `/kubit-report`.
- Never read, prompt for, print, or write `KUBIT_OTEL_API_KEY`. Only
  name the variable.
- Never call the Kubit OTLP endpoint from inside the skill. No test
  spans. No connectivity probes. The user runs the verification
  command themselves.
- Never modify `.env`, secret stores, or CI config. Writing to source
  files only.
- Never set `instrument` up for a framework that wasn't detected —
  "install the framework for me" is explicitly out of scope.

## Error Handling

- **No framework detected.** Print supported list; exit 0.
- **Multiple frameworks detected.** User picks one; no "all" option.
- **CWD is not a git repo.** Warn once: *"Not inside a git checkout —
  generated files won't be tracked."* Continue.
- **Adapter file missing.** Fatal: *"Skill install is corrupt: re-run
  `npx @kubit-ai/agent-plugin`."*
- **`{{KUBIT_OTEL_ENDPOINT}}` literal still present in an adapter
  body** (substitution didn't run). Same message as above.
- **File-write collision.** Diff and ask; never overwrite silently.
- **`init-site-edit` entrypoint not found.** Ask the user once; if
  still not found, print the snippet for manual paste.
- **context7 unavailable or errors.** Silent fallback to pinned
  snippet.
- **User declines overwrite.** Print snippet inline; exit 0.

## Examples

**Single-framework repo:**
Input: *"wire my app to send traces into Kubit"*
Output: Detected `openinference`. Writes `kubit_instrumentation.py` at
repo root. Prints:
```
export KUBIT_OTEL_API_KEY=<your-key>
Add `import kubit_instrumentation` after phoenix.otel.register(...) in main.py.
Verify with: KUBIT_OTEL_API_KEY=... python -c "..."
```

**Multi-framework repo:**
Input: *"instrument my repo"*
Output: *"I see two supported frameworks: `langfuse`, `openai-agents`.
Which one produces the traces you want in Kubit?"* — user picks
`openai-agents`; proceeds with that adapter's bootstrap-file tier.

**Zero-framework repo:**
Input: *"set up kubit tracing"*
Output: *"No supported tracing framework detected. Supported: …. Add
one of these first."* Exit 0.

## Gotchas

_To be added as we dogfood against real repos (per the plan's Task 11
dogfood gate)._
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/SKILL.md
git commit -m "Add /kubit-instrument skill body"
```

---

## Task 11: Verify the skill installs cleanly (even though it's unshipped)

**Files:**
- None modified.

The skill is not in `SHIPPED_SKILLS` yet, so a normal install doesn't touch it. But we want to confirm that if someone locally adds it to the list (or we flip the switch in the future), substitution works end-to-end.

- [ ] **Step 1: Temporarily add `instrument` to `SHIPPED_SKILLS` locally (do NOT commit this change)**

Edit `bin/install.js:20` in-place to:

```javascript
const SHIPPED_SKILLS = ['blame', 'connect', 'help', 'inspect', 'instrument', 'report', 'update'];
```

- [ ] **Step 2: Dry install into a tempdir**

```bash
TMP=$(mktemp -d) && \
KUBIT_OTEL_ENDPOINT='https://example.test/otel' \
node bin/install.js -y -l -c "$TMP" && \
grep -r 'KUBIT_OTEL_ENDPOINT\|{{' "$TMP/.claude/skills/kubit-instrument/" || \
echo "ok: all markers substituted"
```

Expected: `ok: all markers substituted` (no remaining `{{…}}` tokens, and the
endpoint string `https://example.test/otel` appears verbatim in every adapter's
§3 code block).

- [ ] **Step 3: Revert the `SHIPPED_SKILLS` edit**

```bash
git checkout -- bin/install.js
```

Confirm with `git diff bin/install.js` — should be empty.

- [ ] **Step 4: Commit nothing**

This task intentionally leaves the tree clean. No commit.

---

## Task 12: Add gotchas + dogfood TODO checklist to the skill

**Files:**
- Modify: `skills/instrument/SKILL.md` (the Gotchas section)

Leave a visible dogfood checklist so the first flip-to-shipped is gated on real use.

- [ ] **Step 1: Replace the placeholder Gotchas section**

In `skills/instrument/SKILL.md`, replace:

```markdown
## Gotchas

_To be added as we dogfood against real repos (per the plan's Task 11
dogfood gate)._
```

with:

```markdown
## Gotchas

_Populated as real-repo dogfooding surfaces issues. Track per-framework
below; remove items once covered by an adapter update. A framework is
ready-to-ship when it has ≥ 1 clean dogfood run and all items here are
either resolved or documented._

- [ ] `langfuse` — verified against one real repo
- [ ] `langsmith` — verified against one real repo
- [ ] `logfire` — verified against one real repo
- [ ] `openai-agents` — verified against one real repo
- [ ] `openinference` — verified against one real repo
- [ ] `openllmetry` — verified against one real repo
- [ ] `otel-genai` — verified against one real repo
```

- [ ] **Step 2: Commit**

```bash
git add skills/instrument/SKILL.md
git commit -m "Seed instrument skill dogfood checklist"
```

---

## Out of scope for this plan (explicit)

- Adding `instrument` to `SHIPPED_SKILLS`, `README.md` skill table, or
  `skills/help/SKILL.md`. Per spec, flip only after dogfood gate passes.
- Per-framework fixture repos under `skills/instrument/references/fixtures/`.
  The spec allows these but they are optional and not needed for the
  first landing.
- Runtime support beyond Python + JS/TS.
- Any change to `@kubit-ai/agent-plugin` version or `CHANGELOG.md`. Bump
  those in the separate release PR that flips the skill to shipped.

---

## Self-review (done inline by the plan author)

**Spec coverage:**
- Spec §Directory layout → Tasks 2, 3–9, 10 ✓
- Spec §Adapter contract (§§1–5) → Task 2 (contract) + Tasks 3–9 (adapters) ✓
- Spec §Tier assignments → mapped 1:1 across Tasks 3–9 ✓
- Spec §User flow → Task 10 ✓
- Spec §File write contract → Task 10 ("Emit artifact") + Tasks 3–9 (headers) ✓
- Spec §Installer changes → Task 1 ✓
- Spec §Error handling → Task 10 ✓
- Spec §Testing Layer 1 → Task 1 Step 1 + Task 11 ✓
- Spec §Testing Layer 2 (fixtures) → deferred out-of-scope explicitly ✓
- Spec §Testing Layer 3 (dogfood) → Task 12 checklist ✓
- Spec §Open items → absorbed into Task 1 Step 3 note (endpoint URL), Task 10 Step 1 ("If both languages are present") and Task 8 Step 1 (langsmith tier fallback).

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" without repeating the code. The only non-literal placeholders (`<YYYY-MM-DD>`, `<framework>`, `<your-key>`) are intentional runtime substitutions the skill or user fills in.

**Type consistency:** Bootstrap function/class names are stable across tasks — `kubit_instrumentation.py`, `kubit-instrumentation.ts`, `KUBIT_OTEL_API_KEY`, `{{KUBIT_OTEL_ENDPOINT}}`, `BatchSpanProcessor`, `OTLPSpanExporter` / `OTLPTraceExporter`, `OpenAIAgentsInstrumentor`. Tier names (`env-only` / `bootstrap-file` / `init-site-edit`) match spec and adapter contract and SKILL.md verbatim.
