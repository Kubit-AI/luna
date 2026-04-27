# Traceloop / OpenLLMetry Source Adapter (blame)

Covers the Traceloop SDKs that ship the OpenLLMetry instrumentation
suite — Python `traceloop-sdk` and JS/TS `@traceloop/node-server-sdk`.
Spans appear under the `traceloop.tracer` (Python) and `@traceloop`
(JS/TS) instrumentation scopes and use the `traceloop.*` attribute
namespace alongside legacy indexed `gen_ai.prompt.<n>.*` for messages.

**Cross-reference — OTel GenAI.** Traceloop emits legacy indexed
`gen_ai.prompt.<n>.*` and `gen_ai.completion.<n>.*` shapes. Repos
that also use raw OTel GenAI manual spans may produce overlapping
identifier matches; defer to scope name (`traceloop.tracer` /
`@traceloop`) to disambiguate.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt`:
  - `traceloop-sdk`
  - `opentelemetry-instrumentation-openllmetry-*` (rare; usually
    bundled inside `traceloop-sdk`)
- TypeScript — `package.json`:
  - `@traceloop/node-server-sdk`
  - `@traceloop/instrumentation-*` (any sub-instrumentation)
- Imports:
  - Python: `from traceloop.sdk import Traceloop`,
    `from traceloop.sdk.decorators import workflow, task, agent, tool`,
    `from traceloop.sdk.tracing import set_external_prompt_tracing_context`
  - TS/JS: `from "@traceloop/node-server-sdk"`,
    `import { initialize, withWorkflow, withTask } from "@traceloop/node-server-sdk"`
- Activation calls:
  - Python: `Traceloop.init(`, `Traceloop.set_association_properties(`
  - TS/JS: `initialize({ appName: ..., apiKey: ... })`
- Decorators in source:
  - Python: `@workflow`, `@task`, `@agent`, `@tool` (from
    `traceloop.sdk.decorators`)
  - TS/JS: `withWorkflow(...)`, `withTask(...)`, `withAgent(...)`,
    `withTool(...)`
- Env vars: `TRACELOOP_API_KEY`, `TRACELOOP_BASE_URL`,
  `TRACELOOP_APP_NAME`

## 2. Trace-shape schema

**Primary instrumentation scopes:** `traceloop.tracer` (Python
SDK tracer name) and `@traceloop` (JS/TS package prefix; matches
`@traceloop/node-server-sdk` and any `@traceloop/instrumentation-*`).
Both prefixes appear in `KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`.

Traceloop spans use a mixed namespace: `traceloop.*` for workflow /
task / association metadata, plus legacy indexed `gen_ai.prompt.<n>.*`
for messages, plus `llm.*` for model parameters. Subset the mapper
uses:

| Attribute                                | Carries                                                  |
|------------------------------------------|----------------------------------------------------------|
| `traceloop.workflow.name`                | Workflow name (from `@workflow(name=...)`)               |
| `traceloop.entity.name`                  | Entity name on a `@task` / `@agent` / `@tool` span       |
| `traceloop.entity.path`                  | Dotted path of nested `@workflow` / `@task` decorators   |
| `traceloop.span.kind`                    | `"workflow" \| "task" \| "agent" \| "tool"`              |
| `traceloop.association.properties.*`     | User association properties (e.g. `user_id`, `chat_id`)  |
| `traceloop.prompt.key`                   | Named prompt key (Traceloop Prompt Registry)             |
| `traceloop.prompt.version`               | Prompt version                                           |
| `traceloop.prompt.template`              | Rendered prompt template body                            |
| `gen_ai.prompt.<n>.role`                 | Legacy indexed input messages                            |
| `gen_ai.prompt.<n>.content`              | Legacy indexed input message body                        |
| `gen_ai.completion.<n>.role`             | Legacy indexed output messages                           |
| `gen_ai.completion.<n>.content`          | Legacy indexed output message body                       |
| `llm.request.model` / `llm.response.model` | Model id (alternate to `gen_ai.request.model`)         |
| `llm.usage.total_tokens`                 | Aggregate token count                                    |
| `traceloop.entity.input` / `.output`     | Decorator-captured input / output (JSON)                 |

The span `name` follows the decorator convention:
`<workflow_name>.workflow`, `<task_name>.task`,
`<agent_name>.agent`, `<tool_name>.tool`.

Minimal example (one `@workflow`-decorated function with a child
`@task`):

```json
{
  "trace_id": "t_abc",
  "spans": [
    {
      "name": "checkout.workflow",
      "attributes": {
        "traceloop.workflow.name": "checkout",
        "traceloop.span.kind": "workflow",
        "traceloop.association.properties.user_id": "u_42"
      }
    },
    {
      "name": "validate_cart.task",
      "attributes": {
        "traceloop.entity.name": "validate_cart",
        "traceloop.span.kind": "task",
        "traceloop.entity.path": "checkout.validate_cart",
        "gen_ai.prompt.0.role": "system",
        "gen_ai.prompt.0.content": "Validate the cart contents..."
      }
    }
  ]
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given workflow / task /
agent / tool name was registered.

**Python:**

- `@workflow\(\s*name\s*=\s*["']<NAME>["']` — explicit name override
- `@workflow\b` decorator on a `def <NAME>` (function name becomes
  workflow name by default)
- `@task\(\s*name\s*=\s*["']<NAME>["']` / bare `@task` on `def <NAME>`
- `@agent\(\s*name\s*=\s*["']<NAME>["']` / bare `@agent` on `def <NAME>`
- `@tool\(\s*name\s*=\s*["']<NAME>["']` / bare `@tool` on `def <NAME>`
  (the Traceloop `@tool`, not LangChain's — they live in
  `traceloop.sdk.decorators`)
- `Traceloop\.set_prompt\(\s*key\s*=\s*["']<KEY>["']` — Prompt
  Registry write
- `Traceloop\.get_prompt\(\s*key\s*=\s*["']<KEY>["']` — Prompt
  Registry fetch (maps `traceloop.prompt.key`)
- Async variants: `@aworkflow`, `@atask`, `@aagent`, `@atool`

**JS / TS:**

- `withWorkflow\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `withTask\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `withAgent\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `withTool\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `getPrompt\(\s*\{\s*[^}]*key:\s*["']<KEY>["']`

**Prompt-body matching.** When the trace carries
`gen_ai.prompt.<n>.content` or `traceloop.prompt.template`,
substring-match the decoded body against in-repo prompt template
literals and `prompts/*.yaml` files. `traceloop.prompt.key` is the
strongest signal — match against `get_prompt(key=...)` call sites.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The decorator `name` argument is a variable, f-string, or template
  literal rather than a string literal.
- Multiple `@workflow` / `@task` / `@agent` / `@tool` registrations
  share the same name (Traceloop allows this; `traceloop.entity.path`
  may distinguish them but only when nesting is unique).
- Bare `@task` / `@agent` on a generically named function
  (`def handler`, `def run`, `def process`).
- `traceloop.entity.path` is missing from the span and the same
  entity name appears under multiple parent workflows.
- A custom `Traceloop.set_association_properties(...)` is called in
  more than one place — association property values cannot be
  mapped back to a single registration site.

## 5. Minimum required fields

The mapper needs at least one of:

- `traceloop.workflow.name` or `traceloop.entity.name` (best —
  decorator name)
- `traceloop.prompt.key` (Prompt Registry linkage — strongest when
  present)
- `traceloop.entity.path` plus a sufficiently specific tail name
- `gen_ai.prompt.<n>.content` for substring match against prompt
  templates / string literals in the repo

If only `traceloop.association.properties.*` and timestamps are
present, return `status: "unresolved"` with reason "insufficient
trace fields — need workflow / task / tool name, prompt key, or
prompt body".
