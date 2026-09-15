/**
 * ⛔ Mutation pass over the CLIENT's stated safety properties.
 *
 *     cd mobile
 *     node scripts/mutation_check.mjs
 *     node scripts/mutation_check.mjs emergency-card
 *
 * The backend has `backend/scripts/mutation_check.py`; this is the same idea
 * on this side of the wire, and for the same reason. Four times in one sitting
 * this repository had a test that was green for a reason unrelated to what it
 * claimed, and two of those were here:
 *
 *   - the goals screen's ticks asserted `accessibilityState`, which is on the
 *     element in jsdom whether or not anything reaches the DOM — so a ticked
 *     row and an unticked one announced identically under a green suite
 *   - the source disclosure had the same defect, found by opening a browser
 *
 * A passing suite is evidence about the tests, not about the code. Each entry
 * below breaks a rule CLAUDE.md states in as many words and checks the suite
 * notices. A mutation that SURVIVES is a rule nothing is actually testing.
 *
 * ⛔ IT NEVER EDITS THE WORKING TREE. Everything is copied to a scratch
 * directory first and the suite runs there. The scratch lives under `mobile/`
 * rather than the system temp directory for one reason: jest resolves
 * `node_modules` by walking up from `rootDir`, and `mobile/node_modules` is
 * where it has to land. It is removed afterwards, including on a crash.
 *
 * ⛔ A SURVIVOR IS NOT FIXED BY DELETING THE MUTATION. Fix the test.
 *
 * ⛔ BUT CHECK THE MUTATION ACTUALLY CHANGES BEHAVIOUR FIRST. One that edits
 * the source without changing what it does reports SURVIVED and is
 * indistinguishable here from a rule nothing tests. It has happened on the
 * backend side: `db.query(...).delete()` rewritten as `_unused = db.query(...)`
 * still calls `.delete()` on the same chain, and read as a missing test for a
 * cascade that was working. The anchor count catches a mutation that could not
 * be applied; nothing catches one that applied and meant nothing.
 *
 * Not part of `npm test`: it runs the suite once per mutation.
 */

import { cpSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MOBILE = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = join(MOBILE, ".mutation-scratch");

const GOALS = "src/screens/goals/HealthGoalsScreen.tsx";
const CARD = "src/screens/emergency/EmergencyCardScreen.tsx";
const TOKEN = "src/services/tokenStorage.web.ts";
const CARD_STORE = "src/services/emergencyCard.ts";
const NOTIFY = "src/services/notificationService.web.ts";

/**
 * Each entry: the rule, in CLAUDE.md's own words, and the smallest edit that
 * breaks it.
 */
const MUTATIONS = [
  {
    group: "emergency-card",
    // "⛔ An empty field renders as 'Not provided', never as a missing row" —
    // called "the single most important rule on the screen", because a card
    // with no allergies row reads as *no allergies*.
    label: "an empty field renders as a blank instead of \"Not provided\"",
    file: CARD,
    find: "        {provided ? value : NOT_PROVIDED}",
    replace: "        {provided ? value : \"\"}",
    tests: ["__tests__/EmergencyCardScreen.test.tsx"],
  },
  {
    group: "session",
    // "⛔ Do not move the browser's copy to localStorage." CLAUDE.md says
    // both halves are "asserted by tests so that 'fixing the inconsistency'
    // in either direction fails the suite". This checks that claim.
    label: "the session token moves from sessionStorage to localStorage",
    file: TOKEN,
    find: "    return window.sessionStorage ?? null;",
    replace: "    return window.localStorage ?? null;",
    tests: ["__tests__/tokenStorageWeb.test.ts"],
  },
  {
    group: "goals",
    // "⛔ This is not an adherence record... No streaks, no percentages, no
    // '3 of 4 done' tiles."
    label: "the goals screen counts how many rows are done today",
    file: GOALS,
    find: "              {goal.activities.map((activity) => (",
    replace:
      "              <Text>{`${goal.activities.filter((a) => a.completedToday).length}" +
      " of ${goal.activities.length} done today`}</Text>}\n" +
      "              {goal.activities.map((activity) => (",
    tests: ["__tests__/GoalScreens.test.tsx"],
  },
  {
    group: "goals",
    // The accessibility rule this session established: state must be in the
    // label, because `accessibilityState` reaches nothing on web.
    label: "the tick's label stops saying whether it is ticked",
    file: GOALS,
    find:
      "                  accessibilityLabel={\n" +
      "                    `${activity.text}, ` +\n" +
      "                    (activity.completedToday ? \"ticked off for today\" : \"not ticked off\")\n" +
      "                  }",
    replace: "                  accessibilityLabel={activity.text}",
    tests: ["__tests__/GoalScreens.test.tsx", "__tests__/accessibleState.test.ts"],
  },
  {
    group: "goals",
    label: "the source disclosure's label stops saying whether it is open",
    file: GOALS,
    find:
      "                      accessibilityLabel={\n" +
      "                        openSources.has(activity.id)\n" +
      "                          ? `Hide where this kind of activity comes from: ${activity.text}`\n" +
      "                          : `Show where this kind of activity comes from: ${activity.text}`\n" +
      "                      }",
    replace:
      "                      accessibilityLabel={`Where this comes from: ${activity.text}`}",
    tests: ["__tests__/GoalScreens.test.tsx", "__tests__/accessibleState.test.ts"],
  },
  {
    group: "goals",
    // "⛔ Folded, not dropped": closed, nothing readable as an endorsement.
    label: "the citation renders even when the disclosure is closed",
    file: GOALS,
    find: "                    {openSources.has(activity.id) && (",
    replace: "                    {true && (",
    tests: ["__tests__/GoalScreens.test.tsx"],
  },
  {
    group: "no-network",
    // "There is no endpoint, no table, and no `fetch` on this path — a
    // test asserts it." The card is the most sensitive thing this app
    // holds and the one thing that has to work with no signal at all.
    label: "the emergency card is posted to a server when it is saved",
    file: CARD_STORE,
    find: "export async function saveCard(card: EmergencyCard): Promise<EmergencyCard> {",
    replace:
      "export async function saveCard(card: EmergencyCard): Promise<EmergencyCard> {" +
      "\n  await fetch('/emergency-card', { method: 'POST', body: JSON.stringify(card) });",
    tests: ["__tests__/emergencyCard.test.ts", "__tests__/EmergencyCardScreen.test.tsx"],
  },
  {
    group: "no-network",
    // "Nothing about a reminder leaves the device. Both services make no
    // network call; a test asserts `fetch` is never called when one fires."
    // A payload naming a person's medication is exactly what would make a
    // push vendor a processor of PHI.
    label: "a fired reminder phones home with the medication name",
    file: NOTIFY,
    find: '    new window.Notification("Time to take your medication", {',
    replace:
      "    void fetch('/telemetry', { method: 'POST', body: reminder.medicationName });" +
      '\n    new window.Notification("Time to take your medication", {',
    tests: ["__tests__/notificationServiceWeb.test.ts"],
  },
];

function copyTree() {
  rmSync(SCRATCH, { recursive: true, force: true });
  // Everything jest needs, and nothing it does not. node_modules is left out
  // deliberately: resolution walks up from the scratch dir into mobile/.
  for (const entry of ["src", "__tests__", "jest.setup.js", "package.json", "tsconfig.json", "babel.config.js", "assets", "app.json"]) {
    const from = join(MOBILE, entry);
    if (existsSync(from)) cpSync(from, join(SCRATCH, entry), { recursive: true });
  }
}

function survives({ file, find, replace, tests }) {
  copyTree();
  const target = join(SCRATCH, file);
  const source = readFileSync(target, "utf8").split("\r\n").join("\n");
  const hits = source.split(find).length - 1;
  if (hits !== 1) {
    // Not a survivor: a mutation that could not be applied proves nothing
    // about the tests, and saying so is the entire point.
    return `the anchor text appears ${hits} times, not once`;
  }
  writeFileSync(target, source.replace(find, replace), "utf8");

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["jest", "--rootDir", SCRATCH, "--silent", ...tests],
    { cwd: MOBILE, encoding: "utf8" }
  );
  return result.status === 0 ? "the suite stayed green" : null;
}

const wanted = process.argv[2];
const survivors = [];

try {
  console.log("mutation".padEnd(62) + "result".padStart(10));
  console.log("-".repeat(72));
  for (const mutation of MUTATIONS) {
    if (wanted && mutation.group !== wanted) continue;
    const reason = survives(mutation);
    console.log(mutation.label.padEnd(62) + (reason ? "SURVIVED" : "caught").padStart(10));
    if (reason) survivors.push([mutation.label, reason]);
  }
} finally {
  rmSync(SCRATCH, { recursive: true, force: true });
}

console.log();
if (survivors.length) {
  console.log("RULES NOTHING IS ACTUALLY TESTING:");
  for (const [label, why] of survivors) console.log(`   - ${label}  (${why})`);
  process.exit(1);
}
console.log("Every mutation was caught.");
