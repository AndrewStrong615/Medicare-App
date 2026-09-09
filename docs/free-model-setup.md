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

### Health goals, from a Groq key alone

The settings above are symptom triage. Health goals read `GOALS_LLM_*` first,
and if no base URL is named there, a single setting is enough:

```
GROQ_API_KEY=gsk_...
```

That pairs the key with Groq's base URL and one of its models (`llm.py`,
`GROQ_BASE_URL` / `GROQ_DEFAULT_MODEL`), so goal drafting has a model with
nothing else to configure. `GOALS_LLM_MODEL` names a different Groq model;
an explicit `GOALS_LLM_BASE_URL` wins outright.

A `gsk_` key already sitting in `GOALS_LLM_API_KEY` or `LLM_API_KEY` **with no
base URL beside it** is read the same way, since a key with no endpoint does
nothing at all otherwise. A key that does have a base URL beside it belongs to
that endpoint and is left alone.

To check what a running deployment resolved: `GET /health` reports
`health_goals_model_configured`, and the boot log names the model and which
setting the key came from.

### When it is configured and still returns nothing

The person sees the same sentence for every failure, so check the log rather
than the screen. It names the provider's error code where it recognises one:

| In the log | What to change |
|---|---|
| `model_not_found` / `model_decommissioned` | the model name — Groq retires models; check https://console.groq.com/docs/models |
| `invalid_api_key` / `authentication_error` | the key |
| `rate_limit_exceeded` / `insufficient_quota` | nothing; the account is over its limit |
| `NO MODEL configured` at boot | no key or endpoint resolved at all |

The base URL is the one thing you are unlikely to get wrong in a way that
matters: `https://api.groq.com` and a URL already ending in
`/chat/completions` are both corrected to the real endpoint.

⛔ It moves goals and only goals. Symptom descriptions still go wherever
`LLM_*` says — nowhere, if you have not set it — so this is the configuration
that gives goal suggestions a model while triage runs on the deterministic
rule layer alone. Goal text is still health free text about an identified
user, and Groq is still a third party with no BAA here.

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
