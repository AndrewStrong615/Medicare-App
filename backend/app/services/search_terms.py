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

# Conversational scaffolding: the words people wrap a complaint in when they
# are talking to something rather than typing keywords at it. None of them
# name a body part, a symptom, or a quality of one.
#
# MEASURED, NOT GUESSED. Every word here was pulled off a run of 1,190
# synthetic descriptions through the live service, where it did one of two
# concrete kinds of damage:
#
#   * it displaced a real symptom word out of the query. "my doctor is away
#     and I have got a pounding headache" searched for "doctor away pounding"
#     before it ever searched for "headache".
#   * it satisfied `title_matches` on its own, so an unrelated topic was kept
#     because it shared a word like "what" or "doctor" with the description.
#     "not really sure what is going on, but I have got a headache" attached
#     "Cholesterol Levels: What You Need to Know" — on the word "what".
#
# Between them those two effects accounted for 187 of the 255 off-target
# attachments in that run. Kept as a separate list from the filler above so
# that what was added, and why, stays legible to a reviewer.
_CONVERSATIONAL = frozenset(
    """
    what whats why how who whom whose which where whether
    sure unsure know knows knew idea guess guessing
    wonder wonders wondering wondered
    should shall would could can may might must will
    doctor doctors dr physician gp clinic appointment
    worry worries worried worrying
    bother bothers bothering bothered
    deal deals dealing dealt
    drive drives driving crazy
    quit quits quitting
    thing things anything something nothing anyone someone everything
    few couple all time times away let lets letting
    wake wakes waking woke woken
    notice notices noticing noticed
    experience experiences experiencing experienced
    suffer suffers suffering suffered
    """.split()
)

_STOPWORDS = _STOPWORDS | _CONVERSATIONAL

# Negations are deliberately NOT filler: "the swelling is not going down"
# means something different from "the swelling is going down", so they stay in
# the description and in the multi-word queries built from it.
#
# But a negation on its own says nothing about what is wrong. Standing alone
# it is neither a sensible thing to search for nor evidence that a topic is
# relevant, and treating it as either produces answers with no relationship to
# the description at all: searching the single word "not" returned "Advance
# Directives", which the source also publishes under the name "Do Not
# Resuscitate", and that matched. Someone reporting a headache was shown a
# topic about end-of-life paperwork.
#
# So they are kept for context and excluded from both roles.
_NEGATIONS = frozenset(
    """
    not no never none nothing cannot
    can't cant don't dont doesn't doesnt didn't didnt
    won't wont wouldn't wouldnt shouldn't shouldnt couldn't couldnt
    isn't isnt aren't arent wasn't wasnt weren't werent
    haven't havent hasn't hasnt hadn't hadnt
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

    # Then each word alone — LAST WORD FIRST.
    #
    # English puts the thing being complained about at the end of the phrase
    # and its qualifiers in front: "sore throat", "swollen ankle", "dry
    # cough", "painful urination", "bleeding gums", "high cholesterol". The
    # last word is the one a topic is likely to be named after; the earlier
    # ones are adjectives that name a topic of their own and pull the search
    # somewhere else entirely.
    #
    # Trying them front-first is what sent "a dry cough" to "Dry Mouth",
    # "painful urination" to "Chest Pain", "high cholesterol" to "High Blood
    # Pressure" and "my lower back hurts" to "How to Lower Cholesterol" — the
    # last of which CLAUDE.md already records as a known wrong answer. Each of
    # those queries had the right word available and asked with the wrong one
    # first.
    #
    # Purely positional. Nothing here reads what a word means; it only uses
    # where the person put it.
    for word in reversed(words[:MAX_QUERY_WORDS]):
        # A bare negation is not a search. See `_NEGATIONS`.
        if word in _NEGATIONS:
            continue
        if word not in queries:
            queries.append(word)

    return queries[:MAX_ATTEMPTS]


# Below this length a prefix match is coincidence rather than a shared word.
_MIN_STEM_LENGTH = 4


def _stem(word: str) -> str:
    """
    Strip the inflection off a word so two spellings of it can be compared.

    People write "dizzy", "my ears", "bleeding gums", "bunions", "depressed";
    the topics are called "Dizziness and Vertigo", "Ear Disorders", "Gum
    Disease", "Bunions" and "Depression". Without this the right article is
    fetched and then thrown away by `title_matches` — "ears" failed to match
    "Ear Disorders" purely because "ear" is three letters long.

    Only inflection is removed: a plural "s"/"es" and a past-tense "ed".
    Derivational endings are left alone, deliberately — stripping "-ing" makes
    "hearing" into "hear", which then matches "Heart Attack".

    Each guard below exists to stop a word being cut into something it is not:
    "stress" is not a plural of "stres", "sinus" is not a plural of "sinu",
    "psoriasis" is not a plural of "psoriasi", and "red" is not the past tense
    of "r". Purely orthographic — no word list, no judgement about meaning.
    """
    if word.endswith("y"):
        return word[:-1] + "i"
    if word.endswith("es") and len(word) > 4 and not word.endswith(("ses", "ies")):
        return word[:-2]
    if word.endswith("s") and len(word) > 3 and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    if word.endswith("ed") and len(word) > 5:
        return word[:-2]
    return word


def _same_word(left: str, right: str) -> bool:
    """
    The same word, allowing for inflection ("ear" / "ears", "rash" / "rashes").

    Two stems that come out identical are the same word at any length, which
    is what lets "ears" match "Ear Disorders". The minimum length applies only
    to the weaker prefix test, where a short overlap really is coincidence —
    it is what keeps "ear" away from "Earthquakes".
    """
    if left == right:
        return True

    left_stem, right_stem = _stem(left), _stem(right)
    if left_stem == right_stem:
        return True

    shorter, longer = sorted((left_stem, right_stem), key=len)
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
    # A negation is context for the words around it, never evidence on its
    # own that a topic is about what the person described. See `_NEGATIONS`.
    evidence = [w for w in words if w not in _NEGATIONS]
    return any(_same_word(t, w) for t in title_words for w in evidence)


def names_match(title: str, alt_titles: list[str], words: list[str]) -> bool:
    """
    Whether the description shares a word with any name THE SOURCE gives this
    topic — its title, or one of its own `altTitle` entries.

    WHY THE TITLE ALONE IS NOT ENOUGH: MedlinePlus files topics under a
    clinical heading and then publishes the lay names separately. "Bunions" is
    not a title, it is an alternate title of "Toe Injuries and Disorders".
    "Sunburn" is an alternate title of "Sun Exposure". "Plantar Fasciitis" is
    an alternate title of "Heel Injuries and Disorders". Someone who writes
    the word the source itself calls the topic was being told nothing matched.

    This does not loosen the rule that keeps unrelated topics out; it applies
    the same rule to more of the source's own vocabulary. The test is still
    lexical, still asks only "did the person write this word", and still uses
    words NLM published rather than any synonym list of ours — which is the
    whole reason it is allowed to exist. Topics are still dropped rather than
    reordered, because ranking them would be a clinical judgement.

    The alternate titles are used for matching only. Nothing renders them, and
    the topic is still shown under its own title.
    """
    if title_matches(title, words):
        return True
    return any(title_matches(alt, words) for alt in alt_titles)
