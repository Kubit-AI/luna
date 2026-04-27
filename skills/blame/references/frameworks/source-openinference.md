# OpenInference Source Adapter (blame)

Covers the OpenInference / Arize Phoenix instrumentation family —
auto-instrumentations published by Arize for OpenAI, Anthropic,
LangChain, LlamaIndex, DSPy, Bedrock, Mistral, Vertex, Crew AI, and
others. Both Python (`openinference-instrumentation-*`) and JS/TS
(`@arizeai/openinference-*`) packages emit OTel spans under the
`openinference` / `@arizeai/openinference` instrumentation scopes.

OpenInference is largely **automatic** — call sites stay vanilla and
the instrumentation library injects spans wrapping each provider
call. Code-side identifier hooks are therefore weaker than for
manually-instrumented sources; mapping leans on model name and
input-message body matching.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt`:
  - Any `openinference-instrumentation-*` package, e.g.
    `openinference-instrumentation-openai`,
    `openinference-instrumentation-anthropic`,
    `openinference-instrumentation-langchain`,
    `openinference-instrumentation-llama-index`,
    `openinference-instrumentation-dspy`,
    `openinference-instrumentation-bedrock`,
    `openinference-instrumentation-vertexai`,
    `openinference-instrumentation-crewai`
  - `arize-phoenix`, `arize-otel`, `arize-phoenix-otel`,
    `phoenix-evals`
- TypeScript — `package.json`:
  - Any `@arizeai/openinference-*` package, e.g.
    `@arizeai/openinference-instrumentation-openai`,
    `@arizeai/openinference-instrumentation-langchain`,
    `@arizeai/openinference-semantic-conventions`,
    `@arizeai/openinference-core`
- Imports:
  - Python: `from openinference.instrumentation`,
    `from openinference.semconv.trace import SpanAttributes`,
    `from phoenix.otel import register`
  - TS/JS: `from "@arizeai/openinference-*"`,
    `from "@arizeai/openinference-semantic-conventions"`
- Activation calls:
  - Python: `OpenAIInstrumentor().instrument()`,
    `LangChainInstrumentor().instrument()`,
    `LlamaIndexInstrumentor().instrument()`,
    `register(project_name=...)` (Phoenix one-liner)
  - TS/JS: `new <Provider>Instrumentation(...)` registration with
    `registerInstrumentations(...)`

## 2. Trace-shape schema

**Primary instrumentation scopes:** `openinference` (Python) and
`@arizeai/openinference` (JS/TS). Both prefixes match
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES` literally; sub-scopes
typically read as `openinference.instrumentation.openai`,
`@arizeai/openinference-instrumentation-langchain`, etc.

OpenInference spans use the `llm.*` / `embedding.*` / `retrieval.*`
attribute namespace (predates OTel GenAI conventions). Subset the
mapper uses:

| Attribute                            | Carries                                                 |
|--------------------------------------|---------------------------------------------------------|
| `openinference.span.kind`            | `"LLM" \| "CHAIN" \| "TOOL" \| "RETRIEVER" \| "EMBEDDING" \| "AGENT" \| "RERANKER" \| "GUARDRAIL" \| "EVALUATOR"` |
| `llm.model_name`                     | Model id                                                |
| `llm.provider`                       | `openai`, `anthropic`, `bedrock`, `vertex`, …           |
| `llm.input_messages`                 | JSON-encoded messages array (input)                     |
| `llm.output_messages`                | JSON-encoded messages array (output)                    |
| `llm.invocation_parameters`          | JSON-encoded model parameters (temperature, etc.)       |
| `llm.token_count.prompt` / `.completion` / `.total` | Token counts                             |
| `tool.name`                          | Tool name (on TOOL spans)                               |
| `tool.description`                   | Tool description literal                                |
| `tool.parameters`                    | Tool parameter schema                                   |
| `embedding.model_name`               | Embedding model id                                      |
| `retrieval.documents`                | Retrieved-document payloads                             |
| `retrieval.query`                    | Retrieval query body                                    |
| `input.value` / `output.value`       | Generic chain-span input / output                       |
| `metadata`                           | User-supplied metadata blob (JSON)                      |
| `session.id` / `user.id`             | Session and user ids                                    |
| `tag.tags`                           | User-supplied tags                                      |

The span `name` defaults to the SDK operation
(`ChatCompletion`, `Completion`, `Embeddings`, `LangChain`, etc.)
unless overridden via `using_attributes(span_name=...)` (Python)
or the Phoenix `setSpanAttributes({ "openinference.span.name": ... })`
helper.

Minimal example (one OpenAI chat span auto-instrumented by
`OpenAIInstrumentor`):

```json
{
  "name": "ChatCompletion",
  "attributes": {
    "openinference.span.kind": "LLM",
    "llm.model_name": "gpt-4o",
    "llm.provider": "openai",
    "llm.input_messages": "[{\"role\":\"system\",\"content\":\"You triage support tickets...\"}]",
    "llm.invocation_parameters": "{\"temperature\":0.2,\"max_tokens\":256}"
  }
}
```

## 3. Code-side conventions

OpenInference has weak code-side identifier hooks — most spans are
auto-generated. Patterns:

**Python:**

- Tool registration via `@tool` (LangChain) or framework-native
  decorators — defer to the host framework adapter
  (`source-langchain.md`, `source-openai-agents.md`, etc.) when one
  is also detected.
- `using_attributes\(.*span_name\s*=\s*["']<NAME>["']` — explicit
  span-name override (rare)
- `using_metadata\(\s*\{[^}]*\}\)` — user-applied metadata; pair with
  `metadata.*` attributes in the trace
- `using_session\(\s*session_id\s*=\s*["']<SID>["']` —
  session-scoping context manager
- `tracer\.start_as_current_span\(\s*["']<NAME>["']\s*,\s*attributes\s*=\s*\{\s*[^}]*SpanAttributes\.OPENINFERENCE_SPAN_KIND`
  — manual span emission with OpenInference attributes

**JS / TS:**

- `setSession\(\s*\{[^}]*sessionId:\s*["']<SID>["']`
- `setMetadata\(\s*\{[^}]*\}` — metadata application
- `tracer\.startSpan\(\s*["']<NAME>["']` paired with
  `span\.setAttribute\(\s*["']openinference\.span\.kind["']` —
  manual emission

**Provider call-site mapping (primary path).** When an
`OpenAIInstrumentor` (or peer) is active, every provider call
emits a span. The mapping path is:

1. Match `llm.provider` and `llm.model_name` to a provider client
   constructor (`OpenAI(model=...)`, `Anthropic(model=...)`,
   `ChatOpenAI(model=...)`).
2. Substring-match `llm.input_messages[*].content` against any
   prompt template / system-prompt literal in the repo.
3. Walk to the nearest enclosing function or `@<framework>` decorator
   to fix the call site.

**Auto-instrumented chain spans.** OpenInference's LangChain
instrumentor preserves Runnable class names in the span `name` —
defer to `source-langchain.md` §3 when LangChain is also detected.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The model name and provider match more than one provider-client
  constructor in the repo (common when the same model is used in
  multiple call sites).
- `llm.invocation_parameters` are config-driven (read from env or
  YAML) — the literal in the trace will not match any in-source
  literal.
- The trace span `name` is the SDK default
  (`ChatCompletion`, `Completion`, `Embeddings`) and no
  user-defined `using_attributes(span_name=...)` override is
  present in the repo — the span name alone cannot disambiguate
  the call site.
- A peer instrumentor (`source-langchain.md`,
  `source-openai-agents.md`) is also detected — the same
  underlying call may be wrapped twice; defer to the more specific
  adapter for code-side mapping.
- `session.id` / `user.id` are present but the repo contains no
  literal `using_session(...)` call — those values were set
  upstream of any grep-able call site.

## 5. Minimum required fields

The mapper needs at least one of:

- `tool.name` (on a TOOL span — strongest)
- `llm.model_name` plus `llm.input_messages[*].content` substring
  matching a prompt-template literal
- A user-defined span `name` (set via `using_attributes(span_name=...)`
  or `setSpanAttributes`)
- A peer source adapter that can carry the mapping (e.g. LangChain
  Runnable name, OpenAI Agents agent name)

If only `llm.model_name` and token counts are present, return
`status: "unresolved"` with reason "OpenInference auto-instrumentation
without code-side hooks — model name alone matches every provider
call site".
