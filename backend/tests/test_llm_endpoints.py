"""
Health goals may use a different model endpoint from symptom triage.

WHY THIS SPLIT EXISTS: one set of `LLM_*` settings used to serve every model
caller, so pointing them at a hosted provider to get goal suggestions also
started sending symptom descriptions there — the most sensitive free text in
the app, belonging to the feature with the standing release blocker. That is a
data-handling decision, and it should not happen as a side effect of switching
on a different feature.

The two properties worth guarding are opposites:

* unset, the overrides change nothing at all;
* set, they move goals and *only* goals.
"""

import pytest

from app.core import goal_structuring
from app.core.config import settings
from app.services import llm


@pytest.fixture()
def shared_endpoint(monkeypatch):
    """One endpoint configured the old way, with no goals override."""
    monkeypatch.setattr(settings, "llm_base_url", "http://localhost:11434/v1")
    monkeypatch.setattr(settings, "llm_model", "qwen2.5:3b")
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "goals_llm_base_url", "")
    monkeypatch.setattr(settings, "goals_llm_model", "")
    monkeypatch.setattr(settings, "goals_llm_api_key", "")
    monkeypatch.setattr(settings, "groq_api_key", "")


def test_unset_overrides_change_nothing(shared_endpoint):
    """
    The whole reason this is safe to add.

    A deployment that never sets `GOALS_LLM_*` behaves exactly as it did
    before the split existed.
    """
    default = llm.default_endpoint()
    goals = llm.goals_endpoint()

    assert (goals.base_url, goals.model, goals.api_key) == (
        default.base_url,
        default.model,
        default.api_key,
    )
    assert llm.configured(goals) is llm.configured(default)
    assert llm.endpoint_is_local(goals) is llm.endpoint_is_local(default)


def test_an_override_moves_goals_and_only_goals(shared_endpoint, monkeypatch):
    monkeypatch.setattr(settings, "goals_llm_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(settings, "goals_llm_model", "llama-3.3-70b-versatile")
    monkeypatch.setattr(settings, "goals_llm_api_key", "gsk_synthetic")

    goals = llm.goals_endpoint()
    default = llm.default_endpoint()

    assert goals.host == "api.groq.com"
    assert llm.endpoint_is_local(goals) is False

    # Symptom triage is untouched, which is the entire point.
    assert default.host == "localhost"
    assert llm.endpoint_is_local(default) is True
    assert default.api_key == ""


def test_naming_a_goals_url_takes_the_whole_endpoint_with_it(
    shared_endpoint, monkeypatch
):
    """
    ⛔ The fallback is all-or-nothing, and this is the bug that made it so.

    It used to fall back field by field, so setting the goals URL and key but
    leaving the model blank produced Groq's URL and key with the *other*
    provider's model name. That is not a working endpoint of either provider:
    it fails as model_not_found, which reaches the user as a silent "no
    suggestions" and is very hard to diagnose from the outside.

    Per-field fallback only makes sense when both settings point at the same
    provider, and the whole purpose of these is that they do not.
    """
    monkeypatch.setattr(settings, "goals_llm_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(settings, "goals_llm_api_key", "gsk_synthetic")
    # Deliberately not set — it must NOT be borrowed from LLM_MODEL.
    monkeypatch.setattr(settings, "goals_llm_model", "")

    goals = llm.goals_endpoint()
    assert goals.base_url == "https://api.groq.com/openai/v1"
    assert goals.model == ""
    # Half-configured is reported as not configured, rather than sent as a
    # request that mixes two providers and fails confusingly.
    assert llm.configured(goals) is False


def test_a_groq_key_alone_gives_goals_a_working_endpoint(
    shared_endpoint, monkeypatch
):
    """
    The reported bug: a Groq key set, and goal drafting still answering
    "MedHelp has no suggestions right now".

    `GOALS_LLM_*` needs all three settings to agree, so a pasted key with no
    base URL beside it was ignored entirely and goals fell through to whatever
    `LLM_*` said — here a local Ollama that is not running. A key names its
    vendor, and the vendor fixes the URL and supplies a model, so one setting
    is now enough.
    """
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")

    goals = llm.goals_endpoint()

    assert goals.base_url == llm.GROQ_BASE_URL
    assert goals.model == llm.GROQ_DEFAULT_MODEL
    assert goals.api_key == "gsk_synthetic"
    assert llm.configured(goals) is True
    assert goal_structuring.available() is True


def test_a_groq_key_does_not_move_symptom_descriptions(shared_endpoint, monkeypatch):
    """
    ⛔ The property that makes the shortcut safe to have.

    Goal text going to a hosted vendor is the operator's decision; symptom
    descriptions following it there would be a data-handling decision made as
    a side effect of switching on a different feature. `GROQ_API_KEY` is read
    in goals_endpoint() and nowhere else.
    """
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")

    default = llm.default_endpoint()

    assert default.host == "localhost"
    assert default.api_key == ""
    assert llm.endpoint_is_local(default) is True


def test_a_groq_key_with_no_llm_settings_at_all_leaves_triage_unconfigured(
    shared_endpoint, monkeypatch
):
    """A key switches on goals; triage stays on the rule layer alone."""
    monkeypatch.setattr(settings, "llm_base_url", "")
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")

    assert llm.configured() is False
    assert goal_structuring.available() is True


def test_goals_llm_model_names_the_groq_model(shared_endpoint, monkeypatch):
    """A different Groq model is one setting, not a fork of the resolution."""
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")
    monkeypatch.setattr(settings, "goals_llm_model", "llama-3.1-8b-instant")

    goals = llm.goals_endpoint()

    assert goals.base_url == llm.GROQ_BASE_URL
    assert goals.model == "llama-3.1-8b-instant"


def test_an_explicit_goals_url_beats_a_groq_key(shared_endpoint, monkeypatch):
    """
    Naming a provider in full is the more specific instruction, and wins.

    Otherwise a leftover Groq key would silently redirect an operator who had
    deliberately pointed goals somewhere else — including at a local endpoint,
    which is the one choice that transmits nothing.
    """
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")
    monkeypatch.setattr(settings, "goals_llm_base_url", "http://localhost:11434/v1")
    monkeypatch.setattr(settings, "goals_llm_model", "qwen2.5:3b")
    monkeypatch.setattr(settings, "goals_llm_api_key", "")

    goals = llm.goals_endpoint()

    assert goals.base_url == "http://localhost:11434/v1"
    assert goals.model == "qwen2.5:3b"
    assert goals.api_key == ""
    assert llm.endpoint_is_local(goals) is True


def test_a_groq_key_is_named_as_a_transmission(shared_endpoint, monkeypatch, caplog):
    """
    One setting is a shortcut through the configuration, never through the
    disclosure. CLAUDE.md requires a third-party processor to be flagged.
    """
    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")
    monkeypatch.setattr(llm, "_warned_about_transmission", set())

    endpoint = llm.goals_endpoint()
    assert llm.endpoint_is_local(endpoint) is False

    llm._warn_once_about_transmission(endpoint)

    assert "Health goal descriptions" in caplog.text
    assert "api.groq.com" in caplog.text
    assert "No BAA" in caplog.text


def test_a_groq_key_parked_in_the_goals_slot_is_read(shared_endpoint, monkeypatch):
    """
    The reported deployment: a key set, and no base URL beside it.

    `GOALS_LLM_*` is all-or-nothing, so this key used to be ignored entirely
    and goals fell through to `LLM_*` — a local Ollama that is not running on
    a hosted instance. A Groq key states its vendor in its own prefix, so
    there is nothing to guess.
    """
    monkeypatch.setattr(settings, "goals_llm_api_key", "gsk_synthetic")

    goals = llm.goals_endpoint()

    assert goals.base_url == llm.GROQ_BASE_URL
    assert goals.model == llm.GROQ_DEFAULT_MODEL
    assert goals.api_key == "gsk_synthetic"
    assert llm.groq_key_source() == ("gsk_synthetic", "GOALS_LLM_API_KEY")
    assert goal_structuring.available() is True


def test_a_groq_key_parked_in_the_shared_slot_is_read_for_goals_only(
    shared_endpoint, monkeypatch
):
    """
    Same key, same silence, one setting over — and triage stays untouched.

    This branch only fires when `LLM_BASE_URL` is unset, so triage has no
    endpoint either way and no symptom description can start moving. It gives
    goal drafting a model and nothing else.
    """
    monkeypatch.setattr(settings, "llm_base_url", "")
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "llm_api_key", "gsk_synthetic")

    goals = llm.goals_endpoint()

    assert goals.host == "api.groq.com"
    assert goals.api_key == "gsk_synthetic"
    assert llm.groq_key_source() == ("gsk_synthetic", "LLM_API_KEY")
    # Triage is unconfigured, exactly as it was before this key was read.
    assert llm.configured() is False


def test_a_shared_key_beside_a_base_url_is_left_alone(shared_endpoint, monkeypatch):
    """
    A key that is already doing a job is never reassigned.

    `LLM_BASE_URL` is set here, so that key belongs to the triage endpoint.
    Reading it for goals would be second-guessing a working configuration.
    """
    monkeypatch.setattr(settings, "llm_api_key", "gsk_synthetic")

    assert llm.groq_key_source() is None
    goals = llm.goals_endpoint()
    assert goals.host == "localhost"


def test_a_non_groq_key_is_never_posted_to_groq(shared_endpoint, monkeypatch):
    """
    The prefix is the whole warrant for reading a generically-named setting.

    Without it this would post an OpenRouter or Google key to Groq, which
    fails as an auth error and tells the operator nothing about why.
    """
    monkeypatch.setattr(settings, "goals_llm_api_key", "sk-or-v1-synthetic")

    assert llm.groq_key_source() is None
    assert llm.goals_endpoint().host == "localhost"


def test_groq_api_key_wins_over_a_parked_key(shared_endpoint, monkeypatch):
    """The setting named for the vendor is the least ambiguous, so it leads."""
    monkeypatch.setattr(settings, "groq_api_key", "gsk_explicit")
    monkeypatch.setattr(settings, "goals_llm_api_key", "gsk_parked")

    assert llm.groq_key_source() == ("gsk_explicit", "GROQ_API_KEY")


def test_goals_reads_its_own_endpoint(shared_endpoint, monkeypatch):
    """`available()` must ask about the goals endpoint, not the shared one."""
    monkeypatch.setattr(settings, "llm_base_url", "")
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "goals_llm_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(settings, "goals_llm_model", "llama-3.3-70b-versatile")

    # Triage has nothing; goals has an endpoint of its own.
    assert llm.configured() is False
    assert goal_structuring.available() is True


def test_chat_sends_to_the_endpoint_it_was_given(shared_endpoint, monkeypatch):
    """The resolved endpoint decides the URL, the model and the auth header."""
    sent = {}

    class _Response:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}], "model": "m"}

    def _post(url, json, headers, timeout):
        sent.update(url=url, body=json, headers=headers)
        return _Response()

    monkeypatch.setattr(llm.httpx, "post", _post)

    llm.chat(
        messages=[{"role": "user", "content": "synthetic"}],
        endpoint=llm.Endpoint(
            base_url="https://api.groq.com/openai/v1",
            model="llama-3.3-70b-versatile",
            api_key="gsk_synthetic",
            label="Health goal descriptions",
        ),
    )

    assert sent["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert sent["body"]["model"] == "llama-3.3-70b-versatile"
    assert sent["headers"]["Authorization"] == "Bearer gsk_synthetic"


def test_a_hosted_endpoint_is_named_in_the_warning(monkeypatch, caplog):
    """
    A hosted endpoint says what is leaving the machine, not a generic line.

    CLAUDE.md requires a third-party processor to be flagged rather than
    assumed handled, and with two endpoints "which data?" is now a real
    question.
    """
    monkeypatch.setattr(llm, "_warned_about_transmission", set())

    llm._warn_once_about_transmission(
        llm.Endpoint(
            base_url="https://api.groq.com/openai/v1",
            model="m",
            api_key="k",
            label="Health goal descriptions",
        )
    )

    assert "Health goal descriptions" in caplog.text
    assert "api.groq.com" in caplog.text
    assert "No BAA" in caplog.text


def test_a_local_endpoint_warns_about_nothing(monkeypatch, caplog):
    monkeypatch.setattr(llm, "_warned_about_transmission", set())

    llm._warn_once_about_transmission(
        llm.Endpoint(
            base_url="http://localhost:11434/v1",
            model="m",
            api_key="",
            label="Health goal descriptions",
        )
    )

    assert caplog.text == ""


def test_two_hosts_are_warned_about_separately(monkeypatch, caplog):
    """
    Warning once per process would tell an operator about one vendor and stay
    silent about the other, which is the failure this split exists to prevent.
    """
    monkeypatch.setattr(llm, "_warned_about_transmission", set())

    for host, label in (
        ("https://api.groq.com/openai/v1", "Health goal descriptions"),
        ("https://openrouter.ai/api/v1", "Symptom descriptions"),
    ):
        llm._warn_once_about_transmission(
            llm.Endpoint(base_url=host, model="m", api_key="k", label=label)
        )

    assert "api.groq.com" in caplog.text
    assert "openrouter.ai" in caplog.text


def test_the_test_suite_cannot_reach_a_live_goals_endpoint():
    """
    The autouse guard in conftest blanks the goals settings too.

    Without this the guard had a hole: a `GOALS_LLM_BASE_URL` in a developer's
    .env would make unstubbed tests place real, billed calls carrying the
    descriptions written in these tests.
    """
    assert settings.goals_llm_base_url == ""
    assert settings.goals_llm_model == ""
    assert settings.goals_llm_api_key == ""
    assert settings.groq_api_key == ""
    assert goal_structuring.available() is False


# ---------------------------------------------------------------------------
# A failing endpoint has to say which repair it needs, without quoting the
# request back into the log.
# ---------------------------------------------------------------------------


class _ErrorResponse:
    """An httpx-shaped error response carrying a provider error body."""

    def __init__(self, status_code, payload, headers=None):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        raise llm.httpx.HTTPStatusError("boom", request=None, response=self)


def _post_failing(status_code, payload):
    def _post(url, json, headers, timeout):
        return _ErrorResponse(status_code, payload)

    return _post


def test_a_retired_model_says_so_in_the_log(monkeypatch, caplog):
    """
    The failure this exists for: three settings correct, one model name stale.

    Groq answers 404, the person is told "MedHelp has no suggestions right
    now", and "HTTP 404" in a deployment log does not point at the env var
    that needs editing. The code does.
    """
    monkeypatch.setattr(
        llm.httpx,
        "post",
        _post_failing(
            404,
            {
                "error": {
                    "code": "model_not_found",
                    "message": "you asked for llama-3.1-70b-versatile with: walk more",
                }
            },
        ),
    )

    with pytest.raises(llm.LLMUnavailable):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=llm.Endpoint(
                base_url=llm.GROQ_BASE_URL,
                model="llama-3.1-70b-versatile",
                api_key="gsk_synthetic",
                label="Health goal descriptions",
            ),
        )

    assert "model_not_found" in caplog.text
    assert "the configured model does not exist at this provider" in caplog.text
    # The code is read; the provider's own message never is, because it can
    # quote the request back — here, the person's own words.
    assert "you asked for" not in caplog.text
    assert "walk more" not in caplog.text


def test_a_rejected_key_is_distinguishable_from_a_missing_model(monkeypatch, caplog):
    monkeypatch.setattr(
        llm.httpx,
        "post",
        _post_failing(401, {"error": {"code": "invalid_api_key"}}),
    )

    with pytest.raises(llm.LLMUnavailable):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=llm.Endpoint(
                base_url=llm.GROQ_BASE_URL,
                model=llm.GROQ_DEFAULT_MODEL,
                api_key="gsk_wrong",
                label="Health goal descriptions",
            ),
        )

    assert "invalid_api_key" in caplog.text
    assert "gsk_wrong" not in caplog.text


def test_an_unrecognised_error_body_is_never_copied_into_the_log(monkeypatch, caplog):
    """
    ⛔ The rule this module rests on: a provider error body can quote the
    request, which is the person's own health text. Only codes on the
    allowlist are read, so an unfamiliar body contributes nothing at all.
    """
    monkeypatch.setattr(
        llm.httpx,
        "post",
        _post_failing(
            400,
            {
                "error": {
                    "code": "something_new",
                    "message": "your input was: I get dizzy on the stairs",
                }
            },
        ),
    )

    with pytest.raises(llm.LLMUnavailable):
        llm.chat(
            messages=[{"role": "user", "content": "I get dizzy on the stairs"}],
            endpoint=llm.Endpoint(
                base_url=llm.GROQ_BASE_URL,
                model=llm.GROQ_DEFAULT_MODEL,
                api_key="gsk_synthetic",
                label="Health goal descriptions",
            ),
        )

    assert "HTTP 400" in caplog.text
    assert "something_new" not in caplog.text
    assert "dizzy" not in caplog.text


# ---------------------------------------------------------------------------
# Two base-URL transcription errors, both of which 404 identically.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "configured",
    [
        "https://api.groq.com/openai/v1",
        "https://api.groq.com/openai/v1/",
        # Copied from a curl example, so the path is already complete.
        "https://api.groq.com/openai/v1/chat/completions",
        # The vendor's own name for itself, rather than its OpenAI base.
        "https://api.groq.com",
        "https://api.groq.com/",
    ],
)
def test_every_way_of_writing_groqs_url_reaches_the_same_endpoint(configured):
    assert (
        llm.completions_url(configured)
        == "https://api.groq.com/openai/v1/chat/completions"
    )


@pytest.mark.parametrize(
    "configured,expected",
    [
        ("http://localhost:11434/v1", "http://localhost:11434/v1/chat/completions"),
        ("https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/chat/completions"),
        # ⛔ An unknown host with an unexpected path is left exactly as written.
        # "Some other path" has no knowable right answer, and rewriting it
        # would hide the real mistake behind a different one.
        ("https://openrouter.ai/wrong", "https://openrouter.ai/wrong/chat/completions"),
    ],
)
def test_other_providers_are_left_as_configured(configured, expected):
    assert llm.completions_url(configured) == expected


# ---------------------------------------------------------------------------
# Rate limiting. A 429 is the one model failure that is temporary by
# definition, and the only one worth retrying — found in production on
# 2026-09-12 against a free-tier provider.
# ---------------------------------------------------------------------------


class _OkResponse:
    """A minimal successful chat completion."""

    status_code = 200
    headers: dict[str, str] = {}

    def json(self):
        return {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]}

    def raise_for_status(self):
        return None


def _goals_endpoint():
    return llm.Endpoint(
        base_url=llm.GROQ_BASE_URL,
        model="synthetic-model",
        api_key="gsk_synthetic",
        label="Health goal descriptions",
    )


def _rate_limited(headers=None):
    return _ErrorResponse(
        429,
        {"error": {"code": "rate_limit_exceeded", "message": "slow down: walk more"}},
        headers,
    )


def _always(response):
    """`httpx.post` is called with `url` positional, so accept anything."""

    def _post(*args, **kwargs):
        return response

    return _post


def _counting(calls, response):
    def _post(*args, **kwargs):
        calls.append(1)
        return response

    return _post


def test_a_rate_limit_raises_the_distinguishable_error(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(llm.httpx, "post", _always(_rate_limited()))

    with pytest.raises(llm.LLMRateLimited):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
        )


def test_a_rate_limit_is_still_an_llm_unavailable(monkeypatch):
    """
    ⛔ The safety property. Every existing handler keeps catching it, so
    nothing becomes less safe by the subclass existing.
    """
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(llm.httpx, "post", _always(_rate_limited()))

    with pytest.raises(llm.LLMUnavailable):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
        )


def test_nothing_is_retried_unless_the_caller_asked(monkeypatch):
    """
    ⛔ Default is zero, so triage is untouched.

    Triage has a rule layer underneath it and must not grow latency because
    goals wanted a retry. One attempt, exactly as before.
    """
    calls = []
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        llm.httpx, "post", _counting(calls, _rate_limited())
    )

    with pytest.raises(llm.LLMRateLimited):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
        )

    assert len(calls) == 1


def test_a_retry_recovers_a_burst(monkeypatch):
    """The case this exists for: limited once, fine on the next attempt."""
    replies = [_rate_limited(), _OkResponse()]
    slept = []
    monkeypatch.setattr(llm.time, "sleep", slept.append)
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: replies.pop(0))

    reply = llm.chat(
        messages=[{"role": "user", "content": "synthetic"}],
        endpoint=_goals_endpoint(),
        retry_on_rate_limit=2,
    )

    assert reply.text == "ok"
    assert len(slept) == 1


def test_retries_are_bounded(monkeypatch):
    """A provider that is limiting everything must not retry forever."""
    calls = []
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        llm.httpx, "post", _counting(calls, _rate_limited())
    )

    with pytest.raises(llm.LLMRateLimited):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
            retry_on_rate_limit=2,
        )

    # The first attempt plus two retries, and no more.
    assert len(calls) == 3


def test_a_long_retry_after_is_reported_rather_than_waited_on(monkeypatch):
    """
    ⛔ A person is waiting on this request.

    Sleeping out a 60-second per-minute quota would hold the connection open
    and turn a fast wrong answer into a slow one. The budget is small and a
    longer `Retry-After` is raised immediately so the screen can say "try
    again shortly".
    """
    slept = []
    monkeypatch.setattr(llm.time, "sleep", slept.append)
    monkeypatch.setattr(
        llm.httpx, "post", _always(_rate_limited({"retry-after": "60"}))
    )

    with pytest.raises(llm.LLMRateLimited) as caught:
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
            retry_on_rate_limit=2,
        )

    assert slept == []
    assert caught.value.retry_after_seconds == 60


@pytest.mark.parametrize("header", [{}, {"retry-after": "banana"}, {"retry-after": "-4"}])
def test_an_unusable_retry_after_is_simply_absent(monkeypatch, header):
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(llm.httpx, "post", _always(_rate_limited(header)))

    with pytest.raises(llm.LLMRateLimited) as caught:
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
        )

    assert caught.value.retry_after_seconds is None


def test_a_rate_limit_never_copies_the_provider_body_into_the_log(monkeypatch, caplog):
    """
    The rule that nothing from a response body is read unless it is known to
    be safe still holds — an error body can quote the person's own health text.
    `Retry-After` is a header, which is why reading it is allowed.
    """
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        llm.httpx, "post", _always(_rate_limited({"retry-after": "3"}))
    )

    with pytest.raises(llm.LLMRateLimited):
        llm.chat(
            messages=[{"role": "user", "content": "synthetic"}],
            endpoint=_goals_endpoint(),
        )

    assert "429" in caplog.text
    assert "rate_limit_exceeded" in caplog.text
    assert "walk more" not in caplog.text
    assert "slow down" not in caplog.text
