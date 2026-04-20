# OpenInference (Arize Phoenix) Adapter

Covers the OpenInference instrumentation family used by Arize Phoenix,
Arize AX, and any downstream tool that follows the OpenInference semantic
conventions. Ships official SDKs for Python (`arize-phoenix-otel`,
`openinference-instrumentation-*`) and TypeScript (`@arizeai/phoenix-otel`,
`@arizeai/openinference-*`).

**Cross-reference:** OpenInference extends OTel with its own
`openinference.span.kind` attribute and `llm.*`/`tool.*` prefixes. Fall
back to `otel-genai.md` if a trace carries only `gen_ai.*` standard
attributes without any OpenInference markers.

## 1. Dependency signals

Python:

- `arize-phoenix-otel`, `arize-phoenix` in `pyproject.toml` / `requirements.txt`
- `openinference-instrumentation-openai` (or `-anthropic`, `-langchain`,
  `-llamaindex`, `-crewai`, `-dspy`, `-mistralai`, `-bedrock`, `-groq`, etc.)
- `openinference-semantic-conventions`
- `from phoenix.otel import register` / `from openinference.semconv.trace import`
- `PHOENIX_API_KEY`, `PHOENIX_COLLECTOR_ENDPOINT` env vars

TypeScript / JS:

- `@arizeai/phoenix-otel` in `package.json`
- `@arizeai/openinference-instrumentation-openai` (or `-langchain`,
  `-vercel`, etc.)
- `@arizeai/openinference-semantic-conventions`
- `import { register } from "@arizeai/phoenix-otel"`
- `import { traceAgent, traceTool, traceChain, withSpan } from "@arizeai/phoenix-otel"`

## 2. Trace-shape schema

Spans use OpenInference attributes layered on OTel:

| Field                                | Type                                                                     | Carries                         |
|--------------------------------------|--------------------------------------------------------------------------|---------------------------------|
| `name`                               | string                                                                   | Decorator/helper name           |
| `openinference.span.kind`            | `"AGENT" \| "TOOL" \| "CHAIN" \| "LLM" \| "RETRIEVER" \| "EMBEDDING" \| "RERANKER" \| "EVALUATOR" \| "GUARDRAIL"` | Semantic role  |
| `input.value` / `output.value`       | json / string                                                            | Call arguments / return value   |
| `llm.model_name`                     | string                                                                   | Generation model id             |
| `llm.input_messages`                 | array                                                                    | Prompt messages                 |
| `llm.output_messages`                | array                                                                    | Completion messages             |
| `llm.prompt_template.template`       | string                                                                   | Literal prompt template         |
| `llm.prompt_template.variables`      | json                                                                     | Rendered variables              |
| `tool.name` / `tool.description`     | string                                                                   | Tool identifier and description |
| `tool.parameters`                    | json                                                                     | Tool call arguments             |
| `session.id` / `user.id`             | string                                                                   | Association metadata            |

Minimal example (agent → tool → LLM):

```json
{
  "spans": [
    {
      "name": "support-agent",
      "attributes": { "openinference.span.kind": "AGENT" }
    },
    {
      "name": "search-docs",
      "attributes": {
        "openinference.span.kind": "TOOL",
        "tool.name": "search-docs"
      }
    },
    {
      "name": "invoke_llm",
      "attributes": {
        "openinference.span.kind": "LLM",
        "llm.model_name": "gpt-4",
        "llm.prompt_template.template": "You are a support agent. {question}"
      }
    }
  ]
}
```

## 3. Code-side conventions

**Python** — decorators exposed by `tracer` instances from
`phoenix.otel.register()`:

- `@tracer\.agent\b` on a `def <NAME>` (function name = span name default)
- `@tracer\.tool\b` on a `def <NAME>`
- `@tracer\.chain\b` on a `def <NAME>`
- `@tracer\.llm\b` on a `def <NAME>` — often with `process_input` / `process_output`
- `@tracer\.(agent|tool|chain|llm)\(\s*name\s*=\s*["']<NAME>["']` — name override
- `@tracer\.tool\(\s*name\s*=\s*["']<NAME>["'],\s*description\s*=` — override with description

Low-level OTel form (common in custom instrumentation):

- `tracer\.start_as_current_span\(\s*["']<NAME>["']` followed within a few
  lines by `SpanAttributes\.OPENINFERENCE_SPAN_KIND` or
  `SpanAttributes\.TOOL_NAME`

**TypeScript** — helpers from `@arizeai/phoenix-otel`:

- `traceAgent\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `traceTool\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `traceChain\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `withSpan\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["'][^}]*kind:\s*["'](LLM|TOOL|RETRIEVER|AGENT|CHAIN|EMBEDDING|EVALUATOR|GUARDRAIL)["']`

For prompt mapping, OpenInference surfaces literal prompts via
`llm.prompt_template.template`. Grep prompt template files or
`@tracer.llm`-decorated functions for that exact substring first — it is
the strongest signal. Fall back to substring-matching `llm.input_messages`
content against string literals in the repo.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `name=` argument is a variable, f-string, or template literal rather than
  a string literal.
- Bare `@tracer.agent` / `@tracer.tool` / `@tracer.chain` on a generically
  named function (`def run`, `def handler`, `def call`).
- `@tracer.tool(name=...)` with a `name` that does not match the decorated
  function name — grep hits for both the name literal and the function
  name should be treated as competing candidates.
- Multiple `@tracer.*` decorators share the same `name=`.
- The trace was produced by an auto-instrumentor (e.g.
  `openinference-instrumentation-langchain`, `-llamaindex`) rather than
  manual decorators — span names derive from framework internals and
  grep patterns for user-code registrations will miss. In this case,
  consult the corresponding framework adapter instead (e.g. `langsmith.md`
  for LangChain traces).
- A custom span processor is registered that rewrites `openinference.span.kind`.

## 5. Minimum required fields

Mapper needs at least one of:

- Span `name` combined with `openinference.span.kind`
- `tool.name`
- `llm.prompt_template.template` (strongest for prompt mapping)
- `llm.input_messages[*].content` substring

If the handoff carries only `trace_id` and timestamps, return
`status: "unresolved"` with reason "insufficient trace fields — need
OpenInference span name, tool name, or prompt template".
