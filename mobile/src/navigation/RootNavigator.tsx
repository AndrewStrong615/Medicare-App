import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "@/screens/HomeScreen";
import { IntakeFollowUpScreen } from "@/screens/intake/IntakeFollowUpScreen";
import { IntakeResultScreen } from "@/screens/intake/IntakeResultScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { MedicationEditScreen } from "@/screens/medications/MedicationEditScreen";
import { MedicationListScreen } from "@/screens/medications/MedicationListScreen";
import { MedicationRemindersScreen } from "@/screens/medication-reminders/MedicationRemindersScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { SymptomIntakeScreen } from "@/screens/intake/SymptomIntakeScreen";
import { colors } from "@/theme";
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

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.textPrimary },
          headerTintColor: colors.accent,
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
          name="MedicationEdit"
          component={MedicationEditScreen}
          options={{ title: "Medication" }}
        />
        <Stack.Screen
          name="MedicationReminders"
          component={MedicationRemindersScreen}
          options={{ title: "Medication Reminders" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
