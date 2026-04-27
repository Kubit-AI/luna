# Braintrust Sink Adapter (blame)

Covers Braintrust's two officially-supported SDKs: Python (`braintrust`)
and JS/TS (`braintrust`, `@braintrust/otel`). Both the legacy
`@traced` / `start_span` API and the OTel-compat mode
(`BRAINTRUST_OTEL_COMPAT=true` / `setupOtelCompat()`) are covered.

**Cross-reference — OTel-compat mode.** Repos running with
`BRAINTRUST_OTEL_COMPAT=true` (Python) or a `setupOtelCompat()` call
(TS) emit OTel GenAI-shaped spans (`gen_ai.*` attributes) instead of
the native Braintrust `Span` shape. For traces produced under
compat mode, `source-otel-genai.md` may give a cleaner code-side
match — its grep patterns target `gen_ai.agent.name` / `gen_ai.tool.name`
literals directly. Use both adapters together when compat mode is
active; the Braintrust one still carries the code-side decorator
patterns (`@traced`, `wrapTraced`) the user wrote.

**Cross-reference — LangChain.** When `langchain` is also detected,
Braintrust's `BraintrustCallbackHandler` (Python
`from braintrust.integrations.langchain import BraintrustCallbackHandler`,
TS `from "@braintrust/langchain-js"`) routes LangChain spans through
this adapter's shape **only when OTel-compat mode is active**.
Without compat mode, LangChain spans post to Braintrust through its
native pipeline and Kubit cannot see them. See `source-langchain.md`
for the code-side patterns and the compat-mode caveat.

## 1. Dependency signals

Grep these patterns in manifests and imports:

- `braintrust` in `pyproject.toml` / `requirements.txt` (Python)
- `braintrust[otel]` extras in `pyproject.toml` / `requirements.txt`
- `braintrust` or `@braintrust/otel` in `package.json` (JS/TS)
- `import braintrust` / `from braintrust import` in Python
- `from "braintrust"` / `from "@braintrust/otel"` in TS/JS
- `BRAINTRUST_API_KEY`, `BRAINTRUST_PARENT`, `BRAINTRUST_OTEL_COMPAT`
  env-var references

## 2. Trace-shape schema

**Primary instrumentation scope:** `braintrust` (and any
`braintrust.*` / `braintrust-*` sub-scope). Matches the
kubit-otel filter prefix; native `@traced` spans and OTel-compat
spans both ship under this scope.

Braintrust's stable unit is the `Span` — a node in a trace tree (rooted
at an Experiment, Logger, or Project). Every span has:

| Field              | Type                                                     | Carries                                  |
|--------------------|----------------------------------------------------------|------------------------------------------|
| `name`             | string                                                   | Operation name (function name default)   |
| `span_attributes.type` | `"llm" \| "tool" \| "function" \| "task" \| "score" \| "eval"` | Role of the span                  |
| `input`            | object                                                   | Prompt messages / args                   |
| `output`           | object (nullable)                                        | Generated text / result                  |
| `metadata`         | object                                                   | User labels (model, temperature, …)      |
| `metrics`          | object                                                   | Tokens, latency, cost                    |
| `parent_span_id`   | uuid (nullable)                                          | Tree edge                                |
| `error`            | string (nullable)                                        | Failure reason                           |
| `span_attributes.purpose` | string (nullable)                                 | Optional sub-role tag                    |

Minimal example (one root function span with a child llm span and a
child tool span):

```json
{
  "trace_id": "t_abc...",
  "spans": [
    {
      "span_id": "s_root",
      "name": "generate-response",
      "span_attributes": { "type": "function" },
      "input": { "query": "Review Dune 2" },
      "output": { "text": "..." }
    },
    {
      "span_id": "s_llm",
      "parent_span_id": "s_root",
      "name": "openai.chat.completions.create",
      "span_attributes": { "type": "llm" },
      "input": {
        "messages": [
          { "role": "system", "content": "You are a movie critic..." },
          { "role": "user", "content": "Review Dune 2" }
        ]
      },
      "output": { "role": "assistant", "content": "..." },
      "metadata": { "model": "gpt-4" }
    },
    {
      "span_id": "s_tool",
      "parent_span_id": "s_root",
      "name": "fetch-related-articles",
      "span_attributes": { "type": "tool" },
      "input": { "query": "Dune 2" },
      "output": [{ "title": "...", "url": "..." }]
    }
  ]
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given `name` was
registered.

**Python:**

- `@traced\(\s*name\s*=\s*["']<NAME>["']` — explicit name override
- `@braintrust\.traced\b` / `@traced\b` decorator on `def <NAME>`
  (function name becomes span name by default)
- `start_span\(\s*name\s*=\s*["']<NAME>["']`
- `braintrust\.start_span\(\s*name\s*=\s*["']<NAME>["']`
- `current_span\(\)\.start_span\(\s*name\s*=\s*["']<NAME>["']`
- `init_logger\(\s*project\s*=\s*["']<PROJECT>["']` — locates the
  Logger that roots the trace
- `wrap_openai\(` — auto-instruments OpenAI calls; child span names
  default to the OpenAI operation name

**JS / TS:**

- `wrapTraced\([^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']` — the
  `wrapTraced(fn, { name: ... })` wrapper
- `startSpan\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `currentSpan\(\)\.startSpan\(`
- `wrapOpenAI\(` — auto-instruments OpenAI calls; default span names
  follow the OpenAI operation
- `initLogger\(\s*\{\s*[^}]*projectName:\s*["']<PROJECT>["']` —
  Logger that roots the trace

**Auto-instrumented LLM spans.** Spans produced by `wrap_openai` /
`wrapOpenAI` carry names like `openai.chat.completions.create` — these
won't appear as string literals in user code. Map them to the call
site of the wrapper, then walk forward to the wrapped client's usage.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The `name` argument is a variable, f-string, or template literal —
  not a string literal. (Pattern: `@traced\(\s*name\s*=\s*[^"'\)]` or
  the equivalent in `{ name: ... }`.)
- Multiple `@traced` or `wrapTraced(...)` registrations share the
  same name.
- `wrapOpenAI(...)` / `wrap_openai(...)` is used in more than one
  place — auto-generated span names are non-unique across call sites.
- A custom span processor subclasses `BraintrustSpanProcessor` or sets
  a `customFilter` / `custom_filter` — span attributes may be renamed
  or filtered before export.
- Bare `@traced` on a generically named function such as
  `def handler`, `def run`, `def process` — even a single match should
  be treated as ambiguous because the same span name is likely to
  appear in multiple places.
- The trace was emitted with `BRAINTRUST_OTEL_COMPAT=true` and the
  span's `name` follows OTel GenAI conventions
  (`gen_ai.<operation>`) — prefer the `source-otel-genai.md` adapter for that
  trace.

## 5. Minimum required fields

The mapper needs at least one of:

- Span `name`
- `span_attributes.purpose` plus enough metadata to disambiguate
- `input.messages[].content` for substring match against prompt
  templates / string literals in the repo

If the handoff carries only `span_id` and timestamps, the mapper
returns `status: "unresolved"` with reason "insufficient trace fields
— need span name or input content".
