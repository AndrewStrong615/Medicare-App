import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  ApiError,
  submitBooking,
  type BookingIdentity,
} from "@/services/appointmentService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "BookingIdentity">;

/**
 * Who is coming to the appointment — the details a scheduling API needs before
 * a clinic will hold a slot.
 *
 * ## This screen is unreachable today
 *
 * Nothing navigates here while `getBookingCapability()` returns false, which
 * it always does: there is no BAA-covered channel to send a booking to. The
 * screen exists so the path is built, reviewed and tested before the pressure
 * of a live integration, not so it can collect data now. Collecting a date of
 * birth and a home address with nowhere to send them would be strictly worse
 * than not having the screen.
 *
 * ## The identity lives here and nowhere else
 *
 * It is component state. It is never written to storage, never put in a
 * navigation param (route state is serialisable, and dev tooling persists it),
 * and never stored server-side — the backend passes it to the delivery layer
 * and drops it. The route param is an appointment **id**, deliberately: an id
 * is safe to serialise, a date of birth is not.
 *
 * The user retypes this each time they book. That is the trade.
 */

const SEXES: Array<{ value: BookingIdentity["sexAssignedAtBirth"]; label: string }> = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "INTERSEX", label: "Intersex" },
  { value: "UNSPECIFIED", label: "Prefer not to say" },
];

const PATIENT_TYPES: Array<{
  value: BookingIdentity["patientType"];
  label: string;
}> = [
  { value: "NEW", label: "I'm a new patient" },
  { value: "EXISTING", label: "I've been seen here before" },
];

function ChoiceRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function BookingIdentityScreen({ navigation, route }: Props) {
  const { appointmentId, providerName } = route.params;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState<BookingIdentity["sexAssignedAtBirth"]>("UNSPECIFIED");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [patientType, setPatientType] =
    useState<BookingIdentity["patientType"]>("NEW");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "Enter your first name.";
    if (!lastName.trim()) errors.lastName = "Enter your last name.";
    // Format only. Whether a date of birth is *correct* is between the user
    // and their clinic; this checks it is a date the API will accept.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
      errors.dateOfBirth = "Use the format YYYY-MM-DD.";
    }
    if (phone.replace(/\D/g, "").length < 10) {
      errors.phone = "Enter a 10-digit phone number.";
    }
    if (!email.includes("@")) errors.email = "Enter your email address.";
    if (!addressLine.trim()) errors.addressLine = "Enter your street address.";
    if (!city.trim()) errors.city = "Enter your city.";
    if (state.trim().length !== 2) errors.state = "Enter a 2-letter state code.";
    if (postalCode.replace(/\D/g, "").length < 5) {
      errors.postalCode = "Enter a 5-digit ZIP code.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setError(null);
    setSubmitting(true);

    try {
      const appointment = await submitBooking(appointmentId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        sexAssignedAtBirth: sex,
        phone: phone.trim(),
        email: email.trim(),
        addressLine: addressLine.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        postalCode: postalCode.trim(),
        patientType,
      });
      // `replace`, so back does not return to a form still holding a date of
      // birth in state.
      navigation.replace("AppointmentConfirmation", { appointment });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't send this request. Please call the provider to arrange a time."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        icon="calendar"
        title="Your details"
        subtitle={`${providerName} needs these to hold an appointment. They are sent with your request and are not saved by MedHelp — you'll be asked again next time you book.`}
      />

      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        error={fieldErrors.firstName}
        autoCapitalize="words"
        textContentType="givenName"
      />
      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        error={fieldErrors.lastName}
        autoCapitalize="words"
        textContentType="familyName"
      />
      <TextField
        label="Date of birth"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        error={fieldErrors.dateOfBirth}
        hint="YYYY-MM-DD"
        placeholder="1985-04-12"
        keyboardType="numbers-and-punctuation"
      />

      {/*
        Asked because booking APIs require it, and framed as what it is — the
        clinic's record field, not a question about the person's gender.
      */}
      <ChoiceRow
        label="Sex assigned at birth"
        options={SEXES}
        selected={sex}
        onSelect={setSex}
      />

      <TextField
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        error={fieldErrors.phone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Street address"
        value={addressLine}
        onChangeText={setAddressLine}
        error={fieldErrors.addressLine}
        autoCapitalize="words"
        textContentType="streetAddressLine1"
      />
      <TextField
        label="City"
        value={city}
        onChangeText={setCity}
        error={fieldErrors.city}
        autoCapitalize="words"
      />
      <TextField
        label="State"
        value={state}
        onChangeText={setState}
        error={fieldErrors.state}
        hint="2-letter code, e.g. NY"
        autoCapitalize="characters"
      />
      <TextField
        label="ZIP code"
        value={postalCode}
        onChangeText={setPostalCode}
        error={fieldErrors.postalCode}
        keyboardType="number-pad"
      />

      <ChoiceRow
        label="Have you been seen here before?"
        options={PATIENT_TYPES}
        selected={patientType}
        onSelect={setPatientType}
      />

      {error && <ErrorNotice message={error} />}

      <AppButton
        label="Send request to provider"
        onPress={() => void submit()}
        loading={submitting}
        disabled={submitting}
      />
      <AppButton
        label="Cancel"
        variant="secondary"
        onPress={() => navigation.goBack()}
        disabled={submitting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  chipTextSelected: {
    color: colors.textOnAccent,
    fontWeight: "600",
  },
});
