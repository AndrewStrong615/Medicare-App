import { Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "ProviderDetail">;

function formatDistance(miles: number | null): string | null {
  if (miles === null) return null;
  return miles < 10 ? `~${miles.toFixed(1)} mi away` : `~${Math.round(miles)} mi away`;
}

export function ProviderDetailScreen({ navigation, route }: Props) {
  const { provider, intake } = route.params;
  const distance = formatDistance(provider.distanceMiles);

  return (
    <Screen wide>
      <PageHeader title={provider.name} subtitle={provider.specialty ?? undefined} />

      <View style={styles.card}>
        {provider.address && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Address</Text>
            <Text style={styles.fieldValue}>{provider.address}</Text>
            {distance && <Text style={styles.fieldNote}>{distance}</Text>}
          </View>
        )}
        {provider.phone && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <Text style={styles.fieldValue}>{provider.phone}</Text>
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>NPI</Text>
          <Text style={styles.fieldValue}>{provider.npi}</Text>
        </View>
      </View>

      {/*
        The honest availability panel.

        This is the screen where a booking product would list "9:00, 9:20,
        9:40". MedHelp has no source for those times: the directory publishes
        none, and no scheduling partner is connected. Rendering plausible slots
        would be inventing them, and someone would turn up at a clinic for an
        appointment that does not exist.

        So the screen says what it knows and what it does not. It is driven off
        nothing — there is no flag to get wrong here, because there is no code
        path in this app that can produce a slot.
      */}
      <View style={styles.availability}>
        <Text style={styles.availabilityHeading}>Available times</Text>
        <Text style={styles.availabilityBody}>
          MedHelp can't see this provider's calendar, so it can't show
          appointment times or book one for you. No app can, unless the
          provider has connected their scheduling system to it — and none has
          here.
        </Text>
        <Text style={styles.availabilityBody}>
          What you can do is record the visit you want below. MedHelp keeps the
          details together and reminds you what you were going to ask about;
          you then call the provider to fix a time.
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Request this appointment"
          onPress={() =>
            navigation.navigate("AppointmentRequest", { provider, intake })
          }
          accessibilityHint="Opens a form to record the visit you want. Nothing is sent to the provider."
        />
        {provider.phone && (
          /*
            The call button is the one thing on this screen that actually
            reaches the clinic, so it is a real action rather than a printed
            number. It dials — it does not hand the user off to a maps app, a
            booking site, or an ad.
          */
          <AppButton
            label={`Call ${provider.phone}`}
            variant="secondary"
            onPress={() => {
              Linking.openURL(
                `tel:${provider.phone?.replace(/[^\d+]/g, "") ?? ""}`
              ).catch(() => {
                // Nothing to recover: the number is displayed above and can
                // be dialled by hand.
              });
            }}
            accessibilityHint="Calls the provider to arrange a time"
          />
        )}
      </View>

      <Text style={styles.sourceNote}>
        Listing from the {provider.sourceName}. MedHelp does not rank or
        recommend providers. Please confirm with the provider that they are
        accepting patients and that your insurance is accepted.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...elevation.sm,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  fieldNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  availability: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    // The rail marks this as the same kind of "read this" block as the care
    // guidance and escalation panels elsewhere in the app.
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  availabilityHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  availabilityBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.md,
  },
  sourceNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
