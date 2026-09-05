import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AppointmentConfirmationScreen } from "@/screens/appointments/AppointmentConfirmationScreen";
import { AppointmentListScreen } from "@/screens/appointments/AppointmentListScreen";
import { AppointmentRequestScreen } from "@/screens/appointments/AppointmentRequestScreen";
import { BookingIdentityScreen } from "@/screens/appointments/BookingIdentityScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { IntakeFollowUpScreen } from "@/screens/intake/IntakeFollowUpScreen";
import { IntakeResultScreen } from "@/screens/intake/IntakeResultScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { MedicationEditScreen } from "@/screens/medications/MedicationEditScreen";
import { MedicationListScreen } from "@/screens/medications/MedicationListScreen";
import { MedicationRemindersScreen } from "@/screens/medication-reminders/MedicationRemindersScreen";
import { MedicationScanScreen } from "@/screens/medications/MedicationScanScreen";
import { ReminderEditScreen } from "@/screens/medication-reminders/ReminderEditScreen";
import { ProviderDetailScreen } from "@/screens/appointments/ProviderDetailScreen";
import { ProviderSearchScreen } from "@/screens/appointments/ProviderSearchScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { SymptomIntakeScreen } from "@/screens/intake/SymptomIntakeScreen";
import { restoreSession } from "@/services/authService";
import { colors, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};

/**
 * "checking" is not a cosmetic state. `initialRouteName` is only read when
 * the navigator first mounts, so which screen the app opens on has to be
 * decided *before* anything renders — and the answer lives in storage, which
 * is asynchronous to read on both platforms. Rendering the sign-in screen
 * first and redirecting afterwards would show a signed-in user a login form
 * they never had to fill in, which is most of the annoyance this change
 * exists to remove.
 */
type SessionState = "checking" | "signed-in" | "signed-out";

export function RootNavigator() {
  const [session, setSession] = useState<SessionState>("checking");

  useEffect(() => {
    let active = true;

    restoreSession()
      .then((hasSession) => {
        if (active) setSession(hasSession ? "signed-in" : "signed-out");
      })
      .catch(() => {
        // restoreSession swallows its own storage failures, so this is only
        // reachable if something unforeseen throws. Either way the safe answer
        // is the sign-in screen, never a blank app.
        if (active) setSession("signed-out");
      });

    return () => {
      active = false;
    };
  }, []);

  if (session === "checking") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
          accessibilityLabel="Opening MedHelp"
        />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName={session === "signed-in" ? "Home" : "Login"}
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: {
            ...typography.titleSmall,
            color: colors.textPrimary,
          },
          headerTintColor: colors.accent,
          // The screens draw their own cards with their own borders; a header
          // hairline on top of that reads as a stray line rather than as
          // structure.
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/*
          The auth screens carry their own on-page headings, so a navigation
          header would just repeat the title back to the user.
        */}
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="SymptomIntake"
          component={SymptomIntakeScreen}
          options={{ title: "Check my symptoms" }}
        />
        <Stack.Screen
          name="IntakeFollowUp"
          component={IntakeFollowUpScreen}
          options={{ title: "A few more details" }}
        />
        <Stack.Screen
          name="IntakeResult"
          component={IntakeResultScreen}
          options={{ title: "What to do next" }}
        />
        <Stack.Screen
          name="MedicationList"
          component={MedicationListScreen}
          options={{ title: "My Medications" }}
        />
        <Stack.Screen
          name="MedicationScan"
          component={MedicationScanScreen}
          options={{ title: "Scan a label" }}
        />
        <Stack.Screen
          name="MedicationEdit"
          component={MedicationEditScreen}
          options={{ title: "Medication" }}
        />
        <Stack.Screen
          name="ProviderSearch"
          component={ProviderSearchScreen}
          options={{ title: "Find a provider" }}
        />
        <Stack.Screen
          name="ProviderDetail"
          component={ProviderDetailScreen}
          options={{ title: "Provider" }}
        />
        <Stack.Screen
          name="AppointmentRequest"
          component={AppointmentRequestScreen}
          options={{ title: "Request an appointment" }}
        />
        <Stack.Screen
          name="AppointmentConfirmation"
          component={AppointmentConfirmationScreen}
          options={{
            title: "Appointment saved",
            // No swipe-back to the submitted form: returning to it invites a
            // duplicate record for the same visit.
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="BookingIdentity"
          component={BookingIdentityScreen}
          options={{ title: "Your details" }}
        />
        <Stack.Screen
          name="AppointmentList"
          component={AppointmentListScreen}
          options={{ title: "My Appointments" }}
        />
        <Stack.Screen
          name="MedicationReminders"
          component={MedicationRemindersScreen}
          options={{ title: "Medication Reminders" }}
        />
        <Stack.Screen
          name="ReminderEdit"
          component={ReminderEditScreen}
          options={{ title: "Reminder times" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
