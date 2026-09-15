"""
Synthetic goals for measuring whether a proposed plan is actually about the
goal it was proposed for.

⛔ EVERY DESCRIPTION HERE IS INVENTED. None of it is a real person's health
text, and none may ever be replaced with one — the same rule as every other
fixture in this repository.

The corpus is built out of CONTRAST PAIRS rather than as a flat list, because
the reported failure was not "a bad plan", it was "the same plan for two
different goals":

    "I said I want to lose a hundred pounds, and I said I want to lose one
     pound, and it gave me the same plan."

A pair is two goals that a plan is obliged to answer differently. Each goal
also carries `anchors`: words a plan that actually read the goal has some
chance of using. They are a LEXICAL proxy and nothing more — a plan can be
perfectly responsive without using any of them, and a plan can echo one while
ignoring the goal entirely. Read the anchor rate as a floor on evidence of
reading, never as a score, and read the plans themselves: `--show` prints them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Goal:
    id: str
    text: str
    # Words a plan that read this goal might reasonably use. Lexical proxy.
    anchors: tuple[str, ...] = ()
    # The other half of a contrast pair. Two goals sharing a pair id must not
    # come back with the same plan.
    pair: str | None = None
    # Why these two are a pair, printed beside the overlap figure.
    note: str = ""
    # Bounds on how big a reader should find this goal, where the goal states
    # its own scale in so many words. Both None everywhere else.
    #
    # ⛔ WHAT THESE ARE, AND WHAT THEY ARE NOT. Bounds, never an exact answer,
    # assigned from `goal_structuring`'s OWN published definitions of small /
    # moderate / major. Same standing as the gold tiers in `triage_eval`,
    # which CLAUDE.md is careful to call consistency with documented intent
    # rather than correctness. Nobody clinically qualified assigned them.
    #
    # ⛔ They are set ONLY where the goal says its own size out loud — a
    # stated span of years, a stated history of trying and stopping, a stated
    # single day. "Is this moderate or major" is exactly the judgement this
    # app should not be scoring itself on, so a goal that could fairly be read
    # either way carries neither bound.
    not_below: str | None = None
    not_above: str | None = None


CORPUS: tuple[Goal, ...] = (
    # --- the reported pair: one domain at two very different scales --------
    Goal(
        id="weight-one-pound",
        not_above="moderate",
        text="I want to lose one pound before my sister's wedding next month.",
        anchors=("pound", "wedding", "month"),
        pair="weight-scale",
        note="scale: a single pound, with a date a month out",
    ),
    Goal(
        id="weight-hundred-pounds",
        not_below="major",
        text=(
            "I want to lose a hundred pounds. I know it is going to take a "
            "couple of years and I have started and stopped a lot of times."
        ),
        anchors=("hundred", "years", "started", "stopped"),
        pair="weight-scale",
        note="scale: a hundred pounds over years, with a history of stopping",
    ),
    # --- one domain, different lives around it -----------------------------
    Goal(
        id="sleep-shift",
        text=(
            "I work nights at a warehouse and I want to sleep properly on my "
            "days off without wrecking the rest of the week."
        ),
        anchors=("night", "shift", "days off", "warehouse"),
        pair="sleep-life",
        note="life: night shifts are the constraint",
    ),
    Goal(
        id="sleep-baby",
        text=(
            "I want to get to bed earlier. I have a six month old and I am "
            "usually up scrolling until one in the morning."
        ),
        anchors=("baby", "scrolling", "phone", "bed"),
        pair="sleep-life",
        note="life: a baby and a phone habit are the constraint",
    ),
    # --- one verb, two different things ------------------------------------
    Goal(
        id="walk-dog",
        text=(
            "I want to walk the dog before work instead of just letting him "
            "out in the garden."
        ),
        anchors=("dog", "walk", "before work", "morning"),
        pair="walk-what",
        note="a named activity with a named companion and a named time",
    ),
    Goal(
        id="walk-desk",
        text=(
            "I sit at a desk for nine hours a day and by Friday my back is "
            "killing me. I want to move more during the working day."
        ),
        anchors=("desk", "sit", "back", "work"),
        pair="walk-what",
        note="movement, constrained to inside a working day",
    ),
    # --- near and small against far and large, outside weight --------------
    Goal(
        id="quit-today",
        not_above="moderate",
        text="I want to get through today without a cigarette.",
        anchors=("cigarette", "smok", "today"),
        pair="quit-scale",
        note="scale: one day",
    ),
    Goal(
        id="quit-year",
        not_below="major",
        text=(
            "I want to stop smoking for good. I have smoked twenty a day for "
            "fifteen years."
        ),
        anchors=("smok", "cigarette", "twenty", "years"),
        pair="quit-scale",
        note="scale: for good, after fifteen years",
    ),
    # --- goals naming no activity, where a template is likeliest -----------
    Goal(
        id="vague-healthier",
        text="I want to be healthier.",
        anchors=(),
        note="names nothing; the plan here is the app's own and unanchored",
    ),
    Goal(
        id="vague-energy",
        text="I have no energy any more and I want that to change.",
        anchors=("energy",),
        note="names a feeling and no activity",
    ),
    # --- domains that must not collapse into the walk/sleep/cook plan ------
    Goal(
        id="stress-exams",
        text=(
            "My finals are in six weeks and I am so wound up I cannot "
            "concentrate for more than ten minutes."
        ),
        anchors=("exam", "final", "study", "concentrat", "week"),
        note="a stress goal with a deadline and a study context",
    ),
    Goal(
        id="social-isolation",
        text=(
            "I moved cities in January and I have not really spoken to anyone "
            "outside work since. I want that to change."
        ),
        anchors=("people", "friend", "call", "moved", "city"),
        note="a connection goal, which the generic plan has no row for",
    ),
    Goal(
        id="meds-routine",
        text=(
            "I keep forgetting to take my tablets in the evening and then I "
            "take them at midnight or not at all."
        ),
        anchors=("tablet", "evening", "take", "medicine"),
        note="a routine goal about an existing prescription",
    ),
    Goal(
        id="knee-injury",
        text=(
            "My physio said I should be moving my knee more but I am "
            "frightened of doing it wrong so I have stopped doing anything."
        ),
        anchors=("knee", "physio", "mov"),
        note="names a clinician and an injury; the plan must stay everyday",
    ),
    Goal(
        id="cooking-budget",
        text=(
            "I want to stop getting takeaways five nights a week. I am broke "
            "and I cannot really cook."
        ),
        anchors=("takeaway", "cook", "cheap", "shop"),
        note="food, with money and skill as the named constraints",
    ),
    Goal(
        id="screen-evening",
        text="I want to stop losing my whole evening to my phone.",
        anchors=("phone", "screen", "evening"),
        note="a habit goal with a named part of the day",
    ),
)


def pairs() -> dict[str, tuple[Goal, ...]]:
    """The contrast pairs, keyed by pair id."""
    grouped: dict[str, list[Goal]] = {}
    for goal in CORPUS:
        if goal.pair:
            grouped.setdefault(goal.pair, []).append(goal)
    return {key: tuple(value) for key, value in grouped.items() if len(value) > 1}
