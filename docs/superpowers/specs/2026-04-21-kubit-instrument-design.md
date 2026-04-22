# /kubit-instrument — Design

**Status:** Draft
**Date:** 2026-04-21
**Branch:** `feature/instrument-skill`

## Context

The `@kubit-ai/agent-plugin` today ships read-only skills (`connect`, `help`,
`inspect`, `report`, `update`). Users who already emit LLM traces through a
supported tracing framework have no one-step path to route those traces to
Kubit's ingestion endpoint — they have to read vendor docs, write exporter
code, and wire it into their app by hand.

`/kubit-instrument` closes that gap. It detects which of seven supported
tracing frameworks is in use, emits the minimum code change required to add
a Kubit-targeted OTel exporter alongside the user's existing setup, and
prompts for a user-supplied API key via env var. All seven frameworks can
export to an OTel endpoint (confirmed via web research on 2026-04-21 —
Langfuse and LangSmith expose first-party OTLP/HTTP endpoints; OpenAI Agents
via the official `opentelemetry-instrumentation-openai-agents-v2` contrib
package; the remaining four are OTel-native). This skill unifies those
paths behind a single conversational command.

## Supported frameworks

Same library set as `/kubit-blame`, with identical detection signals:

- `langfuse` — Python + JS/TS SDKs; native OTLP endpoint at the wire
- `langsmith` — LangChain tracing; first-party OTLP endpoint
- `logfire` — Pydantic Logfire (OTel-native)
- `openai-agents` — OpenAI Agents SDK (via OTel contrib instrumentation)
- `openinference` — Arize Phoenix (OTel-native)
- `openllmetry` — Traceloop (OTel-native)
- `otel-genai` — generic OpenTelemetry GenAI

## Goals

1. One user command → one file change (or zero, for env-only tier) adds
   Kubit as an additional OTel destination.
2. No secrets in source; API key lives in an environment variable read at
   runtime.
3. Kubit OTLP endpoint stamped at install time from a single source of
   truth (`bin/install.js` template marker).
4. Multi-framework repos resolved by user prompt, not heuristic.
5. Skill is offline-safe — never calls the network itself.

## Non-goals

- Sending a test span from the skill. The user runs the printed
  verification command once they've exported their key.
- Managing the `KUBIT_OTEL_API_KEY` lifecycle (rotation, `.env` file
  editing, secret stores). Out of scope.
- Re-run / idempotence detection. Instrumentation wiring is rarely touched
  after install; the skill prints a diff and asks on write collision.
- Supporting runtimes beyond Python and JavaScript/TypeScript in the first
  shipment. Matches the existing blame-adapter scope.

## Directory layout

```
skills/instrument/
├── SKILL.md                      # interactive flow, main-turn only
└── references/
    ├── README.md                 # adapter authoring contract
    └── frameworks/
        ├── langfuse.md
        ├── langsmith.md
        ├── logfire.md
        ├── openai-agents.md
        ├── openinference.md
        ├── openllmetry.md
        └── otel-genai.md
```

## Adapter contract

Every `references/frameworks/<fw>.md` file has five H2 sections in order:

1. **Dependency signals** — exact grep patterns across `package.json`,
   `pyproject.toml`, `requirements.txt`, `go.mod`, and top-level imports.
   Copy verbatim from the corresponding blame adapter; the library set
   and matching rules are identical.
2. **Minimum-change tier** — exactly one of:
   - `env-only` — user sets documented env vars; no file generated.
   - `bootstrap-file` — skill writes one new file at repo root; user
     imports it once at app entrypoint.
   - `init-site-edit` — skill patches an existing entrypoint after
     showing a diff.
3. **Bootstrap snippet** — canonical code block(s). Python + TS variants
   where the framework supports both. Reads
   `os.environ["KUBIT_OTEL_API_KEY"]` / `process.env.KUBIT_OTEL_API_KEY`.
   Posts to `{{KUBIT_OTEL_ENDPOINT}}` (with the framework-appropriate
   `/v1/traces` suffix).
4. **Wire-in instruction** — the one line the user adds to their
   entrypoint (e.g. `import kubit_instrumentation`). For `env-only`, the
   literal env-var block.
5. **Verification snippet** — a one-liner that emits a test span the
   user can run after setting the key.

### Tier assignments (initial)

| Framework | Tier | Rationale |
|---|---|---|
| `otel-genai` | `bootstrap-file` | Attach a second `BatchSpanProcessor` to the global provider. |
| `logfire` | `bootstrap-file` | Same — Logfire rides the OTel global provider. |
| `openinference` | `bootstrap-file` | Same. |
| `openllmetry` | `bootstrap-file` | Same; Traceloop auto-attaches to the global provider. |
| `openai-agents` | `bootstrap-file` | Calls `OpenAIAgentsInstrumentor().instrument(tracer_provider=provider)` from the official contrib package (`opentelemetry-instrumentation-openai-agents-v2`). |
| `langfuse` | `env-only` (primary) / `bootstrap-file` (fallback) | If `@langfuse/otel` (JS) or `langfuse[otel]` (Python) is present, set `LANGFUSE_OTEL_EXPORTER_OTLP_ENDPOINT` + `_HEADERS`; otherwise fall back to a standalone bootstrap. |
| `langsmith` | `bootstrap-file` | OTel export is enabled by pointing `OTEL_EXPORTER_OTLP_ENDPOINT` at LangSmith's endpoint and registering a second exporter for Kubit — requires code to register the Kubit processor. |

### Example — `otel-genai.md` bootstrap snippet (Python)

```python
# Generated by /kubit-instrument for otel-genai on 2026-04-21.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = trace.get_tracer_provider()
if not isinstance(provider, TracerProvider):
    provider = TracerProvider()
    trace.set_tracer_provider(provider)

provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="{{KUBIT_OTEL_ENDPOINT}}/v1/traces",
    headers={"x-api-key": os.environ["KUBIT_OTEL_API_KEY"]},
)))
```

## User flow

1. **Pre-flight.** Skill greps CWD manifests + top-level imports for each
   adapter's dependency-signal block.
2. **Framework pick.**
   - 0 matches → print supported list, exit 0.
   - 1 match → confirm with user.
   - ≥ 2 matches → user picks exactly one; re-run for a second framework
     if needed. No "all" option.
3. **Context7 freshness probe (optional, once per run).** If context7 is
   available, resolve the picked framework and compare vendor guidance
   against the adapter's pinned snippet. Use context7 output if it
   contradicts the pinned snippet in a load-bearing way; otherwise use the
   pinned snippet unchanged. If context7 is unavailable, silent fallback.
4. **Emit artifact.** Based on the adapter's tier:
   - `env-only`: print the env-var block; write nothing.
   - `bootstrap-file`: write `kubit_instrumentation.py` or
     `kubit-instrumentation.ts` at repo root. Language chosen by which
     manifest matched.
   - `init-site-edit`: locate entrypoint named in adapter §4; show diff;
     apply after user approval.
5. **Close-out.** Print exactly three lines: env-var export, wire-in, and
   the verification command.

The skill never calls the Kubit OTLP endpoint itself.

## File write contract

Every generated bootstrap file begins with a fixed header:

```
# Generated by /kubit-instrument for <framework> on <YYYY-MM-DD>.
# Requires KUBIT_OTEL_API_KEY in env. Endpoint: {{KUBIT_OTEL_ENDPOINT}}
```

(TS files use `//` comments.)

Secrets contract:
- Skill never reads, prompts for, prints, or writes
  `KUBIT_OTEL_API_KEY`. It only names the variable.
- No `.env` file is created or modified.
- The endpoint URL is the only Kubit-specific value baked into generated
  code.

## Installer changes — `bin/install.js`

1. Add `{{KUBIT_OTEL_ENDPOINT}}` to the template marker list.
2. Endpoint value source: reuse the same install config path already used
   for MCP auth; default to the production Kubit endpoint, overridable by
   environment variable at install time (for int vs prod). Concrete value
   to be finalized during implementation — exact URL, default, and env-var
   name.
3. Do **not** add `instrument` to `SHIPPED_SKILLS` yet. Skill lives on
   master, unshipped, until dogfood gate passes (see Testing).

## Error handling

| Situation | Skill behaviour |
|---|---|
| No framework detected | Print supported list; exit 0. |
| Multiple frameworks detected | User picks one; no "all" option. |
| CWD not a git repo | Warn; continue. |
| Adapter file missing at install path | Fatal; print "install corrupt, re-run npx". |
| `{{KUBIT_OTEL_ENDPOINT}}` unsubstituted in adapter body | Fatal; same message. |
| File-write collision | Show diff; ask for overwrite. No marker-detection. |
| `init-site-edit` entrypoint not found | Ask user for path; retry once; else print snippet for manual paste. |
| context7 call fails / unavailable | Silent fallback to pinned snippet. |
| User declines diff / overwrite | Print snippet inline; exit 0. |

## Testing

**Layer 1 — Installer substitution (automated).** Extend the installer's
existing smoke checks to assert that after a dry install, the instrument
skill body and every adapter have zero remaining `{{...}}` markers and the
stamped endpoint URL matches the configured value.

**Layer 2 — Adapter fixtures (manual, one per framework).** Under
`skills/instrument/references/fixtures/<fw>/`, keep the minimum
manifests + entrypoint to trigger detection. Acceptance per fixture:
1. Framework correctly detected.
2. Correct tier chosen.
3. Generated snippet loads without import error in the fixture's runtime.
4. Test span emitted from the fixture reaches the Kubit OTLP receiver
   (done once per adapter with a live key; not automated in CI).

**Layer 3 — Dogfood gate.** Before flipping `SHIPPED_SKILLS`, run
`/kubit-instrument` against ≥ 1 real consumer repo per framework. Feed
manual fix-ups back into adapter snippets until zero-fix-up runs on all
seven.

Explicitly out of scope: snapshot tests of generated bytes (rot), mock
OTLP receiver (Layer 2 live-key run is the real check), CI matrix for
7 × 2 runtimes (manual fixtures suffice at this repo size).

## Documentation sync

When `instrument` is flipped into `SHIPPED_SKILLS`, also update (per
CLAUDE.md): the skill table in `README.md` and the listing in
`skills/help/SKILL.md`. Until then, keep both docs unchanged.

## Open items (to resolve during implementation)

- Exact production Kubit OTLP endpoint URL and the install-time env-var
  name used to override it for int.
- Python/TS detection heuristic when both manifests are present (likely:
  pick the language of the framework's primary SDK in the detected
  version; tie-break by which manifest has more framework deps).
- Whether `langsmith`'s tier should upgrade to `env-only` in the case
  where the user is already using `OTEL_EXPORTER_OTLP_ENDPOINT` for
  LangSmith export — probably yes, with a dedicated Kubit-aware header
  block, but needs validation against a real LangSmith-OTel repo.
