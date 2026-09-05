"""
Measures how often symptom intake comes back with related reading that is
actually about what the user described, and why it does not when it does not.

    python scripts/topic_retrieval_eval/measure.py --label "my change"

Runs the real retrieval path -- `search_terms.candidate_queries` -> the live
MedlinePlus service -> `search_terms.names_match` -- over the synthetic corpus
in `corpus.py`. Upstream responses are cached on disk, so the first run costs
a few hundred requests and every run after it is free and compares against the
same responses. Delete the cache to re-measure against the live service.

WHY THIS EXISTS: the accuracy figures in CLAUDE.md under "Medical content:
where it comes from" are this script's output. Retrieval quality here is not
something to reason about from reading the code -- the upstream ranking is
loose and surprising, and every rule in `search_terms.py` was added because of
a wrong answer this harness surfaced, not because it sounded right. Re-run it
after changing that file and update the numbers.

This measures RETRIEVAL only: which source article gets fetched. It makes no
clinical claim, and `expect` in the corpus is a scoring aid for this script
alone -- nothing in the app reads it.

SYNTHETIC INPUT ONLY. Every description is invented; see the note at the top
of corpus.py. This calls a third-party vendor that CLAUDE.md records as having
no BAA, which is acceptable here precisely because none of the input came from
a person. Never point it at anything a real user typed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
# backend/ , so that `app.*` resolves however this is invoked.
sys.path.insert(0, str(HERE.parent.parent))
sys.path.insert(0, str(HERE))

import httpx  # noqa: E402

from app.core import rules_triage  # noqa: E402
from app.services.medlineplus import parse_search_response  # noqa: E402
from app.services import search_terms  # noqa: E402

from corpus import build  # noqa: E402

CACHE_PATH = HERE / "upstream_cache.json"
ENDPOINT = "https://wsearch.nlm.nih.gov/ws/query"
CONCURRENCY = 4


def load_cache() -> dict[str, list[dict]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, list[dict]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=0), encoding="utf-8")


async def fetch_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    """One upstream search, reduced to the fields the match step reads."""
    response = await client.get(
        ENDPOINT,
        params={"db": "healthTopics", "term": query, "retmax": "5"},
    )
    response.raise_for_status()
    return [
        {"title": t.title, "url": t.url, "groups": t.groups, "alt": t.alt_titles}
        for t in parse_search_response(response.text)
    ]


async def warm_cache(queries: set[str], cache: dict[str, list[dict]]) -> None:
    missing = sorted(q for q in queries if q not in cache)
    if not missing:
        print(f"cache warm: all {len(queries)} queries already cached")
        return

    print(f"cache warm: fetching {len(missing)} of {len(queries)} queries")
    semaphore = asyncio.Semaphore(CONCURRENCY)
    done = 0

    async with httpx.AsyncClient(timeout=20.0) as client:

        async def one(query: str) -> None:
            nonlocal done
            async with semaphore:
                for attempt in range(3):
                    try:
                        cache[query] = await fetch_query(client, query)
                        break
                    except Exception:
                        if attempt == 2:
                            cache[query] = []
                        else:
                            await asyncio.sleep(1.5 * (attempt + 1))
                done += 1
                if done % 50 == 0:
                    print(f"  {done}/{len(missing)}")
                await asyncio.sleep(0.05)

        await asyncio.gather(*(one(q) for q in missing))

    save_cache(cache)
    print(f"cache warm: done, {len(cache)} queries cached")


def evaluate(cases: list[dict], cache: dict[str, list[dict]]) -> dict:
    """Replay `_related_topics` against the cache and score every case."""
    stats = Counter()
    miss_reasons = Counter()
    misses: list[dict] = []
    spurious: list[dict] = []
    hit_at_step = Counter()

    for case in cases:
        description = case["description"]
        words = search_terms.content_words(description)
        queries = search_terms.candidate_queries(description)

        rules = rules_triage.classify(description)
        if rules.defaulted:
            stats["rules_defaulted"] += 1
        stats[f"rule_tier_{rules.tier_name}"] += 1

        upstream_any = False
        matched: list[dict] = []
        step = None

        for index, query in enumerate(queries):
            topics = cache.get(query, [])
            if topics:
                upstream_any = True
            relevant = [
                t
                for t in topics
                if search_terms.names_match(t["title"], t.get("alt", []), words)
            ]
            if relevant:
                matched = relevant[:3]
                step = index
                break

        if matched:
            stats["hit"] += 1
            hit_at_step[step] += 1
            expected = case["expect"]
            fair = any(
                any(
                    e in name.lower()
                    for name in [t["title"], *t.get("alt", [])]
                    for e in [ex]
                )
                for t in matched
                for ex in expected
            )
            if fair:
                stats["hit_on_target"] += 1
            else:
                stats["hit_off_target"] += 1
                spurious.append(
                    {
                        "description": description,
                        "expect": list(expected),
                        "titles": [t["title"] for t in matched],
                    }
                )
        else:
            stats["miss"] += 1
            if not queries:
                reason = "no_queries"
            elif not upstream_any:
                reason = "upstream_returned_nothing"
            else:
                reason = "nothing_returned_shared_a_word_with_the_description"
            miss_reasons[reason] += 1
            misses.append(
                {
                    "description": description,
                    "complaint": case["complaint"],
                    "expect": list(case["expect"]),
                    "words": words,
                    "queries": queries,
                    "reason": reason,
                    "upstream_titles": {
                        q: [t["title"] for t in cache.get(q, [])] for q in queries
                    },
                }
            )

    return {
        "stats": dict(stats),
        "miss_reasons": dict(miss_reasons),
        "hit_at_step": dict(hit_at_step),
        "misses": misses,
        "spurious": spurious,
    }


def report(result: dict, total: int, label: str) -> None:
    stats = result["stats"]
    hit = stats.get("hit", 0)
    on = stats.get("hit_on_target", 0)
    print()
    print(f"=== {label} :: {total} synthetic descriptions ===")
    print(f"related reading attached : {hit:5d}  ({hit / total:6.1%})")
    print(f"  ...and on-target       : {on:5d}  ({on / total:6.1%})")
    print(f"  ...but off-target      : {stats.get('hit_off_target', 0):5d}")
    print(f"nothing attached         : {stats.get('miss', 0):5d}  ({stats.get('miss', 0) / total:6.1%})")
    print()
    print("why nothing was attached:")
    for reason, count in sorted(result["miss_reasons"].items(), key=lambda kv: -kv[1]):
        print(f"  {reason:52s} {count:5d}  ({count / total:6.1%})")
    print()
    print("which query in the ladder hit:")
    for step, count in sorted(result["hit_at_step"].items()):
        print(f"  query #{step + 1:<3d}                       {count:5d}")
    print()
    print("rule layer (unchanged, for context):")
    print(f"  recognised nothing, defaulted   {stats.get('rules_defaulted', 0):5d}"
          f"  ({stats.get('rules_defaulted', 0) / total:6.1%})")
    for tier in ("EMERGENT", "URGENT", "SELF_CARE"):
        key = f"rule_tier_{tier}"
        print(f"  {tier:31s} {stats.get(key, 0):5d}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="baseline")
    parser.add_argument("--dump", default=None)
    args = parser.parse_args()

    cases = build()
    cache = load_cache()

    queries: set[str] = set()
    for case in cases:
        queries.update(search_terms.candidate_queries(case["description"]))

    await warm_cache(queries, cache)

    result = evaluate(cases, cache)
    report(result, len(cases), args.label)

    if args.dump:
        Path(args.dump).write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"\nfull detail written to {args.dump}")


if __name__ == "__main__":
    asyncio.run(main())
