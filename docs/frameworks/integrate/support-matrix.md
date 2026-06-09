# `/kubit-integrate` Framework Support Matrix

Snapshot of how `/kubit-integrate` dispatches across the sink and
source axes. Each adapter file in this directory is the authoritative
source for its own signals, snippets, and quirks — this matrix just
gives a top-level orientation.

## The two axes

- **Sink** — owns a destination for spans. At most one sink drives
  wiring per run; if multiple are detected the user picks.
- **Source** — emits OTel spans, no native destination. Zero or more
  sources can be present. Purpose: confirm span production.

When no sink is detected but at least one source is, Kubit becomes the
**sole sink** via `source-otel-genai.md` §3 (plain `configure()` /
`configure({ apiKey })`).

## Sinks

| Sink | Adapter | Python | TS | Provider owner | Merge pattern (Python) | Merge pattern (TS) | Bundled source? |
|---|---|---|---|---|---|---|---|
| Langfuse | [`sink-langfuse.md`](./sink-langfuse.md) | ✅ | ✅ (OTel + native shapes) | User (OTel shape) / native SDK (native shape) | `provider.add_span_processor(KubitSpanProcessor(...))` on the existing provider | Add `new KubitSpanProcessor(...)` to `spanProcessors: [...]` at `NodeSDK` / `NodeTracerProvider` construction | Yes (`@observe`, native SDK) |
| Braintrust | [`sink-braintrust.md`](./sink-braintrust.md) | ✅ | ✅ | User (after OTel-compat opt-in) | Attach `KubitSpanProcessor` alongside `BraintrustSpanProcessor` under the `BRAINTRUST_OTEL_COMPAT` guard | Same shape; `NodeSDK` constructs with both processors | Yes (Braintrust SDK wrappers) |

## Sources

| Source | Adapter | Python | TS | Kubit-as-sole-sink template |
|---|---|---|---|---|
| Vercel AI SDK | [`source-vercel-ai.md`](./source-vercel-ai.md) | — (falls through to `source-otel-genai.md`) | ✅ | `source-otel-genai.md` §3 TS |
| OTel GenAI conventions | [`source-otel-genai.md`](./source-otel-genai.md) | ✅ | ✅ | Its own §3 (the canonical template) |

## Prerequisites and gotchas

| Adapter | Prerequisite / gotcha |
|---|---|
| `sink-langfuse.md` | Node path requires `@opentelemetry/sdk-trace-base >= 2.0.0` (skill exits with an upgrade message on v1). `@kubit-ai/otel` is Node-only — not Edge / Workers / browser. |
| `sink-braintrust.md` | **Prerequisite.** Requires Braintrust OTel-compat mode (`BRAINTRUST_OTEL_COMPAT=true` / `setupOtelCompat()`). Affects distributed tracing (`x-bt-parent` header format); downstream consumers may need upgrades. Python attach to a pre-existing global provider routes *all* OTel spans into Braintrust unless a `custom_filter` is added. |
| `source-vercel-ai.md` | Node-only (`@kubit-ai/otel` cannot load in Edge / Workers / browser). If the repo entrypoint straddles runtimes, the skill wires only into the Node runtime (e.g. `instrumentation.node.ts`, or `NEXT_RUNTIME === 'nodejs'` gate). Also: `experimental_telemetry: { isEnabled: true }` must be flipped per call — registering a tracer is necessary but not sufficient. |
| `source-otel-genai.md` | Generic OTel SDK v2 peer requirement still applies on the TS path. No other prerequisites; this adapter is the Kubit-as-sole-sink fallback other sources delegate to. |

## Detection traps to avoid

- `@langfuse/otel` + `langfuse` → Langfuse sink (OTel shape); single
  adapter handles both halves.
- `@opentelemetry/api` alone in TS without any GenAI marker → not a
  GenAI source; skip.
