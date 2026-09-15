/**
 * ⛔ `accessibilityState` REACHES NOTHING ON WEB. SAY THE STATE IN THE LABEL.
 *
 * React Native Web 0.19.13 never reads `accessibilityState`: it is absent from
 * `forwardedProps` and from `createDOMProps`, which take `aria-checked`,
 * `aria-expanded` and `aria-selected` instead. The only readers anywhere in
 * the library are the legacy `TouchableWithoutFeedback` and `isDisabled`, so
 * on a `Pressable` it is dropped and the DOM carries no state attribute at
 * all.
 *
 * That cost this app three real bugs, every one of which shipped under a green
 * suite and was found only by opening a browser:
 *
 *   - the goal editor's day chips (fixed 2026-09-12)
 *   - the goals screen's source disclosure, and its ticks (fixed 2026-09-13)
 *
 * ⛔ A RENDERING TEST CANNOT CATCH THE NEXT ONE. In jsdom the prop is present
 * on the element whether or not anything reaches the DOM, which is precisely
 * why the ticks' own test passed while a reader was told nothing. So this
 * reads the source and asks one question of every call site: does the label
 * also say which state it is in?
 *
 * ⛔ IF THIS FAILS, DO NOT ADD YOUR FILE TO `EXEMPT`. Put the state in the
 * `accessibilityLabel` and keep `accessibilityState` beside it — that is what
 * every fixed call site does, and it is the only thing that works on both
 * platforms. `EXEMPT` is for call sites where the state genuinely does reach
 * the DOM by another route, and each entry has to say which.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SOURCE = join(__dirname, "..", "src");

/**
 * Call sites where `accessibilityState` is not load-bearing, with the reason.
 *
 * Both are the same one: React Native Web's `Pressable` and `TextInput` derive
 * the DOM state from the `disabled` and `editable` PROPS, which these pass. So
 * the state does reach a reader — just not by the route the
 * `accessibilityState` line beside it implies.
 */
const EXEMPT: Record<string, string> = {
  "components/AppButton.tsx":
    "passes disabled={isInactive}; RNW's Pressable sets aria-disabled from that prop, not from accessibilityState",
  "components/TextField.tsx":
    "passes editable={editable}; RNW's TextInput derives the DOM state from that prop, not from accessibilityState",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Each element's own props, as one region of source.
 *
 * ⛔ Anchored on `accessibilityRole`, which appears exactly once per call
 * site, so a region can never straddle two elements. Two cruder attempts
 * failed here and both reported already-fixed call sites: slicing to the next
 * ">" truncates on `=>` and on the comments these sites carry, and a plain
 * character window reaches backwards into the PREVIOUS element and finds its
 * label instead of this one.
 */
function propRegions(text: string): string[] {
  const anchors: number[] = [];
  let at = text.indexOf("accessibilityRole");
  while (at !== -1) {
    anchors.push(at);
    at = text.indexOf("accessibilityRole", at + 1);
  }
  return anchors.map((from, index) => {
    // A call site with no role after it still ends somewhere; 2000 characters
    // is past the longest props block in this app, comments included.
    const to = index + 1 < anchors.length ? anchors[index + 1] : from + 2000;
    return text.slice(from, to);
  });
}

/**
 * Whether the label in this region can differ between the two states.
 *
 * A label only helps if it VARIES, so the test is for a conditional in it.
 * `accessibilityLabel="Delete"` and `accessibilityLabel={tab.name}` both
 * fail, which is right: neither can say which state the control is in.
 */
function labelVariesWithState(region: string): boolean {
  const opener = region.indexOf("accessibilityLabel={");
  if (opener === -1) return false;
  const start = opener + "accessibilityLabel=".length;
  let depth = 0;
  for (let at = start; at < region.length; at += 1) {
    if (region[at] === "{") depth += 1;
    else if (region[at] === "}") {
      depth -= 1;
      if (depth === 0) return region.slice(start, at + 1).includes("?");
    }
  }
  return false;
}

describe("⛔ accessible state is said in words, not left to accessibilityState", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SOURCE)) {
    const text = readFileSync(file, "utf8");
    const relative = file.slice(SOURCE.length + 1).split("\\").join("/");
    if (relative in EXEMPT) continue;
    for (const region of propRegions(text)) {
      if (region.includes("accessibilityState") && !labelVariesWithState(region)) {
        offenders.push(relative);
      }
    }
  }

  it("every accessibilityState call site also varies its label", () => {
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it("the exemptions each name why the state still reaches the DOM", () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      // A reason, not a shrug — an exemption without one is how a list like
      // this becomes the place bugs go to be forgotten.
      expect(reason.length).toBeGreaterThan(40);
      expect(reason).toMatch(/prop/);
      expect(readFileSync(join(SOURCE, file), "utf8")).toContain("accessibilityState");
    }
  });

  it("catches a call site whose label cannot vary", () => {
    // The bug as it actually looked, so a future refactor of the detector
    // above has something concrete to fail on.
    const broken = `
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={activity.text}
    `;
    const fixed = `
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={\`\${activity.text}, \${done ? "ticked off" : "not ticked off"}\`}
    `;
    expect(labelVariesWithState(broken)).toBe(false);
    expect(labelVariesWithState(fixed)).toBe(true);
  });
});
