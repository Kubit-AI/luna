# Langfuse Adapter

Covers Langfuse's two officially-supported SDKs: Python (`langfuse`) and
JS/TS (`langfuse`, `@langfuse/tracing`, `@langfuse/openai`). Both Python v2
(legacy `langfuse.trace()` / `.span()` / `.generation()`) and v3
(`@observe` decorator, `start_as_current_observation`) are included.

**Cross-reference:** For Java, Go, Rust, .NET, or other non-Python/JS repos
that send to Langfuse via the OpenTelemetry endpoint, prefer
`otel-genai.md` — Langfuse's recommended path for those languages is OTel,
and the span shape at the wire matches the OTel GenAI conventions.
Community SDKs (Ruby, Elixir, PHP, etc.) are out of scope.

## 1. Dependency signals

Grep these patterns in manifests and imports:

- `langfuse` in `pyproject.toml` / `requirements.txt` (Python)
- `langfuse`, `@langfuse/tracing`, `@langfuse/openai`, `@langfuse/core`, or
  `@langfuse/otel` in `package.json` (JS/TS)
- `from langfuse import` / `import langfuse` in Python
- `from "langfuse"` / `from "@langfuse/tracing"` / `from "@langfuse/openai"`
  in TS/JS
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` env-var
  references

## 2. Trace-shape schema

Langfuse's stable unit is the `Observation` — a node in a trace tree. Every
observation has:

| Field                   | Type                                                                                                                     | Carries                               |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `name`                  | string                                                                                                                   | Component name (function name default)|
| `type`                  | `"span" \| "generation" \| "tool" \| "agent" \| "chain" \| "retriever" \| "embedding" \| "evaluator" \| "guardrail"`     | Role of the observation               |
| `input`                 | object                                                                                                                   | Prompt messages / args                |
| `output`                | object (nullable)                                                                                                        | Generated text / result               |
| `model`                 | string (generation only)                                                                                                 | Model id                              |
| `metadata`              | object                                                                                                                   | User labels                           |
| `prompt`                | `{ name, version, label }` (nullable)                                                                                    | Link to Langfuse Prompt Management    |
| `parent_observation_id` | uuid (nullable)                                                                                                          | Tree edge                             |
| `level`                 | `"DEBUG" \| "DEFAULT" \| "WARNING" \| "ERROR"`                                                                           | Status                                |
| `status_message`        | string (nullable)                                                                                                        | Failure reason when level=ERROR       |

Minimal example (one trace with a generation observation linked to a
managed prompt, plus a child tool observation):

```json
{
  "trace_id": "t_abc...",
  "observations": [
    {
      "name": "generate-response",
      "type": "generation",
      "model": "gpt-4",
      "input": {
        "messages": [
          { "role": "system", "content": "You are a movie critic..." },
          { "role": "user", "content": "Review Dune 2" }
        ]
      },
      "output": { "role": "assistant", "content": "..." },
      "prompt": { "name": "movie-critic", "version": 3, "label": "production" }
    },
    {
      "name": "fetch-related-articles",
      "type": "tool",
      "parent_observation_id": "<gen-id>",
      "input": { "query": "Dune 2" },
      "output": [{ "title": "...", "url": "..." }]
    }
  ]
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given `name` was registered.

**Python v3** (current — decorators and context managers):

- `@observe\(\s*name\s*=\s*["']<NAME>["']` — explicit name override
- `@observe\b` decorator on a `def <NAME>` (function name becomes
  observation name by default)
- `@observe\([^)]*as_type\s*=\s*["'](generation|tool|agent|retriever)["']`
  — typed observation
- `start_as_current_observation\(\s*name\s*=\s*["']<NAME>["']`
- `langfuse\.get_prompt\(\s*["']<NAME>["']` — Prompt Management fetch

**Python v2** (legacy, still widely deployed):

- `langfuse\.trace\(\s*name\s*=\s*["']<NAME>["']`
- `langfuse\.span\(\s*name\s*=\s*["']<NAME>["']`
- `langfuse\.generation\(\s*name\s*=\s*["']<NAME>["']`

**JS / TS:**

- `observe\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']` — the
  `observe(fn, { name: ... })` wrapper from `@langfuse/tracing`
- `startObservation\(\s*["']<NAME>["']`
- `startActiveObservation\(\s*["']<NAME>["']`
- `observeOpenAI\([^)]*traceName:\s*["']<NAME>["']` — OpenAI SDK wrapper
- `langfuse\.getPrompt\(\s*["']<NAME>["']`
- `langfuse\.prompt\.get\(\s*["']<NAME>["']` — newer v4 spelling

**Prompt-body mapping.** When the trace carries `prompt.name`, that is the
strongest possible signal — grep for `get_prompt\(["']<prompt.name>["']` or
`getPrompt\(["']<prompt.name>["']` / `prompt\.get\(["']<prompt.name>["']`
first, then follow the call site back to where the compiled prompt is
passed into the generation. Only fall back to substring-matching
`input.messages[*].content` against template files / string literals when
no `prompt.name` is present.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The `name` argument is a variable, f-string, or template literal — not a
  string literal. (Pattern: `@observe\(\s*name\s*=\s*[^"'\)]` or the
  equivalent in `{ name: ... }`.)
- Multiple `@observe` or `observe(...)` registrations share the same name.
- `as_type` is bound to a config lookup or variable rather than a literal
  — the observed type may not match what the adapter expects.
- `prompt.version` in the trace does not match any version hardcoded in
  the repo — the runtime prompt has drifted from what's checked in, so
  any code-side literal match is stale.
- `observeOpenAI(...)` is called without `traceName` — the default falls
  back to the model name, which is non-unique across call sites.
- A custom span processor / exporter is configured (e.g. `LangfuseSpanProcessor`
  subclass or Python's `set_span_processor(...)`) — span attributes may be
  renamed or filtered before export.
- Bare `@observe()` on a generically named function such as `def handler`,
  `def run`, `def process` — even a single match should be treated as
  ambiguous because the same observation name is likely to appear in
  multiple places.

## 5. Minimum required fields

The mapper needs at least one of:

- Observation `name`
- `prompt.name` (Prompt Management linkage — strongest)
- `input.messages[].content` for substring match against prompt templates

If the handoff carries only `trace_id` and timestamps, the mapper returns
`status: "unresolved"` with reason "insufficient trace fields — need
observation name, prompt name, or input content".
