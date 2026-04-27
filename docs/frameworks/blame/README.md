# Framework Adapter References (parked)

Each file in this directory is a parked `/kubit-blame` adapter — kept
in source for incremental reintroduction but not currently shipped.
Adapters teach the `kubit-blame-mapper` subagent how to map trace
identifiers produced by a specific tracing framework back to code
sites in the user's repo. Adapters are pure markdown — the mapper
subagent reads them as part of its input.

## Shipped vs parked

The shipped v1 set lives under
`skills/blame/references/frameworks/` and mirrors `/kubit-integrate`'s
two-axis `sink-*.md` / `source-*.md` split:

- `sink-langfuse.md`
- `sink-braintrust.md`
- `source-vercel-ai.md`
- `source-otel-genai.md`
- `source-langchain.md`

The files below stay parked here until users ask for them and we
have integrate counterparts to keep both skills' framework sets in
lockstep:

- `langsmith.md` — LangSmith / LangChain
- `logfire.md` — Pydantic Logfire (Python primary; TS thinner)
- `openai-agents.md` — OpenAI Agents SDK (Python + JS/TS)
- `openinference.md` — OpenInference / Arize Phoenix (Python + JS/TS)
- `openllmetry.md` — OpenLLMetry / Traceloop (Python + TS)

(`braintrust.md`, `vercel-ai.md`, and `otel-genai.md` were promoted
into the shipped set under their `sink-` / `source-` names.)

## Promoting a parked adapter

1. Decide whether it's a sink (owns a span destination) or a source
   (emits OTel spans without a native destination). Most parked
   adapters are sources.
2. Copy to `skills/blame/references/frameworks/sink-<name>.md` or
   `source-<name>.md`. Rename the H1 title to match.
3. Add or revise §1 dependency signals so they exactly mirror
   `/kubit-integrate`'s same-named adapter. Drift between the two
   skills' §1 wording is a bug — a single grep should detect it.
4. Update `/kubit-blame`'s `SKILL.md` step 2 adapter path list to
   include the new file.
5. Verify against ≥ 1 real repo before merging.

## Required sections (when promoting)

Every shipped adapter must contain these five H2 sections, in this
order:

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

(LangChain-style sink-dependent sources may defer §2 to the host
sink adapter — see `skills/blame/references/frameworks/source-langchain.md`.)

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
