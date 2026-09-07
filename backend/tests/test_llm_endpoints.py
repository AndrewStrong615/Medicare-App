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
    assert goal_structuring.available() is False
