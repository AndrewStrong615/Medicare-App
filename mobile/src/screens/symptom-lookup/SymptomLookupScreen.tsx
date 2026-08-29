import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";

/**
 * Navigation stub only — no symptom/condition content yet. When this is
 * built out, run it past the compliance-reviewer subagent (see CLAUDE.md)
 * and keep DisclaimerBanner visible on this screen at all times.
 */
export function SymptomLookupScreen() {
  return (
    <Screen>
      {/*
        Kept above the content so it is read before any symptom information,
        rather than being scrolled past. Required by CLAUDE.md — do not remove.
      */}
      <DisclaimerBanner />
      <EmptyState
        title="Symptom lookup isn't ready yet"
        description="This is where you'll be able to search general information about common symptoms. It's still being built, so there's nothing to search yet. In the meantime, medication reminders are on the home screen."
      />
    </Screen>
  );
}
