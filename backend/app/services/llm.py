"""
Chat client for any OpenAI-compatible endpoint, with tool calling.

WHY THIS EXISTS: the triage model layer used to be reachable only through a
paid Anthropic key, so a deployment without one ran on rules alone. Every
free way to run a model — a hosted free tier or a model on your own machine —
serves the same wire format, `POST {base_url}/chat/completions` with a
`tools` array of JSON-schema functions. They differ in three strings:

    | Provider            | LLM_BASE_URL                                         | Key |
    |---------------------|------------------------------------------------------|-----|
    | Ollama (local)      | http://localhost:11434/v1                            | no  |
    | llama.cpp (local)   | http://localhost:8080/v1                             | no  |
    | Groq (free tier)    | https://api.groq.com/openai/v1                       | yes |
    | Google AI Studio    | https://generativelanguage.googleapis.com/v1beta/openai | yes |
    | OpenRouter (:free)  | https://openrouter.ai/api/v1                         | yes |

So this is one client, not a provider abstraction: there is a single request
shape and a single response shape, and the vendor is configuration.

⛔ WHICH BASE URL YOU CHOOSE IS A DATA-HANDLING DECISION, NOT A PREFERENCE.

A symptom description is the most sensitive free text in this app. Pointing
this at a hosted endpoint transmits it to a third party, and CLAUDE.md records
that this project has a signed BAA with nobody. A local endpoint transmits
nothing and is the only option here that raises no BAA question at all — the
same reasoning that put label OCR on the device.

`endpoint_is_local()` exists so that distinction is visible rather than
assumed, and a hosted endpoint logs a warning naming the exposure the first
time it is used. Neither of those makes a hosted endpoint safe; they stop it
being silent.

NOTHING IS LOGGED FROM THE BODY. The description travels in the request and
must not reach the application log — see the logging rule in CLAUDE.md. Errors
here report a type and a status code, never content.
"""

from __future__ import annotations

import ipaddress
import json
import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Hostnames that mean "this machine". Anything else is a third party.
_LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}

# Groq's OpenAI-compatible endpoint, and a model listed on it that supports
# tool calling — which this app's model calls are entirely made of. Constants
# rather than settings because they are facts about one named vendor: an
# operator who has a Groq key should not also have to look up its URL.
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Groq issues keys with this prefix, so a key states its own vendor. That is
# what makes reading one out of a generically-named setting a fact rather than
# a guess — see `groq_key_source()`.
GROQ_KEY_PREFIX = "gsk_"

# Hosts already warned about, so a hosted endpoint is stated rather than
# assumed. Keyed by host because two features may use two endpoints.
_warned_about_transmission: set[str] = set()


class LLMUnavailable(Exception):
    """
    The endpoint could not be reached, or answered with something unusable.

    Callers must treat this as "no answer", never as a reassuring one. In
    triage that means the rule tier stands; it never becomes SELF_CARE.
    """


@dataclass(frozen=True)
class ToolCall:
    """One function the model asked to run."""

    id: str
    name: str
    # Already parsed from the JSON string the wire format uses. Providers vary
    # in how they escape it, so it is parsed rather than string-matched.
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ChatReply:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    model_id: str = ""


@dataclass(frozen=True)
class Endpoint:
    """
    Where one caller's model lives, and what it carries.

    WHY THIS IS A VALUE RATHER THAN JUST SETTINGS: two features now use this
    client, and they carry different text. Symptom triage carries the most
    sensitive free text in the app and has a standing release blocker; health
    goals carries goal text. Reading one global setting meant switching on a
    hosted model for either feature silently moved the other's data too.

    `label` names the data in the transmission warning, so an operator is told
    what is actually leaving the machine rather than a generic sentence.
    """

    base_url: str
    model: str
    api_key: str
    label: str

    @property
    def host(self) -> str:
        return (urlparse(self.base_url).hostname or "").lower()


def default_endpoint() -> Endpoint:
    """The `LLM_*` settings. Used by symptom triage and by anything unstated."""
    return Endpoint(
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        label="Symptom descriptions",
    )


def groq_key_source() -> tuple[str, str] | None:
    """
    A Groq key and the name of the setting it came from, or None.

    THREE PLACES, BECAUSE A KEY WITH NO BASE URL BESIDE IT DID NOTHING AT ALL.
    That is the failure this function exists to end, and it is silent by
    construction: `goals_endpoint()` requires a base URL before it will read a
    key, so a pasted key simply fell through to whatever `LLM_*` said — an
    Ollama that is not running, on a deployment where nothing is listening on
    localhost. The person then sees "MedHelp has no suggestions right now"
    with a working key set three inches away.

    * `GROQ_API_KEY` — named for the vendor, so nothing needs inferring.
    * `GOALS_LLM_API_KEY` with no `GOALS_LLM_BASE_URL` — a key doing nothing.
    * `LLM_API_KEY` with no `LLM_BASE_URL` — likewise, and triage is
      unconfigured either way, so this cannot start transmitting a symptom
      description. It gives goal drafting a model and moves nothing else.

    The last two are read **only** when the key carries `GROQ_KEY_PREFIX`, so
    an OpenRouter or Google key parked in the same slot is never posted to
    Groq. An unrecognised key still does nothing — but `main.py` says so at
    boot rather than leaving it silent.
    """
    key = settings.groq_api_key.strip()
    if key:
        return key, "GROQ_API_KEY"

    if not settings.goals_llm_base_url.strip():
        goals_key = settings.goals_llm_api_key.strip()
        if goals_key.startswith(GROQ_KEY_PREFIX):
            return goals_key, "GOALS_LLM_API_KEY"
        if not settings.llm_base_url.strip():
            shared_key = settings.llm_api_key.strip()
            if shared_key.startswith(GROQ_KEY_PREFIX):
                return shared_key, "LLM_API_KEY"
    return None


def groq_endpoint_or_none(model: str = "") -> Endpoint | None:
    """
    Groq, resolved from a key alone.

    WHY A KEY IS ENOUGH HERE: Groq is not a base URL an operator should have to
    remember. The key names the vendor unambiguously, and the vendor fixes the
    rest — the URL is a constant of the service and `GROQ_DEFAULT_MODEL` is one
    of its listed models. Requiring three settings to agree meant a pasted key
    sat in the environment doing nothing.

    `model` is `GOALS_LLM_MODEL` when the operator named one, so a different
    Groq model is one setting rather than a fork of this function.

    Returns None when no Groq key is set anywhere, so callers keep their own
    fallbacks.
    """
    found = groq_key_source()
    if found is None:
        return None
    key, _ = found
    return Endpoint(
        base_url=GROQ_BASE_URL,
        model=model.strip() or GROQ_DEFAULT_MODEL,
        api_key=key,
        label="Health goal descriptions",
    )


def goals_endpoint() -> Endpoint:
    """
    Where health-goal text goes. Three sources, in this order:

    1. `GOALS_LLM_*`, when a base URL is named. Any provider, stated in full.
    2. a Groq key, wherever it is set — see `groq_key_source()`.
    3. the `LLM_*` settings, which is the behaviour of having none of this.

    Leaving all of them unset is exactly the behaviour of not having these
    settings at all — the property a test asserts, because "this changes
    nothing unless you ask for it" is the whole reason it was safe to add.

    ⛔ THE `GOALS_LLM_*` FALLBACK IS ALL-OR-NOTHING, DELIBERATELY. It used to
    fall back field by field, so an operator who set the goals URL and key but
    left the model blank got Groq's URL and key with the *other* provider's
    model name. That combination is not a working endpoint of either provider —
    it fails as `model_not_found`, which reaches the user as a silent "no
    suggestions".

    Per-field fallback only makes sense when both point at the same provider,
    and the entire purpose of these settings is that they do not. So the base
    URL decides: name one, and the model and key must come from beside it.
    `GROQ_API_KEY` is not an exception to that rule but an instance of it — the
    key, the URL and the default model all belong to one named vendor.

    ⛔ NONE OF THIS MOVES SYMPTOM TRIAGE. The Groq key is read here and
    nowhere else, so switching on goal drafting cannot start transmitting
    symptom descriptions — the most sensitive free text in the app, belonging
    to the feature with the standing release blocker. Triage still goes
    wherever `LLM_*` says and nowhere else.
    """
    if settings.goals_llm_base_url.strip():
        return Endpoint(
            base_url=settings.goals_llm_base_url.strip(),
            model=settings.goals_llm_model.strip(),
            api_key=settings.goals_llm_api_key.strip(),
            label="Health goal descriptions",
        )
    groq = groq_endpoint_or_none(settings.goals_llm_model)
    if groq is not None:
        return groq
    return Endpoint(
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        label="Health goal descriptions",
    )


def configured(endpoint: Endpoint | None = None) -> bool:
    """Whether an endpoint and a model have both been named."""
    resolved = endpoint or default_endpoint()
    return bool(resolved.base_url.strip() and resolved.model.strip())


def endpoint_is_local(endpoint: Endpoint | None = None) -> bool:
    """
    Whether the endpoint runs on this machine.

    True means no health text leaves the host and no vendor becomes a
    processor of health data. False means it does and one does.
    """
    host = (endpoint or default_endpoint()).host
    if not host:
        return False
    if host in _LOCAL_HOSTNAMES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _warn_once_about_transmission(endpoint: Endpoint) -> None:
    """
    Say plainly, once per host, that health data is being sent to a third party.

    CLAUDE.md requires a new third-party processor to be flagged rather than
    assumed handled. An operator who points this at a free hosted tier has
    made that decision; this makes sure they made it knowingly.

    Once per *host* rather than once per process, because two features may now
    have two endpoints and a warning about one is not a warning about the
    other.
    """
    if endpoint_is_local(endpoint) or endpoint.host in _warned_about_transmission:
        return
    _warned_about_transmission.add(endpoint.host)
    logger.warning(
        "%s are being transmitted to a third-party model endpoint (%s). No "
        "BAA is in place with any vendor. Use a local endpoint (e.g. "
        "http://localhost:11434/v1) if that is not acceptable.",
        endpoint.label,
        endpoint.host or "unknown host",
    )


def _headers(endpoint: Endpoint) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = endpoint.api_key.strip()
    if key:
        # A local Ollama or llama.cpp server needs no key and rejects none.
        headers["Authorization"] = f"Bearer {key}"
    return headers


# Error codes an OpenAI-compatible provider returns, and what each one means
# an operator has to go and change. An allowlist rather than "log the code we
# were given", because the rule in this module is that nothing from a response
# body is read unless it is known to be safe — and a value we have not seen
# before is not known to be anything.
#
# WHY THIS IS WORTH THE LINES: "HTTP 404" and "HTTP 401" are the same event to
# someone reading a deployment's log — the model layer did not answer — and the
# person on the screen is told "MedHelp has no suggestions right now" either
# way. A decommissioned model name and a revoked key are different repairs, and
# naming which one it is turns an afternoon into a minute.
_KNOWN_ERROR_CODES = {
    "model_not_found": "the configured model does not exist at this provider",
    "model_decommissioned": "the configured model has been retired",
    "invalid_api_key": "the API key was rejected",
    "authentication_error": "the API key was rejected",
    "invalid_request_error": "the provider rejected the request shape",
    "rate_limit_exceeded": "the account is over its rate limit",
    "insufficient_quota": "the account is out of quota",
    "context_length_exceeded": "the request was longer than the model accepts",
}


def _known_error_code(response: httpx.Response) -> str:
    """
    The provider's error code, but only if it is one we already know.

    Returns a fragment to append to a log line, or "" — never the provider's
    message, which can quote the request back.
    """
    try:
        code = ((response.json() or {}).get("error") or {}).get("code")
    except (ValueError, AttributeError, TypeError):
        return ""
    meaning = _KNOWN_ERROR_CODES.get(str(code))
    return f" ({code}: {meaning})" if meaning else ""


def completions_url(base_url: str) -> str:
    """
    The chat-completions URL for a configured base URL.

    Two shapes are corrected rather than sent as written, because both are
    ordinary transcription errors with an indistinguishable symptom — a 404
    that reaches the person as "no suggestions", and reads in a log like a bad
    model name:

    * a base URL that already ends in `/chat/completions`, which would
      otherwise be doubled. Copied from a provider's curl example.
    * `https://api.groq.com` with no path, which is the vendor's own name for
      itself rather than its OpenAI-compatible base. Only Groq's host is
      corrected, and only when there is no path to overrule — we know that
      vendor's base URL because `GROQ_BASE_URL` is already a constant here.

    Nothing else is guessed. An unknown host with a wrong path is left exactly
    as configured, because "some other path" is not a thing this can know the
    right answer to, and quietly rewriting it would hide the real mistake.
    """
    cleaned = base_url.strip().rstrip("/")
    if cleaned.endswith("/chat/completions"):
        return cleaned

    parsed = urlparse(cleaned)
    if (parsed.hostname or "").lower() == urlparse(GROQ_BASE_URL).hostname:
        if parsed.path.strip("/") == "":
            cleaned = GROQ_BASE_URL

    return cleaned + "/chat/completions"


def chat(
    *,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    endpoint: Endpoint | None = None,
) -> ChatReply:
    """
    One round trip. Raises LLMUnavailable on anything that is not a usable answer.

    Deliberately not retried here: httpx surfaces the failure, the caller
    treats it as "no model answer", and the rule layer underneath still
    produces a tier. A retry loop on a health endpoint buys a slower failure,
    not a better one.
    """
    resolved = endpoint or default_endpoint()
    if not configured(resolved):
        raise LLMUnavailable("No model endpoint is configured.")

    _warn_once_about_transmission(resolved)

    body: dict[str, Any] = {
        "model": resolved.model.strip(),
        "messages": messages,
        # Triage must be as close to reproducible as a model gets: the same
        # description should not oscillate between tiers across submissions.
        "temperature": 0,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    url = completions_url(resolved.base_url)

    try:
        response = httpx.post(
            url,
            json=body,
            headers=_headers(resolved),
            timeout=settings.llm_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPStatusError as exc:
        # Status code, plus the provider's own error code when it is one we
        # recognise. A provider error body can quote the request — which is the
        # user's description — so nothing else from it is read.
        logger.warning(
            "Model endpoint returned HTTP %s%s.",
            exc.response.status_code,
            _known_error_code(exc.response),
        )
        raise LLMUnavailable("The model endpoint rejected the request.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Model endpoint unreachable: %s", type(exc).__name__)
        raise LLMUnavailable("The model endpoint could not be reached.") from exc
    except ValueError as exc:
        raise LLMUnavailable("The model endpoint returned invalid JSON.") from exc

    return _parse(payload, resolved.model)


def _parse(payload: Any, model: str = "") -> ChatReply:
    """Read one choice out of an OpenAI-compatible response."""
    try:
        choice = payload["choices"][0]
        message = choice["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMUnavailable("The model endpoint returned no answer.") from exc

    if choice.get("finish_reason") == "length":
        # Distinguished so a truncated tool call is diagnosable rather than
        # looking like a malformed one.
        raise LLMUnavailable("The model response was cut off.")

    return ChatReply(
        text=(message.get("content") or "").strip(),
        tool_calls=_parse_tool_calls(message.get("tool_calls")),
        model_id=str(payload.get("model") or model),
    )


def _parse_tool_calls(raw: Any) -> list[ToolCall]:
    """
    Read the tool calls, skipping any that are malformed.

    A call whose arguments will not parse is dropped rather than failing the
    turn: the loop above treats "no usable call" as the model not having
    answered, which lands on the safe path anyway.
    """
    if not isinstance(raw, list):
        return []

    calls: list[ToolCall] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        function = entry.get("function") or {}
        name = function.get("name")
        if not name:
            continue
        raw_args = function.get("arguments")
        if isinstance(raw_args, dict):
            # Some providers hand back an object rather than a JSON string.
            arguments = raw_args
        else:
            try:
                arguments = json.loads(raw_args or "{}")
            except (ValueError, TypeError):
                logger.warning("Dropped a tool call with unparseable arguments.")
                continue
            if not isinstance(arguments, dict):
                continue
        calls.append(
            ToolCall(id=str(entry.get("id") or name), name=str(name), arguments=arguments)
        )
    return calls
