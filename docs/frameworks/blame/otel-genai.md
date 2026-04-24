# OpenTelemetry GenAI Adapter

Covers OTel-native tracing that follows the GenAI semantic conventions
(`gen_ai.*` attributes). Because OTel is provider-neutral, the mapper may need
to search broadly across multiple instrumentation libraries
(`opentelemetry-instrumentation-openai`, `-anthropic`, `-google-genai`, etc.).

## 1. Dependency signals

- `opentelemetry-api`, `opentelemetry-sdk` in Python manifests
- `@opentelemetry/api`, `@opentelemetry/sdk-trace-*` in `package.json`
- Any `opentelemetry-instrumentation-*genai*` or `opentelemetry-instrumentation-openai` etc. dependency
- `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` env var (signals the latest GenAI conventions are in use)
- Imports of `opentelemetry.trace` plus any `gen_ai.` attribute string literal

## 2. Trace-shape schema

Spans carry GenAI semantic attributes. The subset the mapper uses:

| Attribute                     | Carries                                        |
|-------------------------------|------------------------------------------------|
| `gen_ai.agent.name`           | Agent name                                     |
| `gen_ai.agent.id`             | Stable agent id (may appear without name)      |
| `gen_ai.operation.name`       | `chat` / `execute_tool` / `create_agent` / `generate_content` / `text_completion` / `embeddings` |
| `gen_ai.tool.name`            | Tool name (for `execute_tool` operations)      |
| `gen_ai.prompt.name`          | Named prompt identifier                        |
| `gen_ai.system_instructions`  | System prompt body (JSON-encoded)              |
| `gen_ai.input.messages`       | Chat input messages (JSON array)               |
| `gen_ai.output.messages`      | Generated messages (JSON array)                |
| `gen_ai.request.model`        | Model requested                                |
| `gen_ai.response.model`       | Model that responded                           |
| `gen_ai.provider.name`        | `openai`, `gcp.vertex_ai`, etc.                |
| `gen_ai.conversation.id`      | Conversation / session id                      |

Minimal example (agent span):

```json
{
  "name": "create_agent Math Tutor",
  "attributes": {
    "gen_ai.operation.name": "create_agent",
    "gen_ai.provider.name": "openai",
    "gen_ai.agent.name": "Math Tutor",
    "gen_ai.agent.id": "asst_5j66UpCpwteGg4YSxUnt7lPY",
    "gen_ai.request.model": "gpt-4"
  }
}
```

## 3. Code-side conventions

OTel GenAI instrumentation is heterogeneous. Grep patterns:

- Literal attribute sets:
  - `set_attribute\(\s*["']gen_ai\.agent\.name["']\s*,\s*["']<NAME>["']`
  - `"gen_ai\.agent\.name"\s*:\s*["']<NAME>["']` (dict-style span construction)
  - `SpanAttributes\.GEN_AI_AGENT_NAME` references in TS/JS
- Tool registration: `set_attribute\(\s*["']gen_ai\.tool\.name["']\s*,\s*["']<NAME>["']`
- Span starts that likely produce GenAI spans:
  - `start_as_current_span\(.*["']gen_ai["']`
  - `tracer\.start_span\(.*gen_ai\.`
- For `gen_ai.prompt.name`, grep prompt registries in the repo (`prompts/*.yaml`, `prompts.py`, etc.) for a matching `name:` entry.
- For `gen_ai.system_instructions` / `gen_ai.input.messages`, substring-match
  the JSON-decoded text content against prompt template files.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `set_attribute` receives a variable rather than a literal (e.g.
  `set_attribute("gen_ai.agent.name", agent_name_var)`)
- The instrumentation library is third-party and auto-derives names (e.g.
  `opentelemetry-instrumentation-openai` injecting model names) — look for
  dependencies matching `opentelemetry-instrumentation-.*` with no matching
  literal `set_attribute` in the repo
- Multiple spans with the same `gen_ai.agent.name` literal exist in
  different files
- Messages contain template placeholders (`{var}`, Jinja `{{...}}`)

## 5. Minimum required fields

The mapper needs at least one of:

- `gen_ai.agent.name`
- `gen_ai.tool.name`
- `gen_ai.prompt.name`
- `gen_ai.system_instructions` (body)
- `gen_ai.input.messages` (body)

If only opaque ids (`gen_ai.agent.id`, `gen_ai.response.id`) are present,
return `status: "unresolved"` with reason "insufficient trace fields — opaque
ids cannot be grepped against code".
