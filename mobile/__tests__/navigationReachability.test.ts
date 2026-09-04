/**
 * Every registered route is reachable from somewhere.
 *
 * ## Why this test exists
 *
 * Consolidating the home screen moved four destinations one tap deeper. The
 * failure mode of that kind of change is not a crash — it is a screen that is
 * still registered, still tested, still perfect, and that nothing navigates
 * to any more. Nobody notices, because everything passes.
 *
 * So this reads the navigator's registrations and the `navigate(...)` calls
 * across the app, and fails when a route has no way in. It is a coarse check
 * — string matching over source, not a graph walk — but it catches the exact
 * mistake a reshuffle makes.
 *
 * `ROOTS` are the routes that are entered without anyone navigating to them:
 * the two the navigator can open on, and the ones only ever reached with
 * `reset` after signing out. Adding to that list is how you declare a route
 * intentionally unreachable by `navigate`, and it should stay short.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SOURCE_ROOT = join(__dirname, "..", "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const ALL_SOURCE = sourceFiles(SOURCE_ROOT)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const NAVIGATOR = readFileSync(
  join(SOURCE_ROOT, "navigation", "RootNavigator.tsx"),
  "utf8"
);

/** Route names registered on the stack. */
function registeredRoutes(): string[] {
  return [...NAVIGATOR.matchAll(/<Stack\.Screen\s+name="([A-Za-z]+)"/g)].map(
    (match) => match[1]
  );
}

/** Route names any screen navigates, replaces, or resets to. */
function targetedRoutes(): Set<string> {
  const targets = new Set<string>();
  for (const pattern of [
    /navigation\.navigate\(\s*"([A-Za-z]+)"/g,
    /navigation\.replace\(\s*"([A-Za-z]+)"/g,
    /routes:\s*\[\s*\{\s*name:\s*"([A-Za-z]+)"/g,
  ]) {
    for (const match of ALL_SOURCE.matchAll(pattern)) targets.add(match[1]);
  }
  return targets;
}

/**
 * Entered without being navigated to.
 *
 * `Login` and `Home` are what `initialRouteName` chooses between, so the app
 * opens on one of them before anything navigates anywhere.
 */
const ROOTS = new Set(["Login", "Home"]);

describe("navigation reachability", () => {
  const routes = registeredRoutes();

  it("registers the routes this app is built from", () => {
    // A guard on the guard: if the regex above ever stops matching, every
    // other assertion in this file passes vacuously.
    expect(routes.length).toBeGreaterThanOrEqual(15);
    expect(routes).toContain("Home");
    expect(routes).toContain("More");
    expect(routes).toContain("EmergencyCard");
  });

  it("leaves no screen orphaned", () => {
    const targets = targetedRoutes();
    const orphans = routes.filter(
      (route) => !ROOTS.has(route) && !targets.has(route)
    );

    expect(orphans).toEqual([]);
  });

  it("navigates to nothing that is not registered", () => {
    // The other direction: a navigate to a route that was renamed or removed
    // is a dead end that only shows up when someone presses it.
    const registered = new Set(routes);
    const unknown = [...targetedRoutes()].filter((route) => !registered.has(route));

    expect(unknown).toEqual([]);
  });

  describe("the routes the consolidation moved", () => {
    it.each(["MedicationList", "MedicationReminders", "AppointmentList", "ProviderSearch"])(
      "%s is still reachable",
      (route) => {
        expect(targetedRoutes().has(route)).toBe(true);
      }
    );
  });

  it("preserves every route the intake-to-booking flow uses", () => {
    // The flow CLAUDE.md documents end to end. A reshuffle that renamed any
    // of these would break it silently.
    for (const route of [
      "SymptomIntake",
      "IntakeFollowUp",
      "IntakeResult",
      "ProviderSearch",
      "ProviderDetail",
      "AppointmentRequest",
      "AppointmentConfirmation",
      "AppointmentList",
    ]) {
      expect(routes).toContain(route);
    }
  });
});
