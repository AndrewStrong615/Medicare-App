import { createContext, useContext, type ReactNode } from "react";

import { domains, type Domain, type DomainName } from "@/theme";

/**
 * Which part of MedHelp the current screen belongs to.
 *
 * ## Why a context rather than a prop on every component
 *
 * The colour of a destination has to reach a lot of small, deep things — the
 * filled button at the foot of a form, the tile behind an icon, the label
 * above a title, the meter down the edge of the page. Threading a `domain`
 * prop through every one of those would mean that forgetting it anywhere
 * produced a screen in two colours, which is worse than a screen in one.
 *
 * So the domain is set once, as high as possible:
 *
 * - `AppNav` sets it for the five tab roots, from the tab that is current.
 * - A screen pushed on top of one of those sets it on its own `Screen`, e.g.
 *   the medication form passes `domain="medications"`.
 *
 * Anything that does not set it reads `today`, which is the first stop on the
 * ramp and the value `colors.accent` already holds — so an unconverted screen
 * looks exactly as it did rather than looking broken.
 *
 * ## ⛔ What a domain colour may not encode
 *
 * A place. Never a state, never a severity, never a fact about the person's
 * health — see the fence on `domains` in `theme.ts`. If you find yourself
 * choosing between two domains based on what the *data* says rather than on
 * which screen this is, that is the rule you are about to break.
 */
const DomainContext = createContext<Domain>(domains.today);

export function DomainProvider({
  domain,
  children,
}: {
  domain: DomainName;
  children: ReactNode;
}) {
  return (
    <DomainContext.Provider value={domains[domain]}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): Domain {
  return useContext(DomainContext);
}
