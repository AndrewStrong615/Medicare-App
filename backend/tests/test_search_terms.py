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
    names_match,
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


class TestConversationalScaffolding:
    """
    Words people wrap a complaint in, which used to be searched for and
    matched on as if they were symptoms.

    Each of these was an observed wrong answer against the live service, not a
    hypothetical: they are the two failure shapes described in the module's
    `_CONVERSATIONAL` comment.
    """

    def test_a_hedged_opener_does_not_become_the_search(self):
        # "not sure what" was searched before "headache" ever was, and then
        # "Cholesterol Levels: What You Need to Know" was kept on the word
        # "what".
        words = content_words(
            "not really sure what is going on, but I have got a headache"
        )

        assert "headache" in words
        for scaffolding in ("sure", "what", "going"):
            assert scaffolding not in words

    def test_talking_about_a_doctor_does_not_become_the_search(self):
        # This description used to search "doctor away pounding" first and
        # attach "Talking With Your Doctor".
        queries = candidate_queries(
            "my doctor is away and I have got a pounding headache, should I be worried"
        )

        assert queries[0] == "pounding headache"
        assert not any("doctor" in q for q in queries)

    def test_scaffolding_alone_cannot_justify_keeping_a_topic(self):
        words = content_words("just wondering what is going on")

        assert not title_matches("Cholesterol Levels: What You Need to Know", words)
        assert not title_matches("Talking With Your Doctor", words)

    def test_negations_survive_the_extra_filtering(self):
        # Still true after the additions: dropping "not" would change what is
        # being searched for.
        assert "not" in content_words("the swelling is not going down")


class TestSingleWordOrder:
    """
    English puts the complaint at the end and its qualifiers in front, so the
    last word is tried on its own first.
    """

    @pytest.mark.parametrize(
        "description, head, qualifier",
        [
            ("a dry cough", "cough", "dry"),
            ("painful urination", "urination", "painful"),
            ("high cholesterol", "cholesterol", "high"),
            ("bleeding gums", "gums", "bleeding"),
            ("a swollen ankle", "ankle", "swollen"),
        ],
    )
    def test_the_last_word_is_tried_before_its_qualifier(
        self, description, head, qualifier
    ):
        queries = candidate_queries(description)

        assert queries.index(head) < queries.index(qualifier)

    def test_the_qualifier_is_still_tried_eventually(self):
        # Reordering must not drop a query, only postpone it.
        assert "dry" in candidate_queries("a dry cough")


class TestStemming:
    @pytest.mark.parametrize(
        "title, word",
        [
            ("Ear Disorders", "ears"),
            ("Gum Disease", "gums"),
            ("Toe Injuries and Disorders", "toes"),
            ("Eye Care", "eyes"),
            ("Depression", "depressed"),
            ("Swelling", "swelled"),
        ],
    )
    def test_plurals_and_past_tense_still_match(self, title, word):
        # "ears" used to fail against "Ear Disorders" purely because "ear" is
        # three letters long.
        assert title_matches(title, [word])

    @pytest.mark.parametrize(
        "title, word",
        [
            # A word is never cut into something it is not.
            ("Stress", "stressed"),
            ("Sinusitis", "sinus"),
            ("Psoriasis", "psoriasis"),
        ],
    )
    def test_words_that_only_look_inflected_are_left_alone(self, title, word):
        assert title_matches(title, [word])

    @pytest.mark.parametrize(
        "title, word",
        [
            ("Earthquakes", "ear"),
            # "hearing" must not be cut down to "hear" and matched to "Heart".
            ("Heart Attack", "hearing"),
            ("Red Blood Cell Disorders", "reduce"),
        ],
    )
    def test_short_or_coincidental_overlaps_are_still_rejected(self, title, word):
        assert not title_matches(title, [word])


class TestNamesMatch:
    """
    The source publishes its own alternate names for a topic. Matching them is
    still "did the person write this word" -- against NLM's vocabulary, not a
    synonym list of ours.
    """

    @pytest.mark.parametrize(
        "title, alt_titles, word",
        [
            ("Toe Injuries and Disorders", ["Bunions", "Hammer Toe"], "bunions"),
            ("Sun Exposure", ["Sunburn", "Sunscreen"], "sunburn"),
            ("Heel Injuries and Disorders", ["Plantar Fasciitis"], "fasciitis"),
            ("Nail Diseases", ["Ingrown Nail", "Toenails"], "toenail"),
        ],
    )
    def test_a_topic_the_source_also_calls_the_users_word_is_kept(
        self, title, alt_titles, word
    ):
        # Title-only matching told all of these users that nothing matched,
        # while the source was saying that word is the name of the topic.
        assert names_match(title, alt_titles, [word])

    def test_a_topic_sharing_nothing_is_still_dropped(self):
        # The filter is not loosened, only pointed at more of the source's own
        # vocabulary.
        assert not names_match(
            "Diabetic Heart Disease", ["Diabetes and Heart Disease"], ["swollen", "ankle"]
        )

    def test_a_title_match_still_works_with_no_alternate_titles(self):
        assert names_match("Ankle Injuries and Disorders", [], ["swollen", "ankle"])


class TestNegations:
    """
    A negation changes what the words around it mean, so it is kept -- but on
    its own it describes nothing, so it is never searched for or matched on.
    """

    def test_a_negation_survives_in_the_description(self):
        assert "not" in content_words("the swelling is not going down")

    def test_a_negation_still_shapes_a_multi_word_query(self):
        queries = candidate_queries("the swelling is not going down")

        assert any("not" in q.split() for q in queries)

    def test_a_negation_is_never_searched_for_on_its_own(self):
        queries = candidate_queries("a pounding headache that has not let up")

        assert "not" not in queries
        assert "headache" in queries

    def test_a_negation_alone_cannot_keep_a_topic(self):
        # Searching the bare word "not" returned "Advance Directives", which
        # the source also publishes as "Do Not Resuscitate". It was attached
        # to descriptions of a headache.
        words = content_words("a pounding headache that has not let up")

        assert not title_matches("Advance Directives", ["not"])
        assert not names_match("Advance Directives", ["Do Not Resuscitate"], ["not"])
        # The real word in the same description still matches.
        assert title_matches("Headache", words)
