# OpenLLMetry (Traceloop) Adapter

Covers Traceloop's OpenLLMetry SDK for Python (`traceloop-sdk`) and
TypeScript (`@traceloop/node-server-sdk`). Built on OpenTelemetry, but adds
distinct decorator-driven semantic conventions (`@workflow`, `@task`,
`@agent`, `@tool`) that the generic `otel-genai.md` adapter does not catch.

**Cross-reference:** Traces exported by OpenLLMetry also follow OTel
semantic conventions, so `otel-genai.md` is a useful fallback when the
trace carries only `gen_ai.*` attributes and no Traceloop-specific span
names.

## 1. Dependency signals

- `traceloop-sdk` in `pyproject.toml` / `requirements.txt`
- `@traceloop/node-server-sdk` in `package.json`
- `from traceloop.sdk import Traceloop` / `from traceloop.sdk.decorators import`
- `import * as traceloop from "@traceloop/node-server-sdk"`
- `TRACELOOP_API_KEY`, `TRACELOOP_BASE_URL` env-var references
- `Traceloop.init(` call in Python or `traceloop.initialize(` in TS

## 2. Trace-shape schema

Spans follow OTel GenAI conventions plus Traceloop semantic types:

| Field                          | Type                                         | Carries                        |
|--------------------------------|----------------------------------------------|--------------------------------|
| `name`                         | string                                       | Decorator `name=` argument     |
| `traceloop.span.kind`          | `"workflow" \| "task" \| "agent" \| "tool"`  | Semantic role                  |
| `traceloop.workflow.name`      | string                                       | Parent workflow name           |
| `traceloop.entity.name`        | string                                       | Entity (function/class) name   |
| `traceloop.entity.input`       | json string                                  | Captured args                  |
| `traceloop.entity.output`      | json string                                  | Return value                   |
| `traceloop.association.*`      | string                                       | Custom tags / request ids      |
| `gen_ai.*`                     | varies                                       | Standard OTel GenAI attributes |

Minimal example (one workflow with a nested task and tool):

```json
{
  "trace_id": "abc...",
  "spans": [
    {
      "name": "research_workflow",
      "attributes": {
        "traceloop.span.kind": "workflow",
        "traceloop.entity.name": "run_research"
      }
    },
    {
      "name": "research_agent",
      "attributes": {
        "traceloop.span.kind": "agent",
        "traceloop.workflow.name": "research_workflow"
      }
    },
    {
      "name": "web_search",
      "attributes": {
        "traceloop.span.kind": "tool",
        "traceloop.workflow.name": "research_workflow"
      }
    }
  ]
}
```

## 3. Code-side conventions

**Python** — decorators live in `traceloop.sdk.decorators`:

- `@workflow\(\s*name\s*=\s*["']<NAME>["']`
- `@task\(\s*name\s*=\s*["']<NAME>["']`
- `@agent\(\s*name\s*=\s*["']<NAME>["']`
- `@tool\(\s*name\s*=\s*["']<NAME>["']`
- Bare `@workflow`, `@task`, `@agent`, `@tool` on `def <NAME>` — the
  function name becomes the span name by default
- Class-based form: `@agent\(\s*name\s*=\s*["']<NAME>["'],\s*method_name\s*=`
  — the decorator is on the class; the traced method is named by
  `method_name=`

**TypeScript** — helpers from `@traceloop/node-server-sdk`:

- `traceloop\.withWorkflow\(\s*\{\s*name:\s*["']<NAME>["']`
- `traceloop\.withTask\(\s*\{\s*name:\s*["']<NAME>["']`
- `traceloop\.withAgent\(\s*\{\s*name:\s*["']<NAME>["']`
- `traceloop\.withTool\(\s*\{\s*name:\s*["']<NAME>["']`

For prompt-body mapping, OpenLLMetry relies on the underlying LLM-provider
instrumentation (OpenAI, Anthropic, etc.) and writes messages into
`gen_ai.prompt.*` attributes. Substring-match `gen_ai.prompt.*.content`
against prompt templates or string literals inside `@task` / `@agent`
function bodies.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `name=` argument is a variable, f-string, or config lookup rather than a
  literal (pattern: `@(workflow|task|agent|tool)\(\s*name\s*=\s*[^"'\)]`).
- Bare `@task` / `@agent` on a generically named function (`def run`,
  `def handler`, `def process`) — even a single match is non-unique in
  practice.
- Multiple `@workflow`/`@task`/`@agent`/`@tool` decorators share the same
  `name=` string.
- Class-based form (`method_name="..."`) present without a `name=` — the
  traced span uses the class name, which may collide with other classes.
- A custom OTel span processor is configured — span names may be rewritten
  before export.

## 5. Minimum required fields

Mapper needs at least one of:

- Span `name` (when `traceloop.span.kind` is present)
- `traceloop.entity.name`
- `traceloop.workflow.name`
- `gen_ai.prompt.*.content` substring (for prompt-body match)

If the handoff carries only `trace_id`/`span_id` and timestamps, return
`status: "unresolved"` with reason "insufficient trace fields — need
decorator name, entity name, or prompt content".
