# Vercel AI SDK Source Adapter (instrument)

Pure source. Emits spans through whatever `TracerProvider` is
registered globally (or a provider the user passes via
`experimental_telemetry: { tracer }`). No vendor-owned provider. When
no sink is present Kubit becomes the sole sink via plain
`configure({ apiKey })`.

## 1. Dependency signals

**TypeScript only.** The Vercel AI SDK (`ai` / `@ai-sdk/*`) is a
TypeScript package with no Python port. Python apps that call a
Vercel-AI-backed HTTP endpoint should fall through to the `otel-genai`
adapter instead — the attribute namespace that Vercel emits (`ai.*`) is
a JS-runtime concern and will never show up in Python process traces.

- `"ai"` in `package.json` `dependencies` / `devDependencies`
  (version `4.x` or newer — the package is literally named `ai`)
- Any `@ai-sdk/*` package in `package.json` (e.g. `@ai-sdk/openai`,
  `@ai-sdk/anthropic`, `@ai-sdk/react`, `@ai-sdk/otel`)
- `from "ai"` or `from "@ai-sdk/…"` imports in `.ts` / `.tsx` / `.js`
  / `.jsx` / `.mjs`
- `experimental_telemetry:` literal in source (proves the app is
  already opting into AI SDK spans on at least one call)
- `registerTelemetry(` imported from `ai`, or `new OpenTelemetry(`
  imported from `@ai-sdk/otel` (the newer tracer-registration API)

Also flag as present-but-already-wired if the repo has
`@ai-sdk/otel` in `package.json` — the user has already set up tracer
registration; the skill's job is just to add Kubit as a destination on
the same provider.

## 2. Minimum-change tier

`bootstrap-file`

Vercel AI's tracer resolves to whatever `TracerProvider` is registered
globally via `@opentelemetry/api` (or a provider the user passed
explicitly via `experimental_telemetry: { tracer }`). There is no
vendor-owned provider to preserve — this parallels the `otel-genai`
story.

Under OTel JS SDK v2 there are two shapes:

- *No provider yet.* The repo imports `ai` / `@ai-sdk/*` but never
  stands up a `NodeSDK` / `NodeTracerProvider`. The skill emits the
  standalone snippet from `source-otel-genai.md` §3 — a single
  `configure({ apiKey, serviceName })` call from `@kubit-ai/otel`
  that stands up a Kubit-owned `NodeTracerProvider` and registers it
  globally. Vercel AI's tracer resolves to it.
- *Provider already constructed.* The repo has a
  `new NodeSDK({ spanProcessors: [...] })` or
  `new NodeTracerProvider({ spanProcessors: [...] })`. The skill
  appends `new KubitSpanProcessor({ apiKey: ... })` from
  `@kubit-ai/otel` to that same `spanProcessors` array. It does
  **not** call `configure()` — that would register a second
  provider and clobber the existing one. v2 also removed the
  post-hoc `addSpanProcessor` API.

## 3. Bootstrap snippet

Reference Kubit wiring — the *minimum* code that must end up in the
program (import + `configure` call). When merging into an existing
wiring site (see §3a), adapt placement and syntactic style to the
surrounding file. The standalone snippet is used verbatim only when no
site is found.

**Gotcha — per-call opt-in.** The AI SDK does not emit spans unless
`experimental_telemetry: { isEnabled: true }` is set on the individual
`generateText` / `streamText` / `embed` / `embedMany` call. Registering
a global tracer (this adapter's job) is necessary but not sufficient —
the user must also flip the per-call flag at each call site they want
traced. See
[ai-sdk.dev/docs/ai-sdk-core/telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry).
Call this out in the close-out so the user doesn't wonder why the
verification span lands but their real `generateText` calls don't.

**Gotcha — `@opentelemetry/sdk-trace-node` is Node-only.** It cannot
load in Edge / Workers / browser runtimes. `@kubit-ai/otel`'s
`configure()` imports `NodeTracerProvider` from
`@opentelemetry/sdk-trace-node` at module load, so the Edge-crash
story is inherited by the bootstrap snippet itself, not just the
peer dep. In Next.js, `instrumentation.ts` is evaluated in **both**
the `nodejs` and `edge` runtimes — a bare
`import './kubit-instrumentation'` there will crash the Edge worker
at module load. The skill must either place the Kubit bootstrap in
`instrumentation.node.ts` (Next.js loads this file only in the Node
runtime when it exists alongside `instrumentation.ts`), or gate the
import on `process.env.NEXT_RUNTIME === 'nodejs'` /
`process.env.NEXT_RUNTIME !== 'edge'` inside `instrumentation.ts`'s
`register()` function (with a dynamic
`await import('./kubit-instrumentation')` so the Kubit module body
never evaluates in Edge). Never emit a top-level `import` of the
Kubit bootstrap in a file that can run in Edge.

**Gotcha — Next.js HTTP span orphans AI SDK children.** Next.js's
built-in OTel auto-instrumentation activates the moment any global
`TracerProvider` is registered. The route handler then emits an
HTTP span (`POST /…`, `scope=next.js`) and every Vercel AI SDK
span (`streamText`, tool calls, nested `generateObject`, `embed*`)
attaches to it as a child. The HTTP span is uninteresting noise
inside Kubit and parents the AI children at ingest, which makes
the trace shape less useful in the dashboard than it should be.

Workaround (user-side): detach each top-level AI SDK call from the
Next.js HTTP span by re-rooting it on `ROOT_CONTEXT`. The AI call
then becomes a real root span; tool calls, nested `generateObject`,
and `embed*` calls become its descendants and the trace is
preserved.

```typescript
// app/(preview)/api/chat/route.ts
import { context, ROOT_CONTEXT } from "@opentelemetry/api";

export async function POST(req: Request) {
  // …
  const result = await context.with(ROOT_CONTEXT, () =>
    streamText({ /* …same options… */ })
  );
  // …
}
```

Apply this wrap to every route handler that calls a top-level AI
SDK entrypoint (`streamText`, `generateText`, `embed`, `embedMany`,
`generateObject`, `streamObject`). Easy to forget when adding new
endpoints — track it in code review. Note that any non-AI
OTel-aware work in the same route loses its connection to the HTTP
span, by design.

### Python

Not applicable — see §1. Route Python services through `otel-genai`.

### TypeScript — `kubit-instrumentation.ts`

```typescript
// Generated by /kubit-integrate for vercel-ai on <YYYY-MM-DD>.
// Requires the KUBIT_API_KEY env var.
// Reminder: set `experimental_telemetry: { isEnabled: true }` on each
// generateText / streamText / embed / embedMany call you want traced;
// the AI SDK does not emit spans without that flag.
import { configure } from "@kubit-ai/otel";

configure({
  apiKey: process.env.KUBIT_API_KEY!,
  serviceName: "<service-name>",
  serviceVersion: "<service-version>",
});
```

### Merge form — add `KubitSpanProcessor` to the user's existing `spanProcessors`

Used when §3a finds an existing wiring site (the user already owns a
`TracerProvider` or a `NodeSDK` that Vercel AI's tracer resolves to).
OTel JS SDK v2 requires processors at construction time — the merge
edits the existing `spanProcessors: [...]` array in place. Do NOT
call `configure()` here; it would register a second
`NodeTracerProvider` and clobber the existing one.

```typescript
// Add to the module that already constructs the TracerProvider /
// NodeSDK that Vercel AI's tracer resolves to.
import { KubitSpanProcessor } from "@kubit-ai/otel";

const sdk = new NodeSDK({
  spanProcessors: [
    // …existing processors stay first…,
    new KubitSpanProcessor({
      apiKey: process.env.KUBIT_API_KEY!,
    }),
  ],
});
sdk.start();
```

## 3a. Integration-site signals

Grep targets for an existing wiring site to merge Kubit into. If
exactly one file in the repo matches, merge §3 wiring into that file;
otherwise fall back to the standalone bootstrap file per SKILL.md
step 9.

Python:

- Not applicable — see §1.

TypeScript:

- A `new NodeSDK({ spanProcessors: [...] })` or
  `new NodeTracerProvider({ spanProcessors: [...] })` /
  `new BasicTracerProvider({ spanProcessors: [...] })` construction
  in a file that also imports from `ai` or `@ai-sdk/*`. Append
  `new KubitSpanProcessor({ apiKey: process.env.KUBIT_API_KEY! })`
  from `@kubit-ai/otel` to that `spanProcessors` array.
- A Next.js `instrumentation.node.ts` at repo root or under `src/`
  whose `register()` function sets up OTel — Vercel's recommended
  AI SDK tracing entrypoint and the only Next.js-supplied file
  guaranteed to run exclusively in the Node runtime. If that file
  constructs a `NodeSDK` / `NodeTracerProvider`, merge into its
  `spanProcessors` array; otherwise emit the standalone form in §3
  into this file.
- A Next.js `instrumentation.ts` (without a `.node.ts` sibling) at
  repo root or under `src/` — evaluated in **both** `nodejs` and
  `edge` runtimes. Do NOT wire Kubit directly into this file.
  Propose one of these edits (pick based on what the file already
  does; ask the user if ambiguous):
  1. Split into `instrumentation.node.ts` (Kubit + any Node-only
     OTel wiring) and `instrumentation.edge.ts` / remaining
     `instrumentation.ts` (non-Kubit code that must run in Edge).
     Next.js dispatches by file suffix when `.node.ts` / `.edge.ts`
     exist.
  2. Keep `instrumentation.ts` as-is but wrap the Kubit-import in a
     `if (process.env.NEXT_RUNTIME === 'nodejs') { ... }` guard
     inside `register()`. Use a dynamic
     `await import('./kubit-instrumentation')` so
     `@opentelemetry/sdk-trace-node` never evaluates in the Edge
     runtime.
- A call to `registerTelemetry(new OpenTelemetry(` imported from
  `ai` + `@ai-sdk/otel` that is NOT backed by a local `NodeSDK` /
  `NodeTracerProvider` construction → no v2 merge target; fall back
  to the standalone form in §3 and let Kubit own the provider.

If multiple files match, ask the user which one the agent's traces
flow through.

## 4. Wire-in instruction

TypeScript: the Kubit bootstrap must live in a **Node-runtime** context
— it cannot run in Edge (see §3's Node-only gotcha). Likely entrypoints
in priority order:

- `instrumentation.node.ts` at repo root or under `src/` (Next.js
  loads this file only in the `nodejs` runtime when it exists
  alongside `instrumentation.ts`). Preferred entrypoint — no
  runtime guard needed.
- `instrumentation.ts` at repo root or under `src/` — only safe if
  the Kubit import is wrapped in a
  `if (process.env.NEXT_RUNTIME === 'nodejs') { ... }` branch
  inside `register()`, using `await import('./kubit-instrumentation')`
  so `@opentelemetry/sdk-trace-node` never evaluates in the Edge
  runtime. The skill must never add a top-level
  `import './kubit-instrumentation';` in this file.
- The file referenced by `package.json`'s `main` — non-Next.js
  projects; add `import './kubit-instrumentation';` as the first
  import.
- `src/index.ts` / `src/main.ts` / `src/server.ts` — non-Next.js
  projects; same as above.

Python: not applicable — see §1.

Required deps:

- TypeScript: `npm install @kubit-ai/otel @opentelemetry/api @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-node`
  (no framework extras — the user already has `ai` / `@ai-sdk/*`
  per §1). `@kubit-ai/otel` requires OTel JS at major v2 —
  SKILL.md step 7's version gate refuses to install when the
  project pins these peers to `^1.x`.

## 5. Verification snippet

TypeScript:

```bash
KUBIT_API_KEY=<your-key> node -r ts-node/register -e "
require('./kubit-instrumentation');
const { trace } = require('@opentelemetry/api');
trace.getTracer('kubit-sdk').startSpan('hello-kubit').end();
setTimeout(() => process.exit(0), 2000);
"
```

This proves the Kubit processor is wired into the global provider.
Real AI SDK spans (from `generateText` etc.) will appear only once
`experimental_telemetry: { isEnabled: true }` is set on each traced
call — see §3's gotcha.
