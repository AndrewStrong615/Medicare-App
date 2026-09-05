"""
Tests for parsing MedlinePlus responses.

The XML fixture below is a trimmed copy of a real response shape, with
synthetic wording. No live network calls are made from tests.
"""

import pytest

from app.services.medlineplus import (
    MedlinePlusUnavailable,
    parse_search_response,
    strip_markup,
)

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<nlmSearchResult>
  <term>test topic</term>
  <count>2</count>
  <list num="2" start="0">
    <document rank="0" url="https://medlineplus.gov/testtopic.html">
      <content name="title">&lt;span class="qt0"&gt;Test&lt;/span&gt; Topic</content>
      <content name="FullSummary">&lt;p&gt;A short intro.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;First item&lt;/li&gt;&lt;li&gt;Second item&lt;/li&gt;&lt;/ul&gt;</content>
      <content name="groupName">Example Group</content>
      <content name="groupName">Symptoms</content>
      <content name="altTitle">&lt;span class="qt0"&gt;Other&lt;/span&gt; Name</content>
      <content name="altTitle">Second Other Name</content>
    </document>
    <document rank="1" url="https://medlineplus.gov/othertopic.html">
      <content name="title">Other Topic</content>
      <content name="snippet">Only a snippet is available.</content>
    </document>
  </list>
</nlmSearchResult>
"""


def test_parses_topics_with_id_title_and_url():
    topics = parse_search_response(SAMPLE_XML)

    assert len(topics) == 2
    first = topics[0]
    assert first.topic_id == "testtopic"
    assert first.title == "Test Topic"
    assert first.url == "https://medlineplus.gov/testtopic.html"


def test_search_term_highlight_markup_is_removed_from_titles():
    topics = parse_search_response(SAMPLE_XML)

    # The service wraps matched words in <span class="qtN">; users must never
    # see that markup.
    assert "<span" not in topics[0].title
    assert "qt0" not in topics[0].title


def test_list_structure_is_preserved_as_bullets():
    topics = parse_search_response(SAMPLE_XML)

    summary = topics[0].summary
    assert "A short intro." in summary
    assert "• First item" in summary
    assert "• Second item" in summary
    assert "<li>" not in summary


def test_snippet_is_used_when_no_full_summary_exists():
    topics = parse_search_response(SAMPLE_XML)

    assert topics[1].summary == "Only a snippet is available."


def test_group_names_are_collected():
    topics = parse_search_response(SAMPLE_XML)

    assert topics[0].groups == ["Example Group", "Symptoms"]


def test_every_topic_carries_source_attribution():
    # Attribution is a condition of using this content, and tells the user the
    # text is not written by the app.
    for topic in parse_search_response(SAMPLE_XML):
        assert "National Library of Medicine" in topic.source_name


def test_documents_without_a_url_or_title_are_skipped():
    xml = """<?xml version="1.0"?>
    <nlmSearchResult><list>
      <document rank="0"><content name="title">No URL</content></document>
      <document rank="1" url="https://medlineplus.gov/notitle.html"></document>
      <document rank="2" url="https://medlineplus.gov/good.html">
        <content name="title">Good</content>
      </document>
    </list></nlmSearchResult>"""

    topics = parse_search_response(xml)

    assert [t.title for t in topics] == ["Good"]


def test_malformed_xml_raises_unavailable_rather_than_crashing():
    with pytest.raises(MedlinePlusUnavailable):
        parse_search_response("<nlmSearchResult><list>truncated")


def test_empty_result_list_parses_to_no_topics():
    xml = '<?xml version="1.0"?><nlmSearchResult><count>0</count><list num="0"/></nlmSearchResult>'

    assert parse_search_response(xml) == []


class TestStripMarkup:
    def test_returns_empty_string_for_missing_input(self):
        assert strip_markup(None) == ""
        assert strip_markup("") == ""

    def test_decodes_html_entities(self):
        assert strip_markup("Fever &amp; chills") == "Fever & chills"

    def test_collapses_excess_blank_lines(self):
        assert "\n\n\n" not in strip_markup("<p>a</p><p></p><p></p><p>b</p>")


def test_the_sources_own_alternate_titles_are_captured():
    """
    NLM publishes lay names separately from the title -- "Bunions" is an
    altTitle of "Toe Injuries and Disorders". Dropping them meant a user who
    wrote the name the source itself gives a topic was told nothing matched.
    """
    topics = parse_search_response(SAMPLE_XML)

    assert topics[0].alt_titles == ["Other Name", "Second Other Name"]


def test_highlight_markup_is_removed_from_alternate_titles():
    topics = parse_search_response(SAMPLE_XML)

    assert "<span" not in topics[0].alt_titles[0]


def test_a_topic_with_no_alternate_titles_gets_an_empty_list():
    topics = parse_search_response(SAMPLE_XML)

    assert topics[1].alt_titles == []
