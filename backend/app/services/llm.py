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


def goals_endpoint() -> Endpoint:
    """
    The `GOALS_LLM_*` settings, each falling back to its `LLM_*` counterpart.

    Leaving all three unset is exactly the behaviour of not having them — the
    property a test asserts, because "this change does nothing unless you ask
    for it" is the whole reason it is safe to add.
    """
    return Endpoint(
        base_url=settings.goals_llm_base_url.strip() or settings.llm_base_url,
        model=settings.goals_llm_model.strip() or settings.llm_model,
        api_key=settings.goals_llm_api_key.strip() or settings.llm_api_key,
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

    url = resolved.base_url.strip().rstrip("/") + "/chat/completions"

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
        # Status code only. A provider error body can quote the request, which
        # is the user's symptom description.
        logger.warning("Model endpoint returned HTTP %s.", exc.response.status_code)
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
