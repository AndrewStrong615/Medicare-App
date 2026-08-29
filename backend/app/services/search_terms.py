"""
Turn a conversational symptom description into MedlinePlus search queries.

WHY THIS EXISTS: people write "my ankle has been killing me since I rolled it
playing football", not "ankle injury". Handing that whole sentence to a
keyword search buries the two words that matter under a dozen that do not, so
the lookup comes back empty or comes back ranked on "playing". An empty
lookup is most of the reason the app has felt like it has nothing to say.

WHAT THIS IS NOT: this does not interpret, classify, or diagnose anything. It
deletes filler words and does nothing else. Choosing which article to look up
is a retrieval step; the article's text is still MedlinePlus's, verbatim, and
the app still authors no medical content (see CLAUDE.md).

Deterministic on purpose — no model, no network, no key. The same description
always produces the same queries, so this file can be reviewed by reading it.
"""

from __future__ import annotations

import re

# Filler only: articles, pronouns, prepositions, auxiliaries, generic verbs of
# having/feeling, time references, and intensity adverbs. Nothing here carries
# symptom meaning. Deliberately does NOT include negations ("no", "not",
# "can't") or body parts — dropping those would change what is searched for.
_STOPWORDS = frozenset(
    """
    a an the this that these those there here
    i me my mine myself we our us you your yours it its
    am is are was were be been being do does did doing
    have has had having get gets got getting
    feel feels feeling felt
    seem seems seemed
    think thinks thought
    go goes going went
    and or but so then than if when while because as
    of in on at to from with without by for about around near
    after before during until through into onto between whenever
    up down out off over under again also too very really quite pretty
    super kinda kind sort bit little lot much many some any
    just like still even ever always sometimes
    today yesterday tonight morning afternoon evening night
    day days week weeks month months hour hours minute minutes year years
    ago since lately recently now currently
    started start starting begun began
    keep keeps keeping
    please help
    """.split()
)

_TOKEN_RE = re.compile(r"[a-z0-9']+")

# Measured against the live service, not guessed. MedlinePlus behaves close to
# an AND over the terms: "back pain lifting boxes" and "cough fever tired" both
# return nothing, while "back pain" and "cough" return the obvious topic. More
# words is not more precise here, it is just empty, so the ladder starts short.
MAX_QUERY_WORDS = 3

# A ceiling on upstream calls per assessment. Only ever reached when the
# service is up and answering with nothing usable; a genuine outage aborts on
# the first call.
MAX_ATTEMPTS = 5


def content_words(description: str) -> list[str]:
    """
    The description with filler removed, in the order it was written.

    Duplicates are dropped so a repeated word cannot dominate the query.
    """
    tokens = _TOKEN_RE.findall(description.lower())

    words: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if len(token) < 2 or token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        words.append(token)
    return words


def candidate_queries(description: str) -> list[str]:
    """
    Queries to try in order, most specific first.

    Broadening in steps matters because a precise query is better when it
    matches and useless when it does not. Returns an empty list only when the
    description contains nothing but filler.
    """
    words = content_words(description)

    if not words:
        # Everything was filler. Fall back to the raw words rather than
        # searching for nothing — the caller can still come up empty, which
        # is a better outcome than pretending the description was blank.
        raw = _TOKEN_RE.findall(description.lower())
        return [" ".join(raw)] if raw else []

    queries: list[str] = []

    for size in (MAX_QUERY_WORDS, 2):
        query = " ".join(words[:size])
        if query and query not in queries:
            queries.append(query)

    # Then each word alone, in the order written. Shortening only from the
    # front would never try "ankle" on its own for "swollen ankle" — and the
    # later word is often the one with a topic named after it, because that is
    # how English orders "swollen ankle" and "sore throat".
    for word in words[:MAX_QUERY_WORDS]:
        if word not in queries:
            queries.append(word)

    return queries[:MAX_ATTEMPTS]


# Below this length a prefix match is coincidence rather than a shared word.
_MIN_STEM_LENGTH = 4


def _stem(word: str) -> str:
    """
    Trailing "y" to "i", which is all the inflection handling needed here.

    People write "dizzy" and "itchy"; the topics are called "Dizziness and
    Vertigo" and "Itching". Without this the right article is fetched and then
    thrown away by `title_matches`. Purely orthographic — no word list, no
    judgement about what any word means.
    """
    return word[:-1] + "i" if word.endswith("y") else word


def _same_word(left: str, right: str) -> bool:
    """Equal, or one is a prefix of the other ("rash" / "rashes")."""
    if left == right:
        return True
    shorter, longer = sorted((_stem(left), _stem(right)), key=len)
    return len(shorter) >= _MIN_STEM_LENGTH and longer.startswith(shorter)


def title_matches(title: str, words: list[str]) -> bool:
    """
    Whether a source topic's title actually shares a word with the description.

    WHY THIS IS NEEDED: the upstream relevance ranking is loose. A search for
    "swollen ankle" returns "Diabetic Heart Disease" and "Edema" above
    anything about ankles. Printing that under someone's description reads as
    a suggested diagnosis no matter what the surrounding disclaimer says.

    This is a lexical test, not a clinical one — it asks only "did the person
    write this word", which is exactly what the UI claims the list is. Topics
    that fail it are dropped rather than reordered; the app does not rank
    health topics by relevance, because that would be a judgement it is not
    allowed to make.
    """
    title_words = _TOKEN_RE.findall(title.lower())
    return any(_same_word(t, w) for t in title_words for w in words)
