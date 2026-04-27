# Vercel AI SDK Source Adapter (blame)

## 1. Dependency signals

**TypeScript only.** The Vercel AI SDK (`ai` / `@ai-sdk/*`) is a
TypeScript package with no Python port. Python apps that call a
Vercel-AI-backed HTTP endpoint should fall through to the
`source-otel-genai.md` adapter instead — the attribute namespace that
Vercel emits (`ai.*`) is a JS-runtime concern and will never show up
in Python process traces.

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
registration; the spans flow into whatever provider the app
constructs.

## 2. Trace-shape schema

**Primary instrumentation scope:** `ai` (the bare `ai` package's
tracer name; matches the `ai` prefix in
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`). Sub-scopes like
`ai.generateText` / `ai.streamText` also satisfy the prefix match.

Vercel AI emits OTel spans under the `ai.*` attribute namespace. The
mapper will see a tree of spans per user call:

| Span name                      | Emitted by                                       |
|--------------------------------|--------------------------------------------------|
| `ai.generateText`              | top-level `generateText(...)` call               |
| `ai.generateText.doGenerate`   | per-attempt provider call under `generateText`   |
| `ai.streamText`                | top-level `streamText(...)` call                 |
| `ai.streamText.doStream`       | per-attempt provider call under `streamText`     |
| `ai.generateObject`            | top-level `generateObject(...)` call             |
| `ai.streamObject`              | top-level `streamObject(...)` call               |
| `ai.embed` / `ai.embedMany`    | `embed(...)` / `embedMany(...)` calls            |
| `ai.toolCall`                  | one per tool invocation under a `generateText` / `streamText` span |

Key attributes the mapper cares about:

- `ai.telemetry.functionId` — user-provided literal passed as
  `experimental_telemetry: { functionId: "..." }`. When present, this
  is the strongest mapping signal (direct literal match to code).
- `ai.telemetry.metadata.*` — user-provided keys, same semantics.
- `ai.model.id`, `ai.model.provider` — resolved model; useful for the
  correlator's semantic diff, not the mapping itself.
- `ai.prompt` — JSON-stringified input (messages + settings).
- `ai.prompt.messages` — JSON-encoded messages array.
- `ai.response.text` — model output (for streamText, concatenated).
- `ai.toolCall.name`, `ai.toolCall.args`, `ai.toolCall.result` — on
  `ai.toolCall` spans; tool name is the **map key** in the
  `tools: { ... }` object passed to `generateText` / `streamText`.

Minimal example (one `generateText` call that invoked a tool):

```json
{
  "trace_id": "trace_abc",
  "spans": [
    {
      "span_id": "span_1",
      "name": "ai.generateText",
      "attributes": {
        "ai.telemetry.functionId": "checkout-agent",
        "ai.model.id": "gpt-4o",
        "ai.model.provider": "openai.chat",
        "ai.prompt.messages": "[{\"role\":\"system\",\"content\":\"You help users complete checkout...\"}]"
      }
    },
    {
      "span_id": "span_2",
      "parent_id": "span_1",
      "name": "ai.toolCall",
      "attributes": {
        "ai.toolCall.name": "refundOrder",
        "ai.toolCall.args": "{\"orderId\":\"12345\"}"
      }
    }
  ]
}
```

See [ai-sdk.dev/docs/ai-sdk-core/telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
for the full attribute list.

## 3. Code-side conventions

Call-site patterns (identify the module that produced an `ai.*` span):

- `generateText\(\s*\{` (TS/JS)
- `streamText\(\s*\{`
- `generateObject\(\s*\{`
- `streamObject\(\s*\{`
- `embed\(\s*\{`
- `embedMany\(\s*\{`

`functionId` mapping (strongest signal — direct literal match):

- `experimental_telemetry:\s*\{[^}]*functionId:\s*["']<NAME>["']` —
  the trace's `ai.telemetry.functionId` equals `<NAME>`.

Tool registration (tool name = property key in the `tools` object
passed to `generateText` / `streamText`):

- `tools:\s*\{[^}]*?<NAME>\s*:\s*tool\(` — `<NAME>` is the literal key.
- Standalone helper form: `const\s+<VAR>\s*=\s*tool\(\s*\{` followed
  by inclusion in a `tools: { <NAME>: <VAR>, ... }` map; the trace
  name still equals the map key, not the variable.

Prompt mapping — search inside the same `generateText` / `streamText`
call object:

- `system:\s*["']<PROMPT>["']` (or template-literal backticks)
- `prompt:\s*["']<PROMPT>["']`
- `messages:\s*\[\s*\{\s*role:\s*["']system["']\s*,\s*content:\s*["']<PROMPT>["']`

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `functionId:` value is a variable, config lookup, or interpolated
  template literal rather than a plain string literal — the trace's
  literal cannot be matched to source by grep.
- The `tools` map is spread (`tools: { ...sharedTools, ... }`) or
  assembled by a helper; the trace tool name may resolve to a key
  defined outside the call site.
- `system` / `prompt` is a variable, file-loader output
  (`readFileSync(...)`, `fs.readFile(...)`), or a template literal
  with interpolation — the prompt body in the trace was composed at
  runtime and will not match any literal in source.
- Model / provider is selected dynamically (e.g.
  `model: providers[env.MODEL]`) — not a mapping blocker, but flag it
  so the correlator knows the model choice itself may be
  config-driven rather than code-driven.
- More than one `generateText` / `streamText` call exists in the same
  module **and** none of them set `functionId` — span name alone
  cannot disambiguate which call produced the trace.

## 5. Minimum required fields

The mapper needs at least one of:

- `ai.telemetry.functionId` (best — direct literal match to code)
- `ai.toolCall.name` on a `ai.toolCall` span (maps to the tool map
  key in the enclosing `generateText` / `streamText` call)
- `ai.prompt` / `ai.prompt.messages` body (maps to a literal
  `system:` / `prompt:` string)
- Span name (`ai.generateText`, `ai.streamText`, etc.) as a last
  resort — narrows to the call kind but not a specific site; only
  useful when the repo has a single call of that kind.

If only `trace_id` and timestamps are present, return
`status: "unresolved"` with reason "insufficient trace fields — need
functionId, tool name, or prompt body".
