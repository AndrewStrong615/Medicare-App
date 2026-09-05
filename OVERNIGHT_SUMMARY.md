# Overnight cycle — 2026-08-29

Branch: `overnight-2026-08-28`. Not merged, not deployed.

One of three proposals shipped. The other two were rejected at the manager
gate, both for the same reason, and that reason is the main thing on this page
worth your attention.

---

## What was proposed

The researcher read the intake code and proposed three small items.

1. **Unit tests for `mobile/src/services/intakeService.ts`.** The only frontend
   service with no test file. Every screen test mocks it wholesale, so none of
   its own logic was exercised by the 88-test suite — including the guard that
   refuses to render a result missing its disclaimer or escalation guidance.
2. **Fix the "This doesn't seem right" feedback path.** Two real defects:
   `report()` sets the "Thanks — that's been noted for review" state
   unconditionally, but only sends anything when `assessment.id` is non-null,
   which it is *not* on the default path (storage consent defaults to off). And
   `reportAssessmentWrong` has no `try`/`catch` and is called with `void`, so an
   offline tap becomes an unhandled promise rejection.
3. **Follow-up screen accessibility and offline retry.** Choice buttons convey
   selection only through a hint a screen-reader user can disable; the submit
   button never passes `loading`; and the catch block discards
   `isNetworkError`, so `ErrorNotice` offers no retry on the one screen where
   the user has just typed three answers.

---

## What was approved, and what was rejected

### 1. intakeService tests — APPROVED, built, tested, committed

The manager approved it explicitly as a test-only addition that modifies no
production module, with three conditions: no production file may be edited, all
fixtures synthetic, and the comment explaining the `assertSecureBaseUrl` gap
must actually be written rather than promised.

All three held. Commit `95835bb`.

**Test results** — verified by the tester agent independently of the
implementer, not taken on trust:

| suite | before | after |
|---|---|---|
| frontend jest | 88 passed / 10 suites | **104 passed / 11 suites** |
| frontend `tsc --noEmit` | clean | **clean** |
| backend pytest | 254 passed | **254 passed** |

`git diff --stat HEAD` was empty apart from the new file — no production code
moved.

The tester also checked the tests were substantively right rather than merely
green. The ordering test genuinely proves branch order: it sends a
`needs_detail` body with no `tier` key, which would trip the assessed-branch
guard and throw if the two guards were ever swapped.

### 2. Feedback path fix — REJECTED

> "Emergency-routing behaviour — ... the EMERGENT screen's content and
> ordering." CLAUDE.md, automatic-rejection list, item 3.

The report control renders at two call sites, and one of them is inside the
EMERGENT screen's collapsed details block. The plan proposed replacing its
single string with three states. The manager rejected it, citing the rule's own
words — that a plan promising to be careful is still rejected, and that no
threshold of triviality applies.

The plan was otherwise sound: it kept the change inside the collapsed block,
listed the EMERGENT invariants it would not move, proposed a pure-refactor step
committed separately so the EMERGENT diff would be trivially reviewable, and
surfaced rather than decided the product question underneath.

### 3. Follow-up accessibility — REJECTED

Same rule. The fix needs an additive optional prop on `AppButton`, and
`AppButton` is the component behind the "Call 911" button in `EmergencyCallBar`
and the "Find the nearest emergency room" button on the EMERGENT screen. The
manager judged that modifying it at all crosses the line, regardless of the
change being purely additive and guarded by regression tests written against
the unmodified component first.

The manager also caught a genuine error in the plan, independent of the
rejection: it proposed new test files at
`mobile/src/components/__tests__/` and `mobile/src/screens/intake/__tests__/`,
following CLAUDE.md's stated "adjacent to the feature" convention. The repo's
actual convention is a single top-level `mobile/__tests__/`, and
`IntakeFollowUpScreen.test.tsx` already exists there. The plan would have
fragmented coverage of a screen that already has a canonical test file.

---

## Needs your judgment

**1. Is the gate drawn in the right place?** Two of three items were rejected,
and neither was reckless. Both were blocked by reaching a *shared component or
screen* that emergency routing also touches — not by changing emergency
behaviour. As written, the rule means:

- No accessibility, styling, or state work on `AppButton` can ever ship through
  this pipeline, because the 911 button uses it.
- No change to any part of `IntakeResultScreen`'s EMERGENT branch, including
  the collapsed details block that is not emergency content.

That may be exactly what you want — it is what "no exceptions" means, and the
manager applied it correctly. But if the pipeline is meant to do useful
unattended work, one of two things has to give. The manager named the choice
itself: either accept that these areas are human-only and route them out of the
pipeline, or **decouple the emergency call sites from the shared component** so
ordinary UI work stops implicating the rule. The second is the durable fix, and
it is itself a change to emergency-adjacent code, so it needs you.

**2. The feedback bug is real and still shipping.** Proposal 2 was rejected, not
disproved. Today, a user who taps "This doesn't seem right" on the default path
is told their report was noted, and nothing is sent or recorded. CLAUDE.md's
blocking sign-off says the classifier "has no validated error profile" and needs
a corpus of real classifications — this is the mechanism meant to collect that
signal, and on the default path it collects nothing while saying otherwise.
The unhandled promise rejection on an offline tap is also still there. Both need
a human-approved fix.

**3. A product decision the architect refused to invent.** When storage consent
is off there is no server-side record to attach a report to. Either offer to
save the assessment retroactively (needs the description threaded through
navigation params, a backend endpoint, and a retroactive-consent schema
decision — a feature, not a bug fix), or tell the user plainly that the result
was not saved so there is nothing to file against. The architect recommended the
second and noted it is much the smaller. Your call.

**4. Two items the researcher found but did not propose.** Neither is urgent.
`useSpeechToText` — the app's only hook, with four failure branches — has no
tests. And `followup.missing_answers` is defined and unit-tested but never
called by the API: completeness is enforced client-side only, so a non-mobile
client can submit blank answers. Whether the server should enforce it too is a
design question, not a bug.

---

## Process notes

- **The named subagents could not be used for the first half of this cycle.**
  They were created during this session, and the agent roster is fixed when a
  session starts, so `researcher` and the first `architect` runs were executed
  by general-purpose agents seeded from the role files in `.claude/agents/`.
  The `manager`, `implementer`, and `tester` steps used the real named agents.
  Behaviour was equivalent; the difference is that a general-purpose agent has
  the full tool set, so the role's tool restrictions were instructional rather
  than enforced. Every no-code role was verified after the fact to have written
  nothing — `git status` was clean before the implementer ran.
- **A session rate limit interrupted two of the three architect runs**; both
  were re-run to completion.
- `tester` keeps `Write`/`Edit` rather than the `Read, Bash` pair originally
  sketched, because writing test files is its job. Flagged rather than silently
  changed.

---

## Commits on this branch

```
95835bb  Test intakeService, including the safety-copy guard
6c0a74c  Add the researcher/architect/manager/implementer pipeline
37e223b  Give intake results substance, and trim the emergency screen
```

The first two commits predate this cycle — they are the intake rework and the
pipeline setup from the same session, committed onto this branch to get them off
`main`. Only `95835bb` came out of the cycle itself.
