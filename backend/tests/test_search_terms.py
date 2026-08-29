"""
Tests for reducing a conversational description to search terms.

This module only chooses what to look up. It makes no clinical judgement, so
what is asserted here is that meaningful words survive and filler does not.
All descriptions are synthetic.
"""

import pytest

from app.services.search_terms import (
    candidate_queries,
    content_words,
    title_matches,
)


class TestContentWords:
    def test_filler_is_removed_and_symptom_words_survive(self):
        words = content_words("I have really been feeling a sore throat since yesterday")

        assert words == ["sore", "throat"]

    def test_word_order_is_preserved(self):
        assert content_words("swollen ankle") == ["swollen", "ankle"]

    def test_repeated_words_are_not_allowed_to_dominate(self):
        words = content_words("pain pain so much pain in my knee")

        assert words == ["pain", "knee"]

    @pytest.mark.parametrize(
        "description, expected",
        [
            ("my head hurts", ["head", "hurts"]),
            ("rash on my arm", ["rash", "arm"]),
            ("I can't stop coughing", ["can't", "stop", "coughing"]),
        ],
    )
    def test_ordinary_phrasings(self, description, expected):
        assert content_words(description) == expected

    def test_negations_are_kept(self):
        # Dropping "not" would change what is being searched for.
        assert "not" in content_words("the swelling is not going down")

    def test_punctuation_and_case_do_not_matter(self):
        assert content_words("Sore THROAT!!") == ["sore", "throat"]


class TestTitleMatches:
    def test_a_title_sharing_a_word_is_kept(self):
        assert title_matches("Ankle Injuries and Disorders", ["swollen", "ankle"])

    def test_a_title_sharing_nothing_is_dropped(self):
        # The live source really does return this for "swollen ankle". Shown
        # under someone's description it would read as a suggested diagnosis.
        assert not title_matches("Diabetic Heart Disease", ["swollen", "ankle"])

    def test_simple_plurals_still_match(self):
        assert title_matches("Rashes", ["rash"])

    @pytest.mark.parametrize(
        "title, word",
        [
            ("Dizziness and Vertigo", "dizzy"),
            ("Itching", "itchy"),
        ],
    )
    def test_the_y_to_i_inflection_still_matches(self, title, word):
        # The source returns the right topic for these; without the rule it
        # was fetched and then discarded.
        assert title_matches(title, [word])

    def test_short_prefixes_are_not_treated_as_a_match(self):
        # "ear" must not match "Earthquakes".
        assert not title_matches("Earthquakes", ["ear"])

    def test_matching_ignores_case_and_punctuation(self):
        assert title_matches("Sore Throat", ["throat"])


class TestCandidateQueries:
    def test_the_most_specific_query_comes_first(self):
        queries = candidate_queries("I have a sore throat and a headache")

        assert queries[0] == "sore throat headache"

    def test_queries_broaden_rather_than_repeat(self):
        queries = candidate_queries(
            "my lower back has been aching and stiff and sore after lifting boxes"
        )

        assert len(queries) == len(set(queries))
        # Each step is no narrower than the one before it, so the search only
        # ever widens and never re-asks the same thing.
        widths = [len(q.split()) for q in queries]
        assert widths == sorted(widths, reverse=True)

    def test_a_long_description_is_capped(self):
        # The source behaves like an AND over terms, so a long query returns
        # nothing at all rather than something less precise.
        description = " ".join(f"word{n}" for n in range(30))

        assert len(candidate_queries(description)[0].split()) == 3

    def test_every_word_is_eventually_tried_alone(self):
        # Shortening only from the front would never search "ankle" by itself,
        # and that is the query that returns the ankle topic.
        queries = candidate_queries("I have a swollen ankle")

        assert "ankle" in queries
        assert queries.index("swollen ankle") < queries.index("ankle")

    def test_the_number_of_upstream_calls_is_bounded(self):
        queries = candidate_queries("aching stiff sore swollen bruised tender knee")

        assert len(queries) <= 5

    def test_an_all_filler_description_still_produces_something_to_search(self):
        # Better to search and miss than to silently skip the lookup.
        assert candidate_queries("I have been feeling really very off") != []

    def test_an_empty_description_produces_no_query(self):
        assert candidate_queries("   ") == []
