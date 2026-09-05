import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { Screen } from "@/components/Screen";
import { getBookingCapability } from "@/services/appointmentService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AppointmentConfirmation">;

/**
 * What was saved, and — the part that matters — what still has to happen.
 *
 * The word "confirmed" appears nowhere on this screen, and neither does a
 * green tick standing on its own. Nothing has been confirmed: a row exists in
 * MedHelp and the clinic has never heard of it. The visual weight here goes on
 * the call-the-clinic step rather than on congratulating the user for
 * finishing a form.
 */
export function AppointmentConfirmationScreen({ navigation, route }: Props) {
  const { appointment } = route.params;

  // Defensive: the server sets this false on every row it can currently
  // produce. If a future booking channel ever makes it true, this screen
  // changes its story rather than continuing to under-promise.
  const notified = appointment.providerNotified;

  // Asked, never assumed. Defaults to false, so a failed or slow check shows
  // the call-the-clinic path rather than an identity form that would fail.
  const [canBook, setCanBook] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const available = await getBookingCapability();
        if (active) setCanBook(available);
      } catch {
        // Staying false is the safe outcome; nothing to tell the user.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen wide>
      <View style={notified ? styles.savedBooked : styles.saved}>
        <Text style={notified ? styles.savedHeadingBooked : styles.savedHeading}>
          {notified ? "Appointment booked" : "Saved to your appointments"}
        </Text>
        <Text style={notified ? styles.savedBodyBooked : styles.savedBody}>
          {notified
            ? `${appointment.providerName} has received your request.`
            : `MedHelp has kept these details for you. ${appointment.providerName} has not been contacted — you still need to call to arrange a time.`}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Provider</Text>
          <Text style={styles.fieldValue}>{appointment.providerName}</Text>
          {appointment.providerAddress && (
            <Text style={styles.fieldNote}>{appointment.providerAddress}</Text>
          )}
        </View>

        {appointment.reasonForVisit && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Reason for visit</Text>
            <Text style={styles.fieldValue}>{appointment.reasonForVisit}</Text>
          </View>
        )}

        {appointment.preferredTime && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Preferred time</Text>
            <Text style={styles.fieldValue}>{appointment.preferredTime}</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Status</Text>
          <Text style={styles.fieldValue}>
            {appointment.status === "REQUESTED"
              ? "Requested — not yet arranged with the provider"
              : appointment.status}
          </Text>
        </View>
      </View>

      {/*
        The booking path's entry point, gated on the server's own answer.

        `canBook` is false today and this never renders, which is the point:
        the identity form behind it asks for a legal name, date of birth and
        home address, and there is currently nowhere to send them. Collecting
        that for no purpose would be worse than not having the screen.

        When a BAA-covered channel exists, `/appointments/capabilities` starts
        saying so and this appears — no component needs editing.
      */}
      {!notified && canBook && (
        <View style={styles.nextStep}>
          <Text style={styles.nextStepHeading}>Next step</Text>
          <Text style={styles.nextStepBody}>
            Send this request to {appointment.providerName}. They'll need a few
            details to identify you — MedHelp doesn't keep them.
          </Text>
          <AppButton
            label="Send request to provider"
            onPress={() =>
              navigation.navigate("BookingIdentity", {
                // An id, never the identity itself.
                appointmentId: appointment.id,
                providerName: appointment.providerName,
              })
            }
          />
        </View>
      )}

      {!notified && !canBook && appointment.providerPhone && (
        <View style={styles.nextStep}>
          <Text style={styles.nextStepHeading}>Next step</Text>
          <Text style={styles.nextStepBody}>
            Call {appointment.providerName} to arrange the time. Once you have
            one, mark this appointment as scheduled so it shows the right
            status.
          </Text>
          <AppButton
            label={`Call ${appointment.providerPhone}`}
            onPress={() => {
              Linking.openURL(
                `tel:${appointment.providerPhone?.replace(/[^\d+]/g, "") ?? ""}`
              ).catch(() => {});
            }}
            accessibilityHint="Calls the provider to arrange a time"
          />
        </View>
      )}

      <AppButton
        label="View my appointments"
        variant="secondary"
        onPress={() => navigation.replace("AppointmentList")}
      />
      <AppButton
        label="Back to home"
        variant="secondary"
        onPress={() => navigation.navigate("Home")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  saved: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  savedHeading: {
    ...typography.title,
    color: colors.noticeText,
  },
  savedBody: {
    ...typography.body,
    color: colors.noticeText,
  },
  savedBooked: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  savedHeadingBooked: {
    ...typography.title,
    color: colors.successText,
  },
  savedBodyBooked: {
    ...typography.body,
    color: colors.successText,
  },
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
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  fieldNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nextStep: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nextStepHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  nextStepBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
