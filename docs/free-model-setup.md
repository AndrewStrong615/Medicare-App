# Running symptom intake on a free model

Symptom intake has two layers. The deterministic rule layer
(`backend/app/core/rules_triage.py`) always runs, needs no key and no network,
and **is the product**. The model layer is a second opinion that can raise a
tier and can never lower one.

Until now that second layer needed a paid Anthropic key. It can now run on any
OpenAI-compatible endpoint — including a model on your own machine — and when
it does, it runs as an **agentic deduction loop** rather than a single call.

## The choice that matters first

A symptom description is the most sensitive free text in this app, and this
project has a signed BAA with nobody. Where you point `LLM_BASE_URL` decides
whether that text leaves the machine.

| | Cost | Symptom text leaves the machine | BAA question |
|---|---|---|---|
| **Ollama / llama.cpp, local** | free | **no** | **does not arise** |
| Groq free tier | free | yes | unresolved |
| Google AI Studio free tier | free | yes | unresolved, and free-tier input may be used for training |
| OpenRouter `:free` models | free | yes | unresolved |
| Anthropic (existing path) | paid | yes | unresolved |

**Local is the only option here that raises no BAA question at all** — the same
reasoning that put label OCR on the device rather than in a cloud OCR service.
A hosted endpoint is not forbidden, but it is a decision someone has to make
knowingly; the app logs a warning naming the exposure every time it starts
using one. Use synthetic descriptions until that question has an answer.

## Local, with Ollama (recommended)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1          # any tool-calling model works
ollama serve
```

Then in `backend/.env`:

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=
```

The model must support tool calling — the loop is built out of tool calls, and
a model without them cannot conclude. `llama3.1`, `qwen2.5` and `mistral-nemo`
all do. Expect it to be slower than a hosted endpoint on modest hardware;
`LLM_TIMEOUT_SECONDS` defaults to 60 for that reason.

Note that a local model cannot run on the free Render instance this app
deploys to — there is not enough memory. Local is a development and
self-hosting option; a public deployment that wants this layer needs a hosted
endpoint, and therefore needs the BAA question answered.

## A hosted free tier

Same three settings, e.g. for Groq:

```
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...
```

Google AI Studio and OpenRouter work the same way; only the three strings
change. There is no provider-specific code — see
`backend/app/services/llm.py`.

## What the loop actually does

`backend/app/core/deduction.py`. Per assessment, the model:

1. calls `screen_red_flags` — the app's deterministic emergency screen, run
   over the description exactly as submitted;
2. calls `apply_rules` — the deterministic rule layer, likewise;
3. calls `record_step` for each thing it notices and what follows from it;
4. calls `conclude` with a tier.

`conclude` is **refused** until both screens have been read, so a conclusion is
grounded in the reviewed phrase lists rather than in the model's recollection
of them. The screens take no arguments: they always see the submitted text, so
the model cannot rephrase its way past a red flag.

Everything above the loop is unchanged. The rule tier and the deduced tier are
still reconciled with `max()`, so the loop can escalate and can never
de-escalate, and every failure inside it — an unreachable endpoint, an
unparseable answer, a loop that never concludes — is "no model answer", which
leaves the rule tier standing. There is no path where a failure produces
reassurance.

## Reading the derivation

Each run produces a trace: the screens read, the inferences recorded, the
conclusion. It is never shown to the user — it is a derivation, not an
explanation written for a worried person.

It goes to the dev-only classification log, which is off by default and
refuses to run in production:

```
TRIAGE_LOG_CLASSIFICATIONS=true
```

⛔ **Synthetic data only.** That log writes descriptions, and now the model's
reasoning about them, to the application log. See
`backend/app/core/triage_log.py`.

The trace is deliberately not written to the `intake_assessments` table.
Persisting it needs a new column, and this project has no migration tooling
wired up (see CLAUDE.md, "Known Gaps") — so that is a follow-up, not a
side effect of this change.

## What this does not change

None of the release blockers. The tier definitions are still a software
engineer's construction, still unreviewed by a clinician, and still subject to
the legal question about medical-device status. Driving the same unreviewed
instrument in more steps does not review it.
