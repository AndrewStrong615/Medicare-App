import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import {
  ApiError,
  deleteAppointment,
  listAppointments,
  updateAppointment,
  type Appointment,
} from "@/services/appointmentService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AppointmentList">;

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Not yet arranged",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function AppointmentCard({
  appointment,
  onMarkScheduled,
  onDelete,
  busy,
}: {
  appointment: Appointment;
  onMarkScheduled: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const isRequested = appointment.status === "REQUESTED";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{appointment.providerName}</Text>
        <View
          style={[styles.badge, isRequested ? styles.badgeRequested : styles.badgeSet]}
        >
          <Text
            style={[
              styles.badgeText,
              isRequested ? styles.badgeTextRequested : styles.badgeTextSet,
            ]}
          >
            {STATUS_LABELS[appointment.status] ?? appointment.status}
          </Text>
        </View>
      </View>

      {appointment.providerSpecialty && (
        <Text style={styles.cardMeta}>{appointment.providerSpecialty}</Text>
      )}
      {appointment.reasonForVisit && (
        <Text style={styles.cardReason}>{appointment.reasonForVisit}</Text>
      )}
      {appointment.preferredTime && (
        <Text style={styles.cardMeta}>Preferred: {appointment.preferredTime}</Text>
      )}

      {/*
        Repeated per card, not just once on the screen. A list is skimmed, and
        the one thing a user must not misread is whether the clinic knows.
      */}
      {isRequested && (
        <Text style={styles.cardWarning}>
          {appointment.providerPhone
            ? `Not arranged yet — call ${appointment.providerPhone} to fix a time.`
            : "Not arranged yet — call the provider to fix a time."}
        </Text>
      )}

      <View style={styles.cardActions}>
        {isRequested && (
          <AppButton
            label="Mark as scheduled"
            variant="secondary"
            onPress={onMarkScheduled}
            disabled={busy}
            accessibilityHint="Records that you have arranged this appointment with the provider"
          />
        )}
        <AppButton
          label="Remove"
          variant="secondary"
          onPress={onDelete}
          disabled={busy}
        />
      </View>
    </View>
  );
}

export function AppointmentListScreen({ navigation }: Props) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAppointments(await listAppointments());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't load your appointments. Please try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Loads on mount and again on every return to this screen, so an
  // appointment saved through the booking flow is already here when the user
  // navigates back. `useFocusEffect` covers the mount too — a `useEffect`
  // beside it would just fire a duplicate request on first render.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const markScheduled = async (appointment: Appointment) => {
    setBusyId(appointment.id);
    setError(null);
    try {
      await updateAppointment(appointment.id, {
        status: "SCHEDULED",
        preferredTime: appointment.preferredTime,
        notes: appointment.notes,
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't update this appointment. Please try again in a moment."
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (appointment: Appointment) => {
    setBusyId(appointment.id);
    setError(null);
    try {
      await deleteAppointment(appointment.id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't remove this appointment. Please try again in a moment."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen wide>
      <AppButton
        label="Find a provider"
        onPress={() => navigation.navigate("ProviderSearch")}
      />

      {error && <ErrorNotice message={error} onRetry={() => void load()} />}

      {loading && appointments === null && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading your appointments…</Text>
        </View>
      )}

      {!loading && appointments !== null && appointments.length === 0 && (
        <EmptyState
          icon="calendar"
          title="No appointments yet"
          description={
            "Appointments you record appear here, with the reason for the " +
            "visit and the provider's number, so everything is in one place."
          }
        />
      )}

      {appointments?.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          appointment={appointment}
          busy={busyId === appointment.id}
          onMarkScheduled={() => void markScheduled(appointment)}
          onDelete={() => void remove(appointment)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeRequested: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
  },
  badgeSet: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  badgeText: {
    ...typography.captionStrong,
  },
  badgeTextRequested: {
    color: colors.noticeText,
  },
  badgeTextSet: {
    color: colors.successText,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardReason: {
    ...typography.body,
    color: colors.textPrimary,
  },
  cardWarning: {
    ...typography.caption,
    color: colors.noticeText,
  },
  cardActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
    // A hairline separates the record from the things you can do to it.
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
});
