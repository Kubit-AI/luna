# LangChain Source Adapter (blame)

Pure source — LangChain has no OTel emitter of its own. It produces
traces through **callback handlers** that each observability vendor
ships separately (Langfuse's `CallbackHandler`, Braintrust's
`BraintrustCallbackHandler`). Spans therefore **inherit the shape of
the host sink** — see `sink-langfuse.md` §2 or `sink-braintrust.md`
§2 for the trace schema. This adapter only contributes code-side
patterns: where LangChain Runnables, Chains, tools, and prompts are
defined in the user's repo.

Both Python and TypeScript are supported — LangChain ships first-party
packages in both ecosystems.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt` / `Pipfile`:
  - `langchain`, `langchain-core`, `langchain-community`,
    `langchain-text-splitters`
  - `langgraph`
  - Any provider package: `langchain-openai`, `langchain-anthropic`,
    `langchain-google-genai`, `langchain-aws`, `langchain-cohere`, …
    (any dep matching `^langchain[-_]`)
- TypeScript — `package.json` `dependencies` / `devDependencies`:
  - `langchain`, `@langchain/core`, `@langchain/community`
  - `@langchain/langgraph`
  - Any provider package: `@langchain/openai`, `@langchain/anthropic`,
    `@langchain/google-genai`, `@langchain/aws`, … (any dep matching
    `^@langchain/`)
- Import patterns:
  - Python: `from langchain`, `from langchain_core`,
    `from langchain_community`, `from langgraph`,
    `from langchain_<provider>`
  - TS/JS: `from "langchain/…"`, `from "@langchain/core…"`,
    `from "@langchain/langgraph…"`, `from "@langchain/<provider>…"`
- Callback-handler imports (the bridge that puts LangChain spans on
  the sink's pipeline):
  - Langfuse v3 — Python `from langfuse.langchain import CallbackHandler`;
    TS `from "@langfuse/langchain"`
  - Braintrust — Python
    `from braintrust.integrations.langchain import (BraintrustCallbackHandler, set_global_handler)`;
    TS `from "@braintrust/langchain-js"`

**Detection trap — Langfuse v2 callback path is unmappable.**
`from langfuse.callback import CallbackHandler` (Python) and the v2
JS package `langfuse-langchain` use Langfuse's non-OTel HTTP
pipeline. Kubit's span processor never sees those spans, so blame
cannot map LangChain runs that flow through them. If only v2
callback wiring is present in the repo, surface this in the
detection-confirmation step and treat any LangChain identifiers as
`unresolved` with reason "v2 callback path — spans don't reach
Kubit".

**Detection trap — Braintrust without OTel-compat.** When the host
sink is Braintrust and `BRAINTRUST_OTEL_COMPAT=true` (Python) or a
`setupOtelCompat()` call (TS) is **not** present, the
`BraintrustCallbackHandler` posts LangChain spans through
Braintrust's native pipeline. Kubit cannot see them. Treat any
LangChain identifiers in this configuration as `unresolved` with
reason "Braintrust callback handler without OTel-compat — spans
don't reach Kubit".

## 2. Trace-shape schema

**Primary instrumentation scope:** none of LangChain's own —
LangChain emits no OTel spans. Spans inherit the host sink's scope
(`langfuse-sdk` for the Langfuse v3 callback, `braintrust` for the
Braintrust callback when OTel-compat is enabled). Use the host
sink's scope to filter, then apply LangChain-specific identifier
hints below.

Defers to the host sink adapter:

- Langfuse + LangChain → spans follow `sink-langfuse.md` §2
  (`Observation` shape; `name` carries the Runnable/Chain class
  name or the user-supplied `run_name`).
- Braintrust + LangChain → spans follow `sink-braintrust.md` §2
  (`Span` shape; `name` carries the Runnable class name).

LangChain-specific identifier hints that show up *inside* the
host-sink span fields:

- Span `name` typically reads as the Runnable subclass name
  (`ChatOpenAI`, `RunnableSequence`, `RunnableParallel`, an LCEL
  pipe step) or the user-supplied `run_name` from
  `with_config({"run_name": "..."})`.
- Tool spans carry the `name` of the `@tool`-decorated function or
  the `name=` argument of `Tool(name=..., func=...)`.
- Prompt nodes (`ChatPromptTemplate`, `PromptTemplate`,
  `MessagesPlaceholder`) appear as nested spans whose input
  contains the rendered messages — match against the literal
  `from_template(...)` body in the repo.

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given LangChain
identifier was registered.

**Python:**

- Runnable subclasses — `class\s+<NAME>\s*\(\s*Runnable[A-Za-z]*\s*[,\)]`
- LCEL chain assignments — `<NAME>\s*=\s*[A-Za-z_][\w\.]*\s*\|`
  (a variable bound to the result of an LCEL `|` pipeline)
- `@tool\s*(\(\s*["']<NAME>["']|\s*\n\s*def\s+<NAME>)` — the
  `@tool` decorator from `langchain_core.tools` (named tool or
  decorator on a `def <NAME>`)
- `Tool\(\s*name\s*=\s*["']<NAME>["']` — the explicit `Tool(...)`
  constructor form
- `StructuredTool\.from_function\(\s*[^,]+,\s*name\s*=\s*["']<NAME>["']`
- `with_config\(\s*\{[^}]*["']run_name["']\s*:\s*["']<NAME>["']`
  — explicit run-name override that becomes the span name
- `ChatPromptTemplate\.from_(messages|template)\(` /
  `PromptTemplate\.from_template\(` — prompt definitions; pair
  with substring search of the rendered prompt body when present
  in the trace
- LangGraph nodes — `graph\.add_node\(\s*["']<NAME>["']`,
  `StateGraph\(.*\)\.add_node\(\s*["']<NAME>["']`

**JS / TS:**

- Runnable subclasses — `class\s+<NAME>\s+extends\s+Runnable[A-Za-z]*`
- LCEL chain assignments — `const\s+<NAME>\s*=\s*[A-Za-z_][\w\.]*\s*\.pipe\(`
  (the `.pipe(...)` form is the JS equivalent of Python's `|`)
- `tool\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']` — the
  `tool(fn, { name: ... })` helper from `@langchain/core/tools`
- `new\s+DynamicTool\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `withConfig\(\s*\{\s*[^}]*runName:\s*["']<NAME>["']`
- `ChatPromptTemplate\.fromMessages\(` /
  `PromptTemplate\.fromTemplate\(` — prompt definitions
- LangGraph nodes — `graph\.addNode\(\s*["']<NAME>["']`

**Prompt-body matching.** When the trace carries the rendered
prompt body inside the host-sink `input.messages` or
`gen_ai.input.messages` field, fall back to substring-matching
that body against `from_template(...)` / `fromTemplate(...)`
literals and any `prompts/*.{md,yaml,txt}` files in the repo.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The trace's span `name` is a generic Runnable class name
  (`RunnableSequence`, `RunnableParallel`, `RunnableLambda`,
  `ChatOpenAI`) and no `run_name` / `runName` override is set —
  the same class shows up at every LCEL composition point and
  cannot be disambiguated by name alone.
- `@tool` is applied to a generically named function
  (`def search`, `def lookup`, `def fetch`) — a single match
  should still be treated as ambiguous because tool registries
  often re-export the same function under multiple chains.
- `with_config({"run_name": ...})` / `withConfig({ runName: ... })`
  binds the name to a variable rather than a string literal.
- Multiple `add_node(...)` / `addNode(...)` calls share the same
  node name across separate LangGraph definitions.
- `set_global_handler(...)` (Braintrust Python) is in scope but
  any chain in the repo also passes its own
  `config={"callbacks": [...]}` — the effective handler may
  differ per call site.

## 5. Minimum required fields

The mapper needs at least one of:

- A span `name` that resolves to a non-generic Runnable / Tool /
  Chain identifier (i.e. a user-defined name, not a built-in
  class default).
- A `run_name` / `runName` override carried in the host sink's
  span attributes.
- The rendered prompt body in `input.messages` (host-sink shape)
  for substring match against `from_template` literals or
  `prompts/` files.
- A LangGraph node name (the trace span's `name` matches a
  literal `add_node("...")` argument).

If only opaque ids (LangChain run ids, callback ids) are present,
or every span name is a built-in Runnable class default, return
`status: "unresolved"` with reason "insufficient trace fields —
need a user-defined run_name, tool name, node name, or prompt
body".
