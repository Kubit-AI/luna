# Framework Adapter References

Each file in this directory teaches the `kubit-blame-mapper` subagent how to map
trace identifiers produced by a specific tracing framework back to code sites in
the user's repo. Adapters are pure markdown — the mapper subagent reads them as
part of its input.

## When to add a new adapter

Add a new adapter when users want `/kubit-blame` to work against a tracing
framework not currently covered. The launch set is:

- `braintrust.md` — Braintrust (Python + JS/TS official SDKs)
- `langfuse.md` — Langfuse (Python + JS/TS official SDKs)
- `langsmith.md` — LangSmith / LangChain
- `logfire.md` — Pydantic Logfire (Python primary; TS thinner)
- `openai-agents.md` — OpenAI Agents SDK (Python + JS/TS)
- `openinference.md` — OpenInference / Arize Phoenix (Python + JS/TS)
- `openllmetry.md` — OpenLLMetry / Traceloop (Python + TS)
- `vercel-ai.md` — Vercel AI SDK (TypeScript only)
- `otel-genai.md` — OpenTelemetry GenAI semantic conventions

## Required sections

Every adapter must contain these five H2 sections, in this order:

### 1. Dependency signals

Exact strings the main agent can grep for in dependency manifests
(`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`) and source
imports to detect that this framework is in use. List each signal on its own
line so grep patterns are obvious.

### 2. Trace-shape schema

Which trace / span fields carry the identifiers the mapper needs:
- Agent name
- Tool / function name
- Prompt name or prompt body
- Parent / child edges
- Error / status

Include a real example JSON snippet showing a minimal span or run object.

### 3. Code-side conventions

How the framework registers agents / tools / prompts in code. Include the exact
Python / TS / etc. patterns the mapper should grep for. Use `ripgrep`-compatible
regex syntax.

### 4. Ambiguity signals

Patterns that force the mapper to mark a mapping as `status: "ambiguous"`,
even if only one candidate matched — e.g. name overrides, dynamic prompt
composition, attributes set from variables rather than literals.

### 5. Minimum required fields

The smallest set of trace fields the mapper needs to attempt any mapping at
all. If a trace is missing all of them, the mapper returns
`status: "unresolved"` with reason "insufficient trace fields".

## Shape expectations

Keep adapters under 300 lines. They are loaded into the mapper subagent's
context on every run — shorter is cheaper and clearer.
