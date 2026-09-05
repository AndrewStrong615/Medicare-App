"""
A small in-process rate limiter, for the endpoints where unlimited retries are
themselves the vulnerability.

## What this is for

`POST /auth/login` had no limit of any kind. An 8-character minimum password
guessed at network speed is guessed; the only thing standing between an
attacker and every account was bcrypt's cost factor, and bcrypt is a speed
bump, not a lock. `POST /auth/signup` had no limit either, so the API could be
used to farm accounts or to probe which addresses are registered.
`POST /intake/assess` can call a paid model API, which makes an unlimited
endpoint a bill as well as a load.

## What it is NOT

State the limits plainly, because a rate limiter that is trusted further than
it goes is worse than none:

* **Per process.** Two uvicorn workers mean two independent counters, so the
  effective limit is the configured one times the worker count. Fine for the
  single-process way this app is run today; wrong the moment it is scaled.
* **In memory.** A restart clears it.
* **Keyed on the socket address**, and `X-Forwarded-For` is deliberately NOT
  trusted. A client can put anything in that header, so honouring it would let
  an attacker reset their own counter on every request — the header is only
  usable behind a proxy you control that overwrites it, and there is no such
  proxy here. The cost is that everyone behind one NAT shares a bucket.
* **Not a defence against a distributed attacker.** It raises the cost of
  guessing from one address. That is all.

The real controls for this belong at a reverse proxy or WAF in front of the
app. This is the floor underneath them, so the app is not naked without one.
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

# Stop the bucket map from growing without bound under a spray of addresses.
# Entries are evicted oldest-idle-first once this is exceeded.
MAX_TRACKED_CLIENTS = 20_000


class RateLimiter:
    """
    A sliding-window counter: at most `max_attempts` hits per `window_seconds`
    from one client, per named limiter.
    """

    def __init__(self, *, max_attempts: int, window_seconds: int, name: str) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.name = name
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, hits: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()

    def check(self, client_key: str) -> int | None:
        """
        Record a hit. Returns None if allowed, or the seconds to wait if not.

        A blocked request does NOT extend the window — otherwise a client that
        keeps hammering can never come back, which turns a brute-force defence
        into a way to lock a legitimate user out permanently.
        """
        now = time.monotonic()
        with self._lock:
            hits = self._hits.get(client_key)
            if hits is None:
                if len(self._hits) >= MAX_TRACKED_CLIENTS:
                    self._evict_locked(now)
                hits = self._hits.setdefault(client_key, deque())

            self._prune(hits, now)

            if len(hits) >= self.max_attempts:
                retry_after = int(self.window_seconds - (now - hits[0])) + 1
                return max(retry_after, 1)

            hits.append(now)
            return None

    def reset(self, client_key: str) -> None:
        """Forget a client's hits — called after a successful sign-in, so a
        person who mistyped their password a few times is not still counted
        against once they get it right."""
        with self._lock:
            self._hits.pop(client_key, None)

    def clear(self) -> None:
        """Drop all state. Used by tests to keep them independent."""
        with self._lock:
            self._hits.clear()

    def _evict_locked(self, now: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - self.window_seconds]:
            del self._hits[key]
        if len(self._hits) >= MAX_TRACKED_CLIENTS:
            # Still full of live buckets: drop the least recently active half
            # rather than refusing to track anything new.
            ordered = sorted(self._hits.items(), key=lambda item: item[1][-1])
            for key, _ in ordered[: len(ordered) // 2]:
                del self._hits[key]


def client_key(request: Request) -> str:
    """
    The address a request actually arrived from.

    `request.client` is None for some ASGI transports (and in some test
    setups), and a single shared bucket is the safe answer there — it limits
    more than intended rather than less.
    """
    client = request.client
    return client.host if client and client.host else "unknown"


def enforce(limiter: RateLimiter, request: Request) -> None:
    """Raise 429 if this client has spent its budget on `limiter`."""
    retry_after = limiter.check(client_key(request))
    if retry_after is None:
        return

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Please wait a moment and try again.",
        headers={"Retry-After": str(retry_after)},
    )
