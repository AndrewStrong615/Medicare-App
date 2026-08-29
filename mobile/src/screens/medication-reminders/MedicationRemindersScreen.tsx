import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";

/**
 * Navigation stub only. This screen manages the user's own reminder data
 * (not symptom/condition info), so it doesn't require DisclaimerBanner —
 * but if it ever surfaces dosage suggestions or drug interaction content,
 * route that change through compliance-reviewer first (see CLAUDE.md).
 */
export function MedicationRemindersScreen() {
  return (
    <Screen>
      <EmptyState
        title="No reminders yet"
        description="This is where your medication reminders will live once you can add them. The feature is still being built — nothing you enter would be saved yet."
      />
    </Screen>
  );
}
